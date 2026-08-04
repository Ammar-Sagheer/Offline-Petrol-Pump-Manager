-- =============================================================================
-- 009_any_profiles_exist.sql
--
-- Fixes the setup screen showing up again after the owner signs out.
--
-- anyProfilesExist() (app/_lib/data-service.js) is called from the login page
-- BEFORE anyone is signed in, to decide whether to show the login form or
-- redirect to /admin/setup. It was querying `profiles` directly, but that
-- table's RLS policy only allows reading your OWN row or reading everything
-- as a super_admin (003_functions_and_triggers.sql / 004_rls_policies.sql) -
-- neither applies to a signed-out request, so current_uid() is null and the
-- policy hides every row, including the owner's. The query always came back
-- empty, so the app thought setup had never been done.
--
-- The fix is the same pattern already used for verify_login() and
-- create_first_owner() in 002_identity_and_sessions.sql: a SECURITY DEFINER
-- function that answers one narrow, pre-login question - not a general read
-- of the table - without needing RLS to let a signed-out request through.
-- =============================================================================

create or replace function public.any_profiles_exist()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles);
$$;

comment on function public.any_profiles_exist() is
  'Whether setup has been completed yet. Used by the login page to decide '
  'between showing the login form and redirecting to /admin/setup - answers '
  'only true/false, never which accounts exist, so it is safe before sign in.';

revoke execute on function public.any_profiles_exist() from public;
grant  execute on function public.any_profiles_exist() to app_user;
