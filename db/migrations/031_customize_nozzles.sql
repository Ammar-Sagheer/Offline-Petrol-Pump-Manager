-- =============================================================================
-- 031_customize_nozzles.sql
--
-- Offline-only addition - no reference migration behind this one. Every
-- install shipped with the same seeded layout (005_seed_tanks_and_nozzles.sql):
-- 2 diesel nozzles on one unit, 4 petrol nozzles split across two more. That
-- was always meant as a starting point, not a fact about every pump - a real
-- site's actual unit/nozzle count and fuel split varies, and nothing before
-- this migration let it be changed once the app was running.
--
-- ADD is a plain insert from the app (see addNozzle in actions.js). RLS
-- already restricts writes on this table to the owner (004, "nozzles: super
-- admin writes"), and a single new row needs no RPC of its own - the same
-- reasoning as why tanks/bank accounts are plain inserts.
--
-- REMOVE cannot be a plain delete. nozzle_readings.nozzle_id references
-- nozzles ON DELETE RESTRICT (001) on purpose - a nozzle that has ever sold a
-- litre carries money history, and this app does not delete money history
-- (see delete_customer, 020, for the identical reasoning, and CLAUDE.md's
-- "no deletable evidence" rule generally). So delete_nozzle() below is the
-- same two-branch shape as delete_customer: a nozzle added by mistake and
-- never used is gone for good; one with any reading against it is RETIRED
-- instead - is_active flips to false, which get_reading_sheet() already
-- excludes on (008, line ~164), so it drops off the daily entry sheet and the
-- wiring editor while every past reading it carries keeps counting in every
-- report, export and dip calculation untouched (those all join nozzles from
-- nozzle_readings, never the other way round, so is_active never hides them).
--
-- Gated behind the acting owner's own password, the same way delete_staff_login
-- (002) is - re-typing it is what stops a screen left open from being used to
-- quietly remove a nozzle mid-shift.
-- =============================================================================

create or replace function public.delete_nozzle(p_nozzle_id uuid, p_owner_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := public.current_uid();
  v_ok    boolean;
  v_unit  smallint;
  v_label text;
  v_count int;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may remove a nozzle' using errcode = '42501';
  end if;

  select (password_hash = crypt(p_owner_password, password_hash))
    into v_ok
    from public.profiles
   where id = v_actor;

  if not v_ok then
    raise exception 'That is not your password. Nothing has been removed.';
  end if;

  select n.unit_number, n.nozzle_label into v_unit, v_label
    from public.nozzles n
   where n.id = p_nozzle_id;

  if v_label is null then
    raise exception 'That nozzle no longer exists' using errcode = 'P0002';
  end if;

  select count(*) into v_count
    from public.nozzle_readings nr
   where nr.nozzle_id = p_nozzle_id;

  if v_count = 0 then
    delete from public.nozzles where id = p_nozzle_id;
    return jsonb_build_object(
      'unit_number', v_unit, 'nozzle_label', v_label,
      'removed', true, 'readings', 0
    );
  end if;

  update public.nozzles set is_active = false where id = p_nozzle_id;
  return jsonb_build_object(
    'unit_number', v_unit, 'nozzle_label', v_label,
    'removed', false, 'readings', v_count
  );
end;
$$;

comment on function public.delete_nozzle(uuid, text) is
  'Removes a nozzle: deleted outright when it has never recorded a reading, '
  'retired (is_active = false) when it has history. Requires the owner''s own '
  'password, re-checked here the same way delete_staff_login does.';

revoke execute on function public.delete_nozzle(uuid, text) from public;
grant  execute on function public.delete_nozzle(uuid, text) to app_user;
