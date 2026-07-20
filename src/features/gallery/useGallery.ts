/**
 * Gallery hooks: feed (cursor paginated + incremental realtime), likes
 * (optimistic + request identity), comments (optimistic + retry).
 *
 * All heavy logic lives in ./helpers.ts and is unit-tested there. These hooks
 * are the thin Supabase / React glue.
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AnyComment, CommentRow, GalleryRow, OptimisticComment, ProfileLite } from "./types";
import {
  applyDelete,
  applyInsert,
  applyOptimisticComment,
  applyOptimisticLike,
  applyUpdate,
  cursorFromLast,
  cursorPredicate,
  markCommentFailed,
  markCommentRetrying,
  mergeCursorPage,
  replaceOptimisticWithServer,
  shouldApplyLikeResult,
} from "./helpers";

const PAGE_SIZE = 30;

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
  const [items, setItems] = React.useState<GalleryRow[]>([]);
  const [profiles, setProfiles] = React.useState<Record<string, ProfileLite>>({});
  const [likes, setLikes] = React.useState<Map<string, Set<string>>>(new Map());
  const [commentCounts, setCommentCounts] = React.useState<Map<string, number>>(new Map());
  const [state, setState] = React.useState<LoadState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  const loadProfiles = React.useCallback(async (userIds: string[]) => {
    if (userIds.length === 0) return;
    const missing = userIds.filter((id) => !profiles[id]);
    if (missing.length === 0) return;
    const { data, error: err } = await supabase
      .from("profiles").select("id, nickname, full_name, avatar_url").in("id", missing);
    if (err) throw err;
    setProfiles((p) => {
      const next = { ...p };
      for (const row of (data || []) as ProfileLite[]) next[row.id] = row;
      return next;
    });
  }, [profiles]);

  const loadPage = React.useCallback(async (opts: { reset: boolean }) => {
    const cursor = opts.reset ? null : cursorFromLast(itemsRef.current);
    let q = supabase.from("gallery_items").select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);
    if (cursor) q = q.or(cursorPredicate(cursor));
    const { data, error: err } = await q;
    if (err) throw err;
    const rows = (data as unknown as GalleryRow[]) || [];
    if (rows.length < PAGE_SIZE) setHasMore(false);
    else setHasMore(true);

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
    if (likeRes.error) throw likeRes.error;
    if (cntRes.error) throw cntRes.error;
    setLikes((prev) => {
      const next = new Map<string, Set<string>>();
      for (const [k, v] of prev) next.set(k, new Set(v));
      for (const l of likeRes.data as { item_id: string; user_id: string }[]) {
        (next.get(l.item_id) ?? next.set(l.item_id, new Set()).get(l.item_id)!).add(l.user_id);
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
    await loadProfiles(userIds);
  }, [loadProfiles]);

  const refresh = React.useCallback(async () => {
    setState("loading"); setError(null);
    try { await loadPage({ reset: true }); setState("loaded"); }
    catch (e) { console.error(e); setError((e as Error).message || "Kunne ikke laste galleri"); setState("error"); }
  }, [loadPage]);

  const loadMore = React.useCallback(async () => {
    if (!hasMore || state === "loading") return;
    try { await loadPage({ reset: false }); }
    catch (e) { console.error(e); setError((e as Error).message || "Kunne ikke laste flere"); }
  }, [hasMore, state, loadPage]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  // Incremental realtime.
  React.useEffect(() => {
    const ch = supabase
      .channel("gallery-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "gallery_items" }, (payload) => {
        const row = payload.new as unknown as GalleryRow;
        setItems((cur) => applyInsert(cur, row));
        void loadProfiles([row.uploaded_by]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "gallery_items" }, (payload) => {
        setItems((cur) => applyUpdate(cur, payload.new as unknown as GalleryRow));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "gallery_items" }, (payload) => {
        const oldRow = payload.old as { id?: string };
        if (oldRow?.id) setItems((cur) => applyDelete(cur, oldRow.id!));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "gallery_likes" }, (payload) => {
        const l = payload.new as { item_id: string; user_id: string };
        setLikes((prev) => applyOptimisticLike(prev, l.item_id, l.user_id, "like"));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "gallery_likes" }, (payload) => {
        const l = payload.old as { item_id?: string; user_id?: string };
        if (l?.item_id && l?.user_id) setLikes((prev) => applyOptimisticLike(prev, l.item_id!, l.user_id!, "unlike"));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "gallery_comments" }, (payload) => {
        const c = payload.new as { item_id: string };
        setCommentCounts((prev) => new Map(prev).set(c.item_id, (prev.get(c.item_id) ?? 0) + 1));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "gallery_comments" }, (payload) => {
        const c = payload.old as { item_id?: string };
        if (c?.item_id) setCommentCounts((prev) => new Map(prev).set(c.item_id!, Math.max(0, (prev.get(c.item_id!) ?? 1) - 1)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadProfiles]);

  const applyLocalDelete = React.useCallback((id: string) => {
    setItems((cur) => applyDelete(cur, id));
  }, []);

  return { items, profiles, likes, commentCounts, state, error, hasMore, loadMore, refresh, applyLocalDelete };
}

// ─── Likes with request identity ──────────────────────────────────────────
export function useGalleryLikes(
  likes: ReadonlyMap<string, ReadonlySet<string>>,
  userId: string | undefined,
) {
  const [local, setLocal] = React.useState<Map<string, Set<string>>>(new Map());
  const reqRef = React.useRef(new Map<string, number>());
  const currentRef = React.useRef(new Map<string, number>());

  // Bump request identity when server state changes for an item (any realtime
  // update) — this lets stale in-flight responses lose the race.
  React.useEffect(() => { setLocal(new Map()); }, [likes]);

  const view = React.useMemo(() => {
    // Local overrides server for items the user just toggled.
    const out = new Map<string, Set<string>>();
    for (const [k, v] of likes) out.set(k, new Set(v));
    for (const [k, v] of local) out.set(k, new Set(v));
    return out;
  }, [likes, local]);

  const toggle = React.useCallback(async (itemId: string) => {
    if (!userId) return;
    const cur = view.get(itemId) ?? new Set<string>();
    const wasLiked = cur.has(userId);
    const action = wasLiked ? "unlike" : "like";
    const nextReq = (reqRef.current.get(itemId) ?? 0) + 1;
    reqRef.current.set(itemId, nextReq);
    currentRef.current.set(itemId, nextReq);
    const optimistic = applyOptimisticLike(view, itemId, userId, action);
    setLocal((prev) => {
      const next = new Map<string, Set<string>>();
      for (const [k, v] of prev) next.set(k, new Set(v));
      next.set(itemId, optimistic.get(itemId) ?? new Set());
      return next;
    });
    try {
      if (wasLiked) {
        const { error } = await supabase.from("gallery_likes").delete()
          .eq("item_id", itemId).eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("gallery_likes")
          .insert({ item_id: itemId, user_id: userId });
        // duplicate-key: someone/two devices already liked — treat as success.
        if (error && !/duplicate/i.test(error.message)) throw error;
      }
    } catch (e) {
      if (!shouldApplyLikeResult(currentRef.current.get(itemId) ?? 0, nextReq)) return;
      // Rollback local override.
      setLocal((prev) => {
        const next = new Map<string, Set<string>>();
        for (const [k, v] of prev) if (k !== itemId) next.set(k, new Set(v));
        return next;
      });
      throw e;
    }
  }, [userId, view]);

  return { view, toggle };
}

// ─── Comments ─────────────────────────────────────────────────────────────
export interface UseGalleryComments {
  comments: AnyComment[];
  state: LoadState;
  error: string | null;
  submit: (body: string) => Promise<void>;
  retry: (clientId: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

export function useGalleryComments(itemId: string | null, userId: string | undefined): UseGalleryComments {
  const [comments, setComments] = React.useState<AnyComment[]>([]);
  const [state, setState] = React.useState<LoadState>("idle");
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    if (!itemId) return;
    setState("loading"); setError(null);
    try {
      const { data, error: err } = await supabase.from("gallery_comments")
        .select("*").eq("item_id", itemId).order("created_at", { ascending: true });
      if (err) throw err;
      const rows = (data as CommentRow[]) || [];
      setComments(rows.map((r) => ({ kind: "server" as const, ...r })));
      setState("loaded");
    } catch (e) {
      console.error(e); setError((e as Error).message || "Kunne ikke laste kommentarer"); setState("error");
    }
  }, [itemId]);

  React.useEffect(() => { setComments([]); if (itemId) void reload(); }, [itemId, reload]);

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
    const { error: err } = await supabase.from("gallery_comments").insert({
      item_id: itemId, user_id: userId, body,
    });
    if (err) throw err;
    // realtime INSERT will replace the optimistic entry.
    return clientId;
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
    const target = comments.find((c) => c.kind === "optimistic" && c.clientId === clientId);
    if (!target || target.kind !== "optimistic") return;
    setComments((cur) => markCommentRetrying(cur, clientId));
    try { await doInsert(clientId, target.body); }
    catch (e) {
      setComments((cur) => markCommentFailed(cur, clientId, (e as Error).message || "Feil"));
    }
  }, [itemId, userId, comments, doInsert]);

  const remove = React.useCallback(async (id: string) => {
    const { error: err } = await supabase.from("gallery_comments").delete().eq("id", id);
    if (err) throw err;
  }, []);

  return { comments, state, error, submit, retry, remove, reload };
}
