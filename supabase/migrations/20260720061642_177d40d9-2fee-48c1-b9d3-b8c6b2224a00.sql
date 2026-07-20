-- CREATE POLICY on a table you don't own is allowed for superuser-privileged
-- migration roles on managed Supabase. ENABLE RLS is skipped because it's
-- already enabled on realtime.messages by default in modern Supabase.

DROP POLICY IF EXISTS "chat_typing_broadcast_read" ON realtime.messages;
DROP POLICY IF EXISTS "chat_typing_broadcast_send" ON realtime.messages;

CREATE POLICY "chat_typing_broadcast_read"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = 'chat-typing-00000000-0000-0000-0000-000000000001'
    AND extension = 'broadcast'
  );

CREATE POLICY "chat_typing_broadcast_send"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    realtime.topic() = 'chat-typing-00000000-0000-0000-0000-000000000001'
    AND extension = 'broadcast'
  );