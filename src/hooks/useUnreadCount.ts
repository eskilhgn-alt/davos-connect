/**
 * useUnreadCount - Track number of unread chat messages
 * Compares latest messages against chat_reads for current user
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const DEFAULT_THREAD_ID = "00000000-0000-0000-0000-000000000001";

export function useUnreadCount(): number {
  const { user } = useAuth();
  const [count, setCount] = React.useState(0);

  const refresh = React.useCallback(async () => {
    if (!user) { setCount(0); return; }

    // Get IDs of messages the user has read
    const { data: reads } = await supabase
      .from("chat_reads")
      .select("message_id")
      .eq("user_id", user.id);

    const readIds = new Set((reads || []).map((r) => r.message_id));

    // Get recent messages not sent by current user
    const { data: messages } = await supabase
      .from("messages")
      .select("id, sender_id")
      .eq("thread_id", DEFAULT_THREAD_ID)
      .is("deleted_at", null)
      .neq("sender_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    const unread = (messages || []).filter((m) => !readIds.has(m.id)).length;
    setCount(unread);
  }, [user]);

  React.useEffect(() => {
    refresh();

    // Subscribe to new messages and reads
    const msgChannel = supabase
      .channel("unread-messages")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "messages",
        filter: `thread_id=eq.${DEFAULT_THREAD_ID}`,
      }, () => refresh())
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "chat_reads",
      }, () => refresh())
      .subscribe();

    return () => { supabase.removeChannel(msgChannel); };
  }, [refresh]);

  return count;
}
