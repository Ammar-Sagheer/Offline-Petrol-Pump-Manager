-- =============================================================================
-- 005_seed_tanks_and_nozzles.sql
--
-- The physical hardware at the pump: 2 underground tanks and 6 nozzles across
-- 3 double dispensing units.
--
-- Layout is by UNIT, not by nozzle - unit 1 runs both nozzles on diesel, units
-- 2 and 3 run both on petrol. (The reference app seeded one-petrol-one-diesel
-- per unit first and had to correct it in a later migration once the real
-- layout was known; seeded correctly here from the start.) If a unit's wiring
-- is ever changed, update that nozzle's tank_id from Settings - no migration
-- needed.
--
-- Opening stock is seeded at 0. Record the first physical dip on the Stock
-- Checks screen and that measured number becomes the baseline for everything
-- afterwards.
-- =============================================================================

insert into public.tanks (name, fuel_type, capacity_litres, opening_stock_litres, opening_stock_date)
values
  ('Petrol Tank', 'petrol', 25000, 0, public.pump_today()),
  ('Diesel Tank', 'diesel', 50000, 0, public.pump_today());

insert into public.nozzles (tank_id, unit_number, nozzle_label)
select t.id, u.unit_number, u.nozzle_label
  from (values
          (1::smallint, 'A', 'diesel'),
          (1::smallint, 'B', 'diesel'),
          (2::smallint, 'A', 'petrol'),
          (2::smallint, 'B', 'petrol'),
          (3::smallint, 'A', 'petrol'),
          (3::smallint, 'B', 'petrol')
       ) as u (unit_number, nozzle_label, fuel)
  join public.tanks t on t.fuel_type = u.fuel::public.fuel_type;
