
-- Drop the OLD 3-parameter version of rpc_confirm_shot that causes ambiguity
DROP FUNCTION IF EXISTS public.rpc_confirm_shot(uuid, text, uuid);
