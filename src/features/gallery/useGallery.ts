/**
 * Gallery hooks: feed (cursor paginated + incremental realtime), likes
 * (optimistic + per-item request identity), comments (client_id idempotency
 * + pagination + retry).
 *
 * Slice 4B: stable dependencies, per-item like reconciliation, comment
 * pagination.
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTrip } from "@/contexts/TripContext";

import type {
  AnyComment,
  CommentCursor,
  CommentRow,
  GalleryRow,
  OptimisticComment,
  ProfileLite,
} from "./types";
import {
  applyDelete,
  applyInsert,
  applyOptimisticComment,
  applyOptimisticLike,
  applyUpdate,
  cursorFromLast,
  cursorPredicate,
  isUniqueViolation,
  markCommentFailed,
  markCommentRetrying,
  mergeCursorPage,
  mergeOlderCommentPage,
  reconcileLikeOverride,
  replaceOptimisticWithServer,
  type LikeAction,
} from "./helpers";
import { signBatch } from "@/lib/mediaUrl";

const PAGE_SIZE = 30;
const COMMENT_PAGE_SIZE = 30;

type LoadState = "idle" | "loading" | "loaded" | "error";

// ─── Feed ──────────────────────────────────────────────────────────────────
export interface UseGalleryFeed {
  items: GalleryRow[];
  profiles: Record<string, ProfileLite>;
  likes: ReadonlyMap<string, ReadonlySet<string>>;
  commentCounts: ReadonlyMap<string, number>;
  state: LoadState;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  applyLocalDelete: (id: string) => void;
}

export function useGalleryFeed(): UseGalleryFeed {
  // Turgrense: galleriet viser kun media for valgt tur. Alle spørringer og
  // Realtime-kanaler er scopet til selectedTripId, og resultater fra en
  // tidligere tur forkastes via generasjonstelleren.
  const { selectedTripId } = useTrip();
  const [items, setItems] = React.useState<GalleryRow[]>([]);
  const [profiles, setProfiles] = React.useState<Record<string, ProfileLite>>({});
  const [likes, setLikes] = React.useState<Map<string, Set<string>>>(new Map());
  const [commentCounts, setCommentCounts] = React.useState<Map<string, number>>(new Map());
  const [state, setState] = React.useState<LoadState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const tripRef = React.useRef<string | null>(selectedTripId);
  tripRef.current = selectedTripId;
  const generationRef = React.useRef(0);


  // Refs mirror current state for use inside stable callbacks so we don't
  // recreate loadPage/refresh on every profiles update — that was the source
  // of the mount-time refresh loop.
  const itemsRef = React.useRef(items);
  itemsRef.current = items;
  const profilesRef = React.useRef(profiles);
  profilesRef.current = profiles;
  const pendingProfileFetchRef = React.useRef<Set<string>>(new Set());

  // Stable — never recreated after mount. Reads from refs, writes via setter.
  const loadProfiles = React.useCallback(async (userIds: readonly string[]) => {
    if (userIds.length === 0) return;
    const missing = userIds.filter(
      (id) => id && !profilesRef.current[id] && !pendingProfileFetchRef.current.has(id),
    );
    if (missing.length === 0) return;
    for (const id of missing) pendingProfileFetchRef.current.add(id);
    try {
      const { data, error: err } = await supabase
        .from("profiles").select("id, nickname, full_name, avatar_url").in("id", missing);
      if (err) throw err;
      setProfiles((p) => {
        const next = { ...p };
        for (const row of (data || []) as ProfileLite[]) next[row.id] = row;
        return next;
      });
    } finally {
      for (const id of missing) pendingProfileFetchRef.current.delete(id);
    }
  }, []);

  const loadPage = React.useCallback(async (opts: { reset: boolean }) => {
    const tripAtStart = tripRef.current;
    if (!tripAtStart) {
      setItems([]); setHasMore(false);
      return;
    }
    const gen = ++generationRef.current;
    const cursor = opts.reset ? null : cursorFromLast(itemsRef.current);
    let q = supabase.from("gallery_items").select("*")
      .eq("trip_id" as never, tripAtStart as never)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);
    if (cursor) q = q.or(cursorPredicate(cursor));
    const { data, error: err } = await q;
    if (gen !== generationRef.current || tripRef.current !== tripAtStart) return;
    if (err) throw err;
    const rows = (data as unknown as GalleryRow[]) || [];

    const mediaByBucket = new Map<GalleryRow["storage_bucket"], string[]>();
    for (const row of rows) {
      const paths = mediaByBucket.get(row.storage_bucket) ?? [];
      paths.push(row.thumbnail_path || row.storage_path);
      mediaByBucket.set(row.storage_bucket, paths);
    }
    void Promise.all(Array.from(mediaByBucket, ([bucket, paths]) => signBatch(bucket, paths))).catch(() => undefined);
    setHasMore(rows.length >= PAGE_SIZE);

    const merged = opts.reset ? rows : mergeCursorPage(itemsRef.current, rows);
    setItems(merged);

    const itemIds = rows.map((r) => r.id);
    const userIds = [...new Set(rows.map((r) => r.uploaded_by))];
    const [likeRes, cntRes] = await Promise.all([
      itemIds.length
        ? supabase.from("gallery_likes").select("item_id, user_id").in("item_id", itemIds)
        : Promise.resolve({ data: [] as { item_id: string; user_id: string }[], error: null }),
      itemIds.length
        ? supabase.from("gallery_comments").select("item_id").in("item_id", itemIds)
        : Promise.resolve({ data: [] as { item_id: string }[], error: null }),
    ]);
    if (gen !== generationRef.current || tripRef.current !== tripAtStart) return;
    if (likeRes.error) throw likeRes.error;
    if (cntRes.error) throw cntRes.error;


    // Replace only the entries for the refreshed IDs; preserve older items.
    setLikes((prev) => {
      const next = new Map<string, Set<string>>();
      for (const [k, v] of prev) next.set(k, new Set(v));
      for (const id of itemIds) next.set(id, new Set());
      for (const l of likeRes.data as { item_id: string; user_id: string }[]) {
        next.get(l.item_id)!.add(l.user_id);
      }
      return next;
    });
    setCommentCounts((prev) => {
      const next = new Map(prev);
      for (const id of itemIds) next.set(id, 0);
      for (const c of cntRes.data as { item_id: string }[]) {
        next.set(c.item_id, (next.get(c.item_id) ?? 0) + 1);
      }
      return next;
    });
    void loadProfiles(userIds);
  }, [loadProfiles]);

  const refresh = React.useCallback(async () => {
    setState("loading"); setError(null);
    try { await loadPage({ reset: true }); setState("loaded"); }
    catch (e) {
      console.error(e);
      setError((e as Error).message || "Kunne ikke laste galleri");
      setState("error");
    }
  }, [loadPage]);

  const loadMore = React.useCallback(async () => {
    if (!hasMore || state === "loading") return;
    try { await loadPage({ reset: false }); }
    catch (e) { console.error(e); setError((e as Error).message || "Kunne ikke laste flere"); }
  }, [hasMore, state, loadPage]);

  // Hent på nytt ved mount og hver gang valgt tur endres. Gammel tur tømmes
  // først slik at media fra en annen tur aldri vises.
  React.useEffect(() => {
    setItems([]);
    setLikes(new Map());
    setCommentCounts(new Map());
    setHasMore(true);
    if (!selectedTripId) { setState("loaded"); return; }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTripId]);

  // Incremental realtime — kanal og filter er scopet til valgt tur.
  React.useEffect(() => {
    if (!selectedTripId) return;
    const ch = supabase
      .channel(`gallery-rt-${selectedTripId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "gallery_items", filter: `trip_id=eq.${selectedTripId}` }, (payload) => {
        const row = payload.new as unknown as GalleryRow;
        if (tripRef.current !== selectedTripId) return;
        setItems((cur) => applyInsert(cur, row));
        void loadProfiles([row.uploaded_by]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "gallery_items", filter: `trip_id=eq.${selectedTripId}` }, (payload) => {
        if (tripRef.current !== selectedTripId) return;
        setItems((cur) => applyUpdate(cur, payload.new as unknown as GalleryRow));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "gallery_items" }, (payload) => {
        // DELETE-payload mangler ofte trip_id — vi fjerner bare rader vi
        // allerede viser for valgt tur.
        const oldRow = payload.old as { id?: string };
        if (oldRow?.id) setItems((cur) => applyDelete(cur, oldRow.id!));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "gallery_likes" }, (payload) => {
        const l = payload.new as { item_id: string; user_id: string };
        if (!itemsRef.current.some((i) => i.id === l.item_id)) return;
        setLikes((prev) => applyOptimisticLike(prev, l.item_id, l.user_id, "like"));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "gallery_likes" }, (payload) => {
        const l = payload.old as { item_id?: string; user_id?: string };
        if (!l?.item_id || !l?.user_id) return;
        if (!itemsRef.current.some((i) => i.id === l.item_id)) return;
        setLikes((prev) => applyOptimisticLike(prev, l.item_id!, l.user_id!, "unlike"));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "gallery_comments" }, (payload) => {
        const c = payload.new as { item_id: string };
        if (!itemsRef.current.some((i) => i.id === c.item_id)) return;
        setCommentCounts((prev) => new Map(prev).set(c.item_id, (prev.get(c.item_id) ?? 0) + 1));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "gallery_comments" }, (payload) => {
        const c = payload.old as { item_id?: string };
        if (!c?.item_id) return;
        if (!itemsRef.current.some((i) => i.id === c.item_id)) return;
        setCommentCounts((prev) => new Map(prev).set(c.item_id!, Math.max(0, (prev.get(c.item_id!) ?? 1) - 1)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadProfiles, selectedTripId]);


  const applyLocalDelete = React.useCallback((id: string) => {
    setItems((cur) => applyDelete(cur, id));
  }, []);

  return { items, profiles, likes, commentCounts, state, error, hasMore, loadMore, refresh, applyLocalDelete };
}

// ─── Likes with per-item request identity ─────────────────────────────────
export function useGalleryLikes(
  likes: ReadonlyMap<string, ReadonlySet<string>>,
  userId: string | undefined,
) {
  // Per-item override with intent so we can reconcile item-by-item.
  const [overrides, setOverrides] = React.useState<
    Map<string, { set: Set<string>; intent: LikeAction }>
  >(new Map());
  const reqRef = React.useRef(new Map<string, number>());

  // When the server likes map changes, reconcile ONLY the items whose
  // current server state now matches the optimistic intent. All other
  // overrides remain intact — unrelated realtime traffic cannot drop them.
  React.useEffect(() => {
    if (overrides.size === 0 || !userId) return;
    setOverrides((prev) => {
      let next = prev;
      for (const [itemId] of prev) {
        next = reconcileLikeOverride(next, likes, itemId, userId);
      }
      return next === prev ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [likes, userId]);

  const view = React.useMemo(() => {
    const out = new Map<string, Set<string>>();
    for (const [k, v] of likes) out.set(k, new Set(v));
    for (const [k, v] of overrides) out.set(k, new Set(v.set));
    return out;
  }, [likes, overrides]);

  const toggle = React.useCallback(async (itemId: string) => {
    if (!userId) return;
    const cur = view.get(itemId) ?? new Set<string>();
    const wasLiked = cur.has(userId);
    const action: LikeAction = wasLiked ? "unlike" : "like";
    const nextReq = (reqRef.current.get(itemId) ?? 0) + 1;
    reqRef.current.set(itemId, nextReq);

    // Apply optimistic override for THIS item only.
    setOverrides((prev) => {
      const nxt = new Map<string, { set: Set<string>; intent: LikeAction }>();
      for (const [k, v] of prev) nxt.set(k, { set: new Set(v.set), intent: v.intent });
      const base = new Set(cur);
      if (action === "like") base.add(userId); else base.delete(userId);
      nxt.set(itemId, { set: base, intent: action });
      return nxt;
    });

    try {
      if (wasLiked) {
        const { error } = await supabase.from("gallery_likes").delete()
          .eq("item_id", itemId).eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("gallery_likes")
          .insert({ item_id: itemId, user_id: userId });
        // Postgres 23505 / duplicate — idempotent success.
        if (error && !isUniqueViolation(error)) throw error;
      }
    } catch (e) {
      // Only roll back if THIS request is still the latest for this item.
      if (reqRef.current.get(itemId) !== nextReq) return;
      setOverrides((prev) => {
        const nxt = new Map<string, { set: Set<string>; intent: LikeAction }>();
        for (const [k, v] of prev) if (k !== itemId) nxt.set(k, { set: new Set(v.set), intent: v.intent });
        return nxt;
      });
      throw e;
    }
  }, [userId, view]);

  return { view, toggle };
}

// ─── Comments (paginated, idempotent via client_id) ───────────────────────
export interface UseGalleryComments {
  comments: AnyComment[];
  state: LoadState;
  olderState: LoadState;
  hasOlder: boolean;
  error: string | null;
  submit: (body: string) => Promise<void>;
  retry: (clientId: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reload: () => Promise<void>;
  loadOlder: () => Promise<void>;
}

export function useGalleryComments(itemId: string | null, userId: string | undefined): UseGalleryComments {
  const [comments, setComments] = React.useState<AnyComment[]>([]);
  const [state, setState] = React.useState<LoadState>("idle");
  const [olderState, setOlderState] = React.useState<LoadState>("idle");
  const [hasOlder, setHasOlder] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const commentsRef = React.useRef(comments);
  commentsRef.current = comments;

  const reload = React.useCallback(async () => {
    if (!itemId) return;
    setState("loading"); setError(null);
    try {
      // Newest page first, then reverse for ascending display.
      const { data, error: err } = await supabase
        .from("gallery_comments")
        .select("*")
        .eq("item_id", itemId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(COMMENT_PAGE_SIZE);
      if (err) throw err;
      const rows = ((data || []) as CommentRow[]).slice().reverse();
      setHasOlder(rows.length >= COMMENT_PAGE_SIZE);
      // Preserve pending/failed optimistic drafts across reload.
      const drafts = commentsRef.current.filter((c) => c.kind === "optimistic");
      setComments([
        ...rows.map((r) => ({ kind: "server" as const, ...r })),
        ...drafts,
      ]);
      setState("loaded");
    } catch (e) {
      console.error(e);
      setError((e as Error).message || "Kunne ikke laste kommentarer");
      setState("error");
    }
  }, [itemId]);

  const loadOlder = React.useCallback(async () => {
    if (!itemId) return;
    if (olderState === "loading" || !hasOlder) return;
    // Find oldest server row for cursor.
    let cursor: CommentCursor | null = null;
    for (const c of commentsRef.current) {
      if (c.kind === "server") { cursor = { created_at: c.created_at, id: c.id }; break; }
    }
    if (!cursor) return;
    setOlderState("loading"); setError(null);
    try {
      const { data, error: err } = await supabase
        .from("gallery_comments")
        .select("*")
        .eq("item_id", itemId)
        .or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(COMMENT_PAGE_SIZE);
      if (err) throw err;
      const rows = (data || []) as CommentRow[];
      setHasOlder(rows.length >= COMMENT_PAGE_SIZE);
      setComments((cur) => mergeOlderCommentPage(cur, rows));
      setOlderState("loaded");
    } catch (e) {
      console.error(e);
      setError((e as Error).message || "Kunne ikke laste eldre");
      setOlderState("error");
    }
  }, [itemId, hasOlder, olderState]);

  React.useEffect(() => {
    setComments([]); setHasOlder(false); setOlderState("idle");
    if (itemId) void reload();
  }, [itemId, reload]);

  // Realtime — incremental.
  React.useEffect(() => {
    if (!itemId) return;
    const ch = supabase.channel(`gallery-comments-${itemId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "gallery_comments", filter: `item_id=eq.${itemId}` },
        (payload) => {
          const row = payload.new as CommentRow;
          setComments((cur) => replaceOptimisticWithServer(cur, row));
        })
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "gallery_comments", filter: `item_id=eq.${itemId}` },
        (payload) => {
          const oldRow = payload.old as { id?: string };
          if (!oldRow?.id) return;
          setComments((cur) => cur.filter((c) => !(c.kind === "server" && c.id === oldRow.id!)));
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [itemId]);

  const doInsert = React.useCallback(async (clientId: string, body: string) => {
    if (!itemId || !userId) throw new Error("no user");
    const { data, error: err } = await supabase.from("gallery_comments").insert({
      item_id: itemId, user_id: userId, body, client_id: clientId,
    }).select("*").maybeSingle();
    if (err) {
      // Idempotent: unique-violation on (user_id, client_id) means the row
      // already exists from a prior attempt. Fetch and reconcile.
      if (isUniqueViolation(err)) {
        const { data: existing } = await supabase.from("gallery_comments")
          .select("*").eq("user_id", userId).eq("client_id", clientId).maybeSingle();
        if (existing) setComments((cur) => replaceOptimisticWithServer(cur, existing as CommentRow));
        return;
      }
      throw err;
    }
    // If realtime hasn't landed yet, reconcile locally to avoid flicker.
    if (data) setComments((cur) => replaceOptimisticWithServer(cur, data as CommentRow));
  }, [itemId, userId]);

  const submit = React.useCallback(async (raw: string) => {
    if (!itemId || !userId) return;
    const body = raw.trim().slice(0, 500);
    if (!body) return;
    const clientId = crypto.randomUUID();
    const draft: OptimisticComment = {
      clientId, item_id: itemId, user_id: userId, body,
      created_at: new Date().toISOString(), state: "pending",
    };
    setComments((cur) => applyOptimisticComment(cur, draft));
    try { await doInsert(clientId, body); }
    catch (e) {
      setComments((cur) => markCommentFailed(cur, clientId, (e as Error).message || "Feil"));
    }
  }, [itemId, userId, doInsert]);

  const retry = React.useCallback(async (clientId: string) => {
    if (!itemId || !userId) return;
    const target = commentsRef.current.find((c) => c.kind === "optimistic" && c.clientId === clientId);
    if (!target || target.kind !== "optimistic") return;
    setComments((cur) => markCommentRetrying(cur, clientId));
    try { await doInsert(clientId, target.body); }
    catch (e) {
      setComments((cur) => markCommentFailed(cur, clientId, (e as Error).message || "Feil"));
    }
  }, [itemId, userId, doInsert]);

  const remove = React.useCallback(async (id: string) => {
    const { error: err } = await supabase.from("gallery_comments").delete().eq("id", id);
    if (err) throw err;
  }, []);

  return { comments, state, olderState, hasOlder, error, submit, retry, remove, reload, loadOlder };
}
