import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = (Deno.env.get("APP_URL") || "https://guttahutte.lovable.app").replace(/\/$/, "");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

interface RoomMember {
  id: string;
  name: string;
}

interface RoomPair {
  room: number;
  members: RoomMember[];
}

function secureRandomIndex(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new Error("Invalid random range");
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / maxExclusive) * maxExclusive;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= limit);
  return value[0] % maxExclusive;
}

function shuffled<T>(input: T[]): T[] {
  const result = [...input];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = secureRandomIndex(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function buildPairs(members: RoomMember[]): RoomPair[] {
  const queue = shuffled(members);
  const pairs: RoomPair[] = [];
  let room = 1;
  while (queue.length > 0) {
    const take = queue.length === 3 ? 3 : Math.min(2, queue.length);
    pairs.push({ room, members: queue.splice(0, take) });
    room += 1;
  }
  return pairs;
}

async function sendRoomiePush(
  admin: ReturnType<typeof createClient>,
  oneSignalAppId: string | undefined,
  oneSignalKey: string | undefined,
  drawId: string,
  eventType: "started" | "published",
  heading: string,
  message: string,
): Promise<number> {
  if (!oneSignalAppId || !oneSignalKey) return 0;

  const dedupeKey = `roomie:${drawId}:${eventType}`;
  const { error: claimError } = await admin.from("notification_dispatches").insert({
    dedupe_key: dedupeKey,
    kind: "roomie",
    source_id: drawId,
    event_type: eventType,
  });
  if (claimError?.code === "23505") return 0;
  if (claimError) throw claimError;

  const { data: tokens } = await admin
    .from("push_tokens")
    .select("user_id")
    .not("player_id", "is", null);
  const userIds = Array.from(new Set((tokens || []).map((token) => token.user_id)));
  if (userIds.length === 0) return 0;

  const response = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${oneSignalKey}` },
    body: JSON.stringify({
      app_id: oneSignalAppId,
      include_aliases: { external_id: userIds },
      target_channel: "push",
      headings: { en: heading, no: heading },
      contents: { en: message, no: message },
      url: `${APP_URL}/roomies`,
      data: { kind: "roomie", draw_id: drawId, event_type: eventType },
      ios_badgeType: "Increase",
      ios_badgeCount: 1,
    }),
  });
  if (!response.ok) {
    console.error("roomie OneSignal", response.status, await response.text());
    await admin.from("notification_dispatches").delete().eq("dedupe_key", dedupeKey);
    return 0;
  }
  await admin
    .from("notification_dispatches")
    .update({ sent_at: new Date().toISOString(), last_error: null })
    .eq("dedupe_key", dedupeKey);
  return userIds.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Server configuration missing" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) return json({ error: "Only admin can draw roomies" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "draw") {
      const { data: profiles, error: profileError } = await admin
        .from("profiles")
        .select("id, nickname, full_name")
        .eq("is_active", true)
        .eq("is_banned", false);
      if (profileError) throw profileError;
      if (!profiles || profiles.length < 2) return json({ error: "Need at least 2 users" }, 400);

      const members = profiles.map((profile) => ({
        id: profile.id,
        name: profile.nickname || profile.full_name || "Ukjent",
      }));
      const pairs = buildPairs(members);
      const assignedIds = pairs.flatMap((pair) => pair.members.map((member) => member.id));
      if (new Set(assignedIds).size !== members.length || assignedIds.length !== members.length) {
        throw new Error("Room assignment validation failed");
      }

      const countdownEndsAt = new Date(Date.now() + 15_000).toISOString();
      const { data: draw, error: insertError } = await admin
        .from("roomie_draws")
        .insert({ created_by: user.id, status: "countdown", pairs, countdown_ends_at: countdownEndsAt })
        .select()
        .single();
      if (insertError || !draw) throw insertError || new Error("Could not create draw");

      const pushSent = await sendRoomiePush(
        admin,
        Deno.env.get("ONESIGNAL_APP_ID"),
        Deno.env.get("ONESIGNAL_REST_API_KEY"),
        draw.id,
        "started",
        "🏠 Roomie-trekning!",
        "Romfordelingen starter om 15 sekunder…",
      );
      return json({ success: true, draw, push_sent: pushSent });
    }

    if (action === "finalize") {
      const drawId = typeof body.draw_id === "string" ? body.draw_id : "";
      if (!UUID_RE.test(drawId)) return json({ error: "Invalid draw_id" }, 400);

      const { data: draw, error: updateError } = await admin
        .from("roomie_draws")
        .update({ status: "published" })
        .eq("id", drawId)
        .eq("status", "countdown")
        .lte("countdown_ends_at", new Date().toISOString())
        .select()
        .maybeSingle();
      if (updateError) throw updateError;
      if (!draw) return json({ success: true, reason: "already_finalized_or_not_ready" });

      const pairs = (draw.pairs || []) as unknown as RoomPair[];
      const pairText = pairs
        .map((pair) => `Rom ${pair.room}: ${pair.members.map((member) => member.name).join(" & ")}`)
        .join("\n")
        .slice(0, 500);
      const pushSent = await sendRoomiePush(
        admin,
        Deno.env.get("ONESIGNAL_APP_ID"),
        Deno.env.get("ONESIGNAL_REST_API_KEY"),
        draw.id,
        "published",
        "🏠 Romfordelingen er klar!",
        pairText,
      );
      return json({ success: true, draw, push_sent: pushSent });
    }

    if (action === "reset") {
      const { error } = await admin
        .from("roomie_draws")
        .update({ status: "archived" })
        .in("status", ["countdown", "published"]);
      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (error) {
    console.error("roomie-draw failed", error);
    return json({ error: "Kunne ikke gjennomføre romtrekningen" }, 500);
  }
});
