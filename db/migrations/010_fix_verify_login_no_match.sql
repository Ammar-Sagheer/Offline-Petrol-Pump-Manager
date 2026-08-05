-- =============================================================================
-- 010_fix_verify_login_no_match.sql
--
-- verify_login() was declared `returns public.profiles` (a single composite,
-- not a set). A SQL-language function with that return type returns SQL NULL
-- when its body's SELECT matches zero rows - correct so far - but calling it
-- as `select * from verify_login(...)` (a function in the FROM clause) does
-- NOT turn that NULL into zero result rows. Postgres materializes it as ONE
-- row with every column NULL.
--
-- auth.js's login() only checked `if (!profile) return null`, which a JS
-- object of all-null fields does not satisfy (it's still a truthy object).
-- So on every wrong email/password, login() proceeded to call
-- create_session(profile.id) with profile.id = null, which crashed the whole
-- request with a NOT NULL constraint violation on sessions.user_id instead
-- of just rejecting the login - reproduced directly: `select * from
-- verify_login('nonexistent@example.com', 'wrongpassword')` returned
-- rowCount 1, every column null.
--
-- Fix: declare it `returns setof public.profiles` instead. The function body
-- is unchanged - only the SETOF makes "zero rows matched" actually mean zero
-- rows returned, which is what auth.js's `rows[0] ?? null` already assumed.
-- =============================================================================

-- CREATE OR REPLACE cannot change a function's return type (composite ->
-- setof composite counts as one); the old signature has to go first.
drop function if exists public.verify_login(text, text);

create function public.verify_login(p_email text, p_password text)
returns setof public.profiles
language sql
security definer
set search_path = public
as $$
  select p.*
    from public.profiles p
   where p.email = lower(btrim(p_email))
     and p.is_active
     and p.password_hash = crypt(p_password, p.password_hash);
$$;

comment on function public.verify_login(text, text) is
  'Checks a password against the stored hash entirely in SQL. Returns the '
  'matching active profile as a single-row set, or zero rows if the email or '
  'password is wrong - the caller cannot tell which, which is the point. '
  'setof (not a bare composite) so "no match" is genuinely zero rows, not '
  'one row of nulls.';

-- DROP FUNCTION above also drops its grants (004_rls_policies.sql), so they
-- have to be re-applied here rather than just carried over.
revoke execute on function public.verify_login(text, text) from public;
grant execute on function public.verify_login(text, text) to app_user;
