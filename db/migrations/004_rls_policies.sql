-- =============================================================================
-- 004_rls_policies.sql
--
-- Row Level Security. This is the source of truth for what each role can do -
-- the requireRole() helper in the app is a second line of defence, not the
-- first. Everything is denied unless a policy below allows it.
--
-- Roles in short:
--   data_entry   - records daily work: readings, purchases, stock dips,
--                  customers, ledger payments. Cannot see money reports,
--                  cannot change past entries, cannot touch configuration.
--   super_admin  - everything, including prices, tanks, nozzles, expenses,
--                  reports, and correcting past entries.
--
-- Note on the ledger: it has NO update or delete policy at all, on purpose.
--
-- ONE POSTGRES ROLE, NOT THREE. Supabase's RLS policies target `anon` and
-- `authenticated`, Postgres roles PostgREST switches between per request based
-- on the JWT. There is no PostgREST here - the Next.js server holds a single
-- pooled connection as one dedicated login role (`app_user`, created below,
-- never a superuser and never the table owner, so RLS actually applies to it)
-- and distinguishes signed-in from signed-out entirely above the database, via
-- the session cookie. So every policy below targets `app_user`, and there is
-- no `anon` case to write: a request with no valid session never reaches a
-- query in the first place - see app/_lib/auth.js.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    -- LOGIN with no usable password yet - the app sets a real, randomly
    -- generated one on first run (see electron/bootstrap-db.js) and stores it
    -- in the local app-data folder, never in a migration file.
    create role app_user with login password 'changeme-set-on-first-run' nocreatedb nocreaterole nosuperuser;
  end if;
end $$;

grant usage on schema public to app_user;

alter table public.profiles        enable row level security;
alter table public.tanks           enable row level security;
alter table public.nozzles         enable row level security;
alter table public.fuel_prices     enable row level security;
alter table public.customers       enable row level security;
alter table public.nozzle_readings enable row level security;
alter table public.credit_sales    enable row level security;
alter table public.ledger_entries  enable row level security;
alter table public.fuel_purchases  enable row level security;
alter table public.stock_checks    enable row level security;
alter table public.expenses        enable row level security;

-- ---------------------------------------------------------------------------
-- profiles - you can see yourself; a super_admin can see and manage everyone.
-- No delete policy: profiles are removed only via the SECURITY DEFINER
-- delete_staff_login() in 006, which runs as the table owner and so is not
-- subject to (or limited by) this policy set at all.
-- ---------------------------------------------------------------------------
create policy "profiles: read own or all as super admin"
  on public.profiles for select to app_user
  using (id = public.current_uid() or public.is_super_admin());

create policy "profiles: super admin updates"
  on public.profiles for update to app_user
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Inserts happen only through create_staff_login() / create_first_owner()
-- (both SECURITY DEFINER, 002) - no direct-insert policy is needed or granted.

-- ---------------------------------------------------------------------------
-- Configuration: tanks, nozzles, fuel prices.
-- Staff need to read these to enter a reading (which nozzle, what rate), but
-- only a super_admin may change them.
-- ---------------------------------------------------------------------------
create policy "tanks: staff read"
  on public.tanks for select to app_user
  using (public.is_active_staff());

create policy "tanks: super admin writes"
  on public.tanks for all to app_user
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "nozzles: staff read"
  on public.nozzles for select to app_user
  using (public.is_active_staff());

create policy "nozzles: super admin writes"
  on public.nozzles for all to app_user
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "fuel prices: staff read"
  on public.fuel_prices for select to app_user
  using (public.is_active_staff());

create policy "fuel prices: super admin writes"
  on public.fuel_prices for all to app_user
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- customers - staff may add new credit customers (they meet them at the pump),
-- but editing or removing one is a super_admin decision.
-- ---------------------------------------------------------------------------
create policy "customers: staff read"
  on public.customers for select to app_user
  using (public.is_active_staff());

create policy "customers: staff create"
  on public.customers for insert to app_user
  with check (public.is_active_staff());

create policy "customers: super admin updates"
  on public.customers for update to app_user
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "customers: super admin deletes"
  on public.customers for delete to app_user
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- nozzle_readings - the daily entry. Staff add today's numbers and can see
-- what has been entered (so yesterday's closing can carry over and so they do
-- not enter a nozzle twice). Only a super_admin may correct a past entry
-- (delete_reading() in 006 is how - it also reverses any credit slips).
-- ---------------------------------------------------------------------------
create policy "readings: staff read"
  on public.nozzle_readings for select to app_user
  using (public.is_active_staff());

create policy "readings: staff create"
  on public.nozzle_readings for insert to app_user
  with check (public.is_active_staff());

create policy "readings: super admin updates"
  on public.nozzle_readings for update to app_user
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "readings: super admin deletes"
  on public.nozzle_readings for delete to app_user
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- credit_sales - the credit slips attached to a reading. Same rules as the
-- reading they belong to.
-- ---------------------------------------------------------------------------
create policy "credit sales: staff read"
  on public.credit_sales for select to app_user
  using (public.is_active_staff());

create policy "credit sales: staff create"
  on public.credit_sales for insert to app_user
  with check (public.is_active_staff());

create policy "credit sales: super admin updates"
  on public.credit_sales for update to app_user
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "credit sales: super admin deletes"
  on public.credit_sales for delete to app_user
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- ledger_entries - APPEND ONLY.
--
-- Read and insert only. There is deliberately no update policy and no delete
-- policy, for anyone, including super_admin: this is money customers owe, and
-- the history has to stay auditable. A mistake is corrected by posting a new
-- offsetting entry. The trigger in 003 enforces the same rule below RLS.
-- ---------------------------------------------------------------------------
create policy "ledger: staff read"
  on public.ledger_entries for select to app_user
  using (public.is_active_staff());

create policy "ledger: staff create"
  on public.ledger_entries for insert to app_user
  with check (public.is_active_staff());

-- ---------------------------------------------------------------------------
-- fuel_purchases - staff record incoming stock from the OMC.
-- ---------------------------------------------------------------------------
create policy "purchases: staff read"
  on public.fuel_purchases for select to app_user
  using (public.is_active_staff());

create policy "purchases: staff create"
  on public.fuel_purchases for insert to app_user
  with check (public.is_active_staff());

create policy "purchases: super admin updates"
  on public.fuel_purchases for update to app_user
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "purchases: super admin deletes"
  on public.fuel_purchases for delete to app_user
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- stock_checks - staff record the physical dip.
-- ---------------------------------------------------------------------------
create policy "stock checks: staff read"
  on public.stock_checks for select to app_user
  using (public.is_active_staff());

create policy "stock checks: staff create"
  on public.stock_checks for insert to app_user
  with check (public.is_active_staff());

create policy "stock checks: super admin updates"
  on public.stock_checks for update to app_user
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "stock checks: super admin deletes"
  on public.stock_checks for delete to app_user
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- expenses - super_admin only in every direction, since this feeds profit.
-- ---------------------------------------------------------------------------
create policy "expenses: super admin only"
  on public.expenses for all to app_user
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Function permissions.
--
-- Postgres grants EXECUTE on every new function to PUBLIC by default. Revoke
-- that everywhere and grant back only to app_user - the single role the app
-- ever connects as. Trigger functions and other SECURITY DEFINER internals
-- that nothing outside a trigger should call directly are revoked from
-- app_user too; they run under their own trigger context regardless of grants,
-- but there is no reason app_user should be able to invoke them ad hoc.
-- ---------------------------------------------------------------------------
revoke execute on function public.current_uid()                                 from public;
revoke execute on function public.verify_login(text, text)                      from public;
revoke execute on function public.create_session(uuid, interval)                from public;
revoke execute on function public.session_user_id(uuid)                         from public;
revoke execute on function public.delete_session(uuid)                          from public;
revoke execute on function public.create_staff_login(text, text, text, public.user_role) from public;
revoke execute on function public.change_password(text, text)                   from public;
revoke execute on function public.create_first_owner(text, text, text)          from public;
revoke execute on function public.delete_staff_login(uuid, text)                from public;
revoke execute on function public.auth_role()                                   from public;
revoke execute on function public.is_super_admin()                              from public;
revoke execute on function public.is_active_staff()                             from public;
revoke execute on function public.current_fuel_rate(public.fuel_type, date)     from public;
revoke execute on function public.calculate_expected_stock(uuid, date)          from public;
revoke execute on function public.recalc_tank_stock(uuid)                       from public;
revoke execute on function public.trg_recalc_tank_from_tank_row()               from public;
revoke execute on function public.trg_recalc_tank_from_reading()                from public;
revoke execute on function public.trg_post_credit_sale_to_ledger()              from public;
revoke execute on function public.trg_validate_credit_total()                   from public;
revoke execute on function public.trg_validate_reading_credit_total()           from public;
revoke execute on function public.trg_ledger_append_only()                      from public;
revoke execute on function public.customer_balance(uuid)                        from public;
revoke execute on function public.pump_today()                                  from public;

grant execute on function public.verify_login(text, text)             to app_user;
grant execute on function public.create_session(uuid, interval)       to app_user;
grant execute on function public.session_user_id(uuid)                to app_user;
grant execute on function public.delete_session(uuid)                 to app_user;
grant execute on function public.create_staff_login(text, text, text, public.user_role) to app_user;
grant execute on function public.change_password(text, text)          to app_user;
grant execute on function public.create_first_owner(text, text, text) to app_user;
grant execute on function public.delete_staff_login(uuid, text)       to app_user;
grant execute on function public.auth_role()                          to app_user;
grant execute on function public.is_super_admin()                     to app_user;
grant execute on function public.is_active_staff()                    to app_user;
grant execute on function public.current_fuel_rate(public.fuel_type, date) to app_user;
grant execute on function public.calculate_expected_stock(uuid, date) to app_user;
grant execute on function public.customer_balance(uuid)               to app_user;
grant execute on function public.pump_today()                         to app_user;

-- Table grants. RLS still narrows every row - these grants only say the
-- command is reachable at all.
grant select, insert, update, delete on
  public.profiles, public.tanks, public.nozzles, public.fuel_prices,
  public.customers, public.nozzle_readings, public.credit_sales,
  public.ledger_entries, public.fuel_purchases, public.stock_checks,
  public.expenses
  to app_user;
