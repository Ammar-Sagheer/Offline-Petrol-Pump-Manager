-- =============================================================================
-- 002_identity_and_sessions.sql
--
-- Replaces what Supabase Auth (GoTrue) did in the reference app: verifying a
-- password, issuing a session, and telling RLS who is asking.
--
-- THE SHAPE OF THE PROBLEM. Every RLS policy and role-helper in the reference
-- app calls auth.uid(), a claim GoTrue puts into a JWT it verifies on every
-- request. There is no GoTrue here, so current_uid() below reads a Postgres
-- session variable instead - one the app sets, per request, with
-- `SET LOCAL app.current_user_id = '<uuid>'`, after it has already verified a
-- signed session cookie against the sessions table. RLS itself is untouched:
-- it still runs, still denies by default, still cannot be bypassed by
-- application code. Only where it gets its identity from has changed.
--
-- THE LOGIN CHICKEN-AND-EGG. Checking a password happens BEFORE current_uid()
-- has anything to return - that is exactly what login is for. verify_login()
-- below is SECURITY DEFINER (it runs with the table owner's rights, bypassing
-- RLS) for precisely that reason, the same way GoTrue's own internal queries
-- against auth.users never went through RLS either. The password itself is
-- never compared in application code: pgcrypto's crypt() does it in SQL, so a
-- password hash never has to leave the database, let alone be sent to Node.
-- =============================================================================

create or replace function public.current_uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

comment on function public.current_uid() is
  'The signed-in user for this request, from a session variable the app sets '
  'after verifying the session cookie - the local equivalent of Supabase''s '
  'auth.uid(). Null if nothing was set (no session, or a background job).';

-- ---------------------------------------------------------------------------
-- sessions - one row per signed-in browser tab's session cookie.
--
-- Deliberately NOT reachable through RLS at all: nothing selects from this
-- table directly, only through the SECURITY DEFINER functions below, the same
-- way auth.users was never exposed to PostgREST. id is the value stored (signed)
-- in the cookie, so it needs to be unguessable - gen_random_uuid() is fine, but
-- treat it as a bearer token, not a display value.
-- ---------------------------------------------------------------------------
create table public.sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index sessions_user_id_idx on public.sessions (user_id);
create index sessions_expires_at_idx on public.sessions (expires_at);

-- ---------------------------------------------------------------------------
-- verify_login - checks an email/password pair, returns the profile if it
-- matches an active account, null otherwise.
--
-- crypt(password, hash) recomputes the hash using the salt and algorithm
-- embedded in the stored hash, so this works regardless of the bcrypt cost
-- factor create_staff_login() used when the password was set.
-- ---------------------------------------------------------------------------
create or replace function public.verify_login(p_email text, p_password text)
returns public.profiles
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
  'matching active profile, or no rows if the email or password is wrong - '
  'the caller cannot tell which, which is the point.';

-- ---------------------------------------------------------------------------
-- create_session / session_user_id / delete_session
--
-- The three operations login, request auth, and logout need. All SECURITY
-- DEFINER for the same reason as verify_login: the sessions table has no RLS
-- policies opened to the app's own role at all.
-- ---------------------------------------------------------------------------
create or replace function public.create_session(p_user_id uuid, p_ttl interval default interval '30 days')
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.sessions (user_id, expires_at)
  values (p_user_id, now() + p_ttl)
  returning id;
$$;

create or replace function public.session_user_id(p_session_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id
    from public.sessions
   where id = p_session_id
     and expires_at > now();
$$;

create or replace function public.delete_session(p_session_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.sessions where id = p_session_id;
$$;

comment on function public.session_user_id(uuid) is
  'Resolves a session cookie to a user id, or null if it does not exist or has '
  'expired. The app calls this once per request, then SETs app.current_user_id '
  'from the result for everything else the request does.';

-- ---------------------------------------------------------------------------
-- create_staff_login / change_password
--
-- The only two places a plaintext password crosses into SQL. Both hash with
-- gen_salt('bf') (bcrypt via pgcrypto) so a stolen database dump never exposes
-- a login as anything more than an unusable hash.
-- ---------------------------------------------------------------------------
create or replace function public.create_staff_login(
  p_email     text,
  p_full_name text,
  p_password  text,
  p_role      public.user_role default 'data_entry'
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may create a login' using errcode = '42501';
  end if;

  if p_password is null or length(p_password) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;

  insert into public.profiles (email, password_hash, full_name, role)
  values (lower(btrim(p_email)), crypt(p_password, gen_salt('bf')), btrim(p_full_name), p_role)
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.change_password(p_current_password text, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := public.current_uid();
  v_ok boolean;
begin
  if v_id is null then
    raise exception 'You are signed out. Please sign in again.' using errcode = '28000';
  end if;

  if p_new_password is null or length(p_new_password) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;

  select (password_hash = crypt(p_current_password, password_hash))
    into v_ok
    from public.profiles
   where id = v_id;

  if not v_ok then
    raise exception 'Current password is incorrect.';
  end if;

  update public.profiles
     set password_hash = crypt(p_new_password, gen_salt('bf'))
   where id = v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The very first login. Same rule GoTrue's signup enforced implicitly by there
-- being no data yet - this app has no public signup, ever. This function only
-- succeeds once: as soon as one profile exists it refuses, and the first-run
-- setup screen (app/admin/setup) is the only caller.
-- ---------------------------------------------------------------------------
create or replace function public.create_first_owner(
  p_email     text,
  p_full_name text,
  p_password  text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if exists (select 1 from public.profiles) then
    raise exception 'Setup has already been completed.' using errcode = '42710';
  end if;

  if p_password is null or length(p_password) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;

  insert into public.profiles (email, password_hash, full_name, role)
  values (lower(btrim(p_email)), crypt(p_password, gen_salt('bf')), btrim(p_full_name), 'super_admin')
  returning * into v_profile;

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_staff_login - removes a login for good, not just switching it off.
--
-- Requires the ACTING super_admin's own password, re-checked here in SQL the
-- same way change_password() does. Deactivating (a plain UPDATE is_active =
-- false through the normal RLS policy) is reversible and is the button the UI
-- leads with; this is for accounts created by mistake. What the deleted user
-- recorded stays - created_by on their rows goes to null, which the ledger's
-- append-only trigger has a standing exception for (see 003).
-- ---------------------------------------------------------------------------
create or replace function public.delete_staff_login(p_profile_id uuid, p_owner_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := public.current_uid();
  v_ok     boolean;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may delete a login' using errcode = '42501';
  end if;

  if p_profile_id = v_actor then
    raise exception 'You cannot delete your own account.';
  end if;

  select (password_hash = crypt(p_owner_password, password_hash))
    into v_ok
    from public.profiles
   where id = v_actor;

  if not v_ok then
    raise exception 'That is not your password. The account has not been deleted.';
  end if;

  delete from public.profiles where id = p_profile_id;
end;
$$;

comment on function public.create_first_owner(text, text, text) is
  'Creates the one and only owner account on a brand new install. Refuses once '
  'any profile exists - after that, staff logins are created by an existing '
  'super_admin through create_staff_login().';
