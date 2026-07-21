import * as React from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Compact realtime read counts for the currently loaded outgoing messages.
 * The UI only renders the newest seen marker, but keeping counts per message
 * lets the action sheet continue to show the complete list on demand.
 */
export function useReadReceipts(messageIds: string[], currentUserId: string) {
  const [counts, setCounts] = React.useState<Map<string, number>>(new Map());
  const idsKey = messageIds.join(',');

  React.useEffect(() => {
    if (!currentUserId || messageIds.length === 0) {
      setCounts(new Map());
      return;
    }

    let cancelled = false;
    const wanted = new Set(messageIds);

    const load = async () => {
      const { data, error } = await supabase
        .from('chat_reads')
        .select('message_id,user_id')
        .in('message_id', messageIds)
        .neq('user_id', currentUserId);
      if (cancelled || error) return;
      const next = new Map<string, number>();
      for (const row of data || []) {
        next.set(row.message_id, (next.get(row.message_id) ?? 0) + 1);
      }
      setCounts(next);
    };

    void load();
    const channel = supabase
      .channel(`chat-read-counts-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads' }, (payload) => {
        const row = (payload.new || payload.old || {}) as { message_id?: string; user_id?: string };
        if (row.user_id === currentUserId || !row.message_id || !wanted.has(row.message_id)) return;
        // Reload keeps UPDATE/DELETE and reconnect semantics deterministic.
        void load();
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
    // idsKey is the stable dependency for the ordered message-id snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, currentUserId]);

  return counts;
}
