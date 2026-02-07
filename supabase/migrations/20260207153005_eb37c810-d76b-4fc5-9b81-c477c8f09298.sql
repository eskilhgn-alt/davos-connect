
-- Drop the old 2-parameter overload that causes ambiguity
DROP FUNCTION IF EXISTS public.rpc_confirm_shot(uuid, text);
