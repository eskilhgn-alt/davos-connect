/**
 * useMarkAsRead - Hook to mark messages as read in the database
 * Uses IntersectionObserver to detect when messages become visible
 */

import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useMarkAsRead() {
  const { user, profile } = useAuth();
  const markedRef = React.useRef<Set<string>>(new Set());
  const pendingRef = React.useRef<Set<string>>(new Set());
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPending = React.useCallback(async () => {
    if (!user) return;

    const messageIds = Array.from(pendingRef.current);
    if (messageIds.length === 0) return;

    pendingRef.current.clear();

    try {
      // Upsert to avoid duplicates
      const inserts = messageIds.map((id) => ({
        message_id: id,
        user_id: user.id,
        read_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("chat_reads")
        .upsert(inserts, {
          onConflict: "message_id,user_id",
          ignoreDuplicates: true,
        });

      if (error) {
        console.warn("Failed to mark messages as read:", error);
        // Add back to pending for retry
        messageIds.forEach((id) => pendingRef.current.add(id));
      } else {
        // Mark as done
        messageIds.forEach((id) => markedRef.current.add(id));
      }
    } catch (err) {
      console.warn("Mark as read error:", err);
    }
  }, [user]);

  const markAsRead = React.useCallback(
    (messageId: string, senderId: string) => {
      // Don't mark own messages
      if (!user || senderId === user.id) return;

      // Already marked or pending
      if (markedRef.current.has(messageId) || pendingRef.current.has(messageId)) {
        return;
      }

      pendingRef.current.add(messageId);

      // Debounce the flush
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(flushPending, 500);
    },
    [user, flushPending]
  );

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // Flush any remaining
      flushPending();
    };
  }, [flushPending]);

  return { markAsRead };
}