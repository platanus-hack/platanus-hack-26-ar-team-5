-- Revoke REST-callable EXECUTE on the SECURITY DEFINER trigger function.
-- The trigger itself keeps firing (triggers bypass role-based EXECUTE checks);
-- this only cuts the /rest/v1/rpc/handle_new_user endpoint that the Supabase
-- security linter flagged.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
