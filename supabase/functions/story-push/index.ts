// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ONESIGNAL_APP_ID = Deno.env.get('ONESIGNAL_APP_ID') ?? '';
const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY') ?? '';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://guttahutte.lovable.app';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const j = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    // Require caller identity
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return j({ error: 'missing_auth' }, 401);
    const jwt = authHeader.replace('Bearer ', '');
    const authClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) return j({ error: 'invalid_auth' }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Approved-member gate: JWT alone is not enough for private app data.
    const { data: approved, error: apprErr } = await admin.rpc(
      'is_approved_member', { _uid: callerId },
    );
    if (apprErr || approved !== true) return j({ error: 'not_approved' }, 403);

    const body = await req.json().catch(() => ({}));
    const storyId = String(body?.story_id ?? '');
    if (!storyId) return j({ error: 'story_id_required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Load story + verify ownership
    const { data: story, error: sErr } = await admin
      .from('stories')
      .select('id, user_id, type')
      .eq('id', storyId)
      .maybeSingle();
    if (sErr || !story) return j({ error: 'story_not_found' }, 404);
    if (story.user_id !== callerId) return j({ error: 'forbidden' }, 403);

    const { data: profile } = await admin
      .from('profiles')
      .select('nickname, full_name')
      .eq('id', callerId)
      .maybeSingle();
    const name = profile?.nickname || profile?.full_name || 'Noen';

    // Recipients: distinct user_id from push_tokens excluding the sender.
    // Client calls OneSignal.login(user.id), so external_id === user_id.
    const { data: tokens } = await admin
      .from('push_tokens')
      .select('user_id, player_id')
      .neq('user_id', callerId);
    const externalIds = Array.from(new Set(
      (tokens ?? [])
        .filter((t: any) => t.player_id && t.user_id)
        .map((t: any) => String(t.user_id))
    ));
    if (externalIds.length === 0) return j({ sent: 0 });

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      return j({ error: 'onesignal_not_configured' }, 500);
    }

    const dedupeKey = `story:${storyId}`;
    const { error: claimError } = await admin.from('notification_dispatches').insert({
      dedupe_key: dedupeKey,
      kind: 'story',
      source_id: storyId,
      event_type: 'created',
    });
    if (claimError?.code === '23505') return j({ sent: 0, reason: 'already_dispatched' });
    if (claimError) throw claimError;

    const heading = '📸 Ny story';
    const message = `${name} har lagt ut en ${story.type === 'video' ? 'video' : 'bilde'}-story`;
    const url = `${APP_URL}/historier?story=${storyId}`;

    const res = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_aliases: { external_id: externalIds },
        target_channel: 'push',
        headings: { en: heading, no: heading },
        contents: { en: message, no: message },
        url,
        data: { kind: 'new_story', story_id: storyId },
        // Dedupe / collapse repeated story pushes so a burst doesn't spam.
        collapse_id: `story-${storyId}`,
        android_group: 'stories',
        thread_id: 'stories',
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn('[story-push] onesignal error', res.status, text);
      await admin.from('notification_dispatches').delete().eq('dedupe_key', dedupeKey);
      return j({ error: 'onesignal_failed', status: res.status, body: text }, 502);
    }
    await admin
      .from('notification_dispatches')
      .update({ sent_at: new Date().toISOString(), last_error: null })
      .eq('dedupe_key', dedupeKey);
    return j({ sent: externalIds.length, ok: true });
  } catch (e) {
    console.error('[story-push] unexpected', e);
    return j({ error: 'unexpected', detail: String((e as Error)?.message ?? e) }, 500);
  }
});
