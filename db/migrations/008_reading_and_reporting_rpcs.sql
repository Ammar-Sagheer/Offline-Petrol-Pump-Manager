-- =============================================================================
-- 006_reading_and_reporting_rpcs.sql
--
-- Everything the reading screen, dashboard, reports and monthly export need,
-- each in one round trip. All aggregation happens here in Postgres, not in the
-- browser, so reports stay fast and the numbers cannot be fiddled with
-- client-side.
--
-- Ported from the reference app's 005, 007, 009, 010, 012, 014 and 015 -
-- collapsed to their final state rather than replayed step by step, since this
-- is a fresh database with no history to reconcile. auth.uid() -> current_uid()
-- throughout, same as everywhere else.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Save a day's reading together with its credit slips, in ONE transaction.
--
-- security invoker on purpose: RLS still applies, so a logged-out or
-- deactivated user cannot use this as a side door. If any credit line fails,
-- the whole reading rolls back - there is never a half-saved day.
--
-- p_credit_lines looks like:
--   [{"customer_id": "...", "litres": 40, "amount": 11200}, ...]
-- ---------------------------------------------------------------------------
create or replace function public.create_nozzle_reading(
  p_nozzle_id    uuid,
  p_reading_date date,
  p_opening      numeric,
  p_closing      numeric,
  p_rate         numeric,
  p_cash         numeric,
  p_credit_lines jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reading_id   uuid;
  v_credit_total numeric(14, 2);
  v_line         jsonb;
begin
  -- The reading's credit_amount is derived from the slips, never typed, so the
  -- two can't disagree.
  select coalesce(sum((l ->> 'amount')::numeric), 0)
    into v_credit_total
    from jsonb_array_elements(coalesce(p_credit_lines, '[]'::jsonb)) l;

  insert into public.nozzle_readings (
    nozzle_id, reading_date, opening_reading, closing_reading,
    rate_per_litre, cash_amount, credit_amount, created_by
  )
  values (
    p_nozzle_id, p_reading_date, p_opening, p_closing,
    p_rate, p_cash, v_credit_total, public.current_uid()
  )
  returning id into v_reading_id;

  for v_line in
    select value from jsonb_array_elements(coalesce(p_credit_lines, '[]'::jsonb))
  loop
    insert into public.credit_sales (reading_id, customer_id, litres, amount)
    values (
      v_reading_id,
      (v_line ->> 'customer_id')::uuid,
      (v_line ->> 'litres')::numeric,
      (v_line ->> 'amount')::numeric
    );
  end loop;

  return v_reading_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Everything the daily reading screen needs, for all 6 nozzles, in one query.
--
-- The opening figure falls back through three levels: today's already-saved
-- opening, then yesterday's closing, then the nozzle's own starting_reading
-- (its meter value on the day this pump began using the app - see 001).
--
-- previous_date/previous_closing and later_date/later_opening let the form
-- warn about a broken reading chain before saving - a reading whose opening
-- does not match the previous reading's closing, which means litres are being
-- counted twice (see the comment on this in the reference app's migration 009
-- for the two ways that happens). This is a warning only, never a block:
-- meters really do get replaced and reset.
-- ---------------------------------------------------------------------------
create or replace function public.get_reading_sheet(p_date date default public.pump_today())
returns table (
  nozzle_id        uuid,
  unit_number      smallint,
  nozzle_label     text,
  tank_id          uuid,
  fuel_type        public.fuel_type,
  rate             numeric,
  opening_reading  numeric,
  reading_id       uuid,
  closing_reading  numeric,
  cash_amount      numeric,
  credit_amount    numeric,
  litres_sold      numeric,
  sale_amount      numeric,
  previous_date    date,
  previous_closing numeric,
  later_date       date,
  later_opening    numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select n.id,
         n.unit_number,
         n.nozzle_label,
         t.id,
         t.fuel_type,
         coalesce(existing.rate_per_litre,
                  public.current_fuel_rate(t.fuel_type, p_date))::numeric,
         coalesce(existing.opening_reading, prev.closing_reading, n.starting_reading)::numeric,
         existing.id,
         existing.closing_reading,
         existing.cash_amount,
         existing.credit_amount,
         existing.litres_sold,
         existing.sale_amount,
         prev.reading_date,
         prev.closing_reading,
         later.reading_date,
         later.opening_reading
    from public.nozzles n
    join public.tanks t on t.id = n.tank_id
    left join lateral (
      select nr.*
        from public.nozzle_readings nr
       where nr.nozzle_id = n.id
         and nr.reading_date = p_date
       limit 1
    ) existing on true
    left join lateral (
      select nr.closing_reading, nr.reading_date
        from public.nozzle_readings nr
       where nr.nozzle_id = n.id
         and nr.reading_date < p_date
       order by nr.reading_date desc
       limit 1
    ) prev on true
    left join lateral (
      select nr.reading_date, nr.opening_reading
        from public.nozzle_readings nr
       where nr.nozzle_id = n.id
         and nr.reading_date > p_date
       order by nr.reading_date asc
       limit 1
    ) later on true
   where n.is_active
   order by n.unit_number, n.nozzle_label;
end;
$$;

-- ---------------------------------------------------------------------------
-- Delete one reading, reversing any credit slips it carried rather than
-- silently leaving the customer's debit standing with nothing to cancel it.
-- ---------------------------------------------------------------------------
create or replace function public.delete_reading(p_reading_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date  date;
  v_slips int;
  v_gone  int;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may delete a reading' using errcode = '42501';
  end if;

  select reading_date into v_date
    from public.nozzle_readings where id = p_reading_id;

  if v_date is null then
    raise exception 'That reading no longer exists' using errcode = 'P0002';
  end if;

  insert into public.ledger_entries
    (customer_id, entry_type, amount, entry_date, note, created_by)
  select cs.customer_id, 'credit', cs.amount, v_date,
         'Reversal - the nozzle entry for ' || to_char(v_date, 'DD Mon YYYY')
           || ' was deleted',
         public.current_uid()
    from public.credit_sales cs
   where cs.reading_id = p_reading_id;

  get diagnostics v_slips = row_count;

  delete from public.nozzle_readings where id = p_reading_id;
  get diagnostics v_gone = row_count;

  return jsonb_build_object('deleted', v_gone, 'slips_reversed', v_slips);
end;
$$;

-- ---------------------------------------------------------------------------
-- Wipe one day's nozzle entries so it can be redone, reversing any credit
-- slips the same way delete_reading() does for a single one.
-- ---------------------------------------------------------------------------
create or replace function public.clear_day(p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_readings int;
  v_slips    int;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may clear a day' using errcode = '42501';
  end if;

  insert into public.ledger_entries
    (customer_id, entry_type, amount, entry_date, note, created_by)
  select cs.customer_id, 'credit', cs.amount, p_date,
         'Reversal - the nozzle entries for ' || to_char(p_date, 'DD Mon YYYY')
           || ' were cleared and will be re-entered',
         public.current_uid()
    from public.credit_sales cs
    join public.nozzle_readings nr on nr.id = cs.reading_id
   where nr.reading_date = p_date;

  get diagnostics v_slips = row_count;

  delete from public.nozzle_readings where reading_date = p_date;
  get diagnostics v_readings = row_count;

  return jsonb_build_object('readings', v_readings, 'slips_reversed', v_slips);
end;
$$;

-- ---------------------------------------------------------------------------
-- Empty the books. Testing/demo scaffolding - the app only shows the button
-- for it when ALLOW_FULL_RESET is set (app/_lib/helpers.js).
--
-- Kept: logins, tanks and their capacities, nozzles and their starting meter
-- readings - those describe the pump itself, not its trading.
-- ---------------------------------------------------------------------------
create or replace function public.reset_all_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_counts jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may reset the data' using errcode = '42501';
  end if;

  v_counts := jsonb_build_object(
    'readings',  (select count(*) from public.nozzle_readings),
    'customers', (select count(*) from public.customers),
    'purchases', (select count(*) from public.fuel_purchases),
    'expenses',  (select count(*) from public.expenses)
  );

  alter table public.ledger_entries disable trigger ledger_entries_no_delete;
  delete from public.ledger_entries;
  alter table public.ledger_entries enable trigger ledger_entries_no_delete;

  delete from public.credit_sales;
  delete from public.nozzle_readings;
  delete from public.stock_checks;
  delete from public.fuel_purchases;
  delete from public.expenses;
  delete from public.customers;
  delete from public.fuel_prices;

  update public.tanks
     set opening_stock_litres = 0,
         current_stock_litres = 0,
         opening_stock_date   = public.pump_today();

  return v_counts;
end;
$$;

comment on function public.reset_all_data() is
  'Empties the books, keeping logins, tanks and nozzles. Demo/testing '
  'scaffolding - the app only offers it while ALLOW_FULL_RESET is set.';

-- ---------------------------------------------------------------------------
-- Everything the dashboard needs for one day, in a single round trip.
-- ---------------------------------------------------------------------------
create or replace function public.get_daily_summary(p_date date default public.pump_today())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view the daily summary' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'date', p_date,
    'totals', (
      select jsonb_build_object(
        'litres_sold',   coalesce(sum(nr.litres_sold), 0),
        'sale_amount',   coalesce(sum(nr.sale_amount), 0),
        'cash_amount',   coalesce(sum(nr.cash_amount), 0),
        'credit_amount', coalesce(sum(nr.credit_amount), 0)
      )
      from public.nozzle_readings nr
      where nr.reading_date = p_date
    ),
    'by_fuel_type', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fuel_type',     s.fuel_type,
               'litres_sold',   s.litres_sold,
               'sale_amount',   s.sale_amount,
               'cash_amount',   s.cash_amount,
               'credit_amount', s.credit_amount
             ) order by s.fuel_type)
      from (
        select t.fuel_type,
               sum(nr.litres_sold)   as litres_sold,
               sum(nr.sale_amount)   as sale_amount,
               sum(nr.cash_amount)   as cash_amount,
               sum(nr.credit_amount) as credit_amount
          from public.nozzle_readings nr
          join public.nozzles n on n.id = nr.nozzle_id
          join public.tanks   t on t.id = n.tank_id
         where nr.reading_date = p_date
         group by t.fuel_type
      ) s
    ), '[]'::jsonb),
    'tanks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',                   t.id,
               'name',                 t.name,
               'fuel_type',            t.fuel_type,
               'capacity_litres',      t.capacity_litres,
               'current_stock_litres', t.current_stock_litres,
               'expected_stock',       public.calculate_expected_stock(t.id, p_date),
               'actual_dip_reading',   sc.actual_dip_reading,
               'gain_loss',            sc.gain_loss
             ) order by t.fuel_type)
      from public.tanks t
      left join public.stock_checks sc
        on sc.tank_id = t.id and sc.check_date = p_date
    ), '[]'::jsonb),
    'purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(fp.quantity_litres), 0),
        'total_cost',      coalesce(sum(fp.total_cost), 0)
      )
      from public.fuel_purchases fp
      where fp.purchase_date = p_date
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Day-by-day sales for the 30-day performance view. Missing days come back as
-- zeros rather than gaps, so the trend line stays honest.
-- ---------------------------------------------------------------------------
create or replace function public.get_sales_trend(p_from date, p_to date)
returns table (
  day           date,
  litres_sold   numeric,
  sale_amount   numeric,
  cash_amount   numeric,
  credit_amount numeric,
  petrol_litres numeric,
  diesel_litres numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view sales reports' using errcode = '42501';
  end if;

  return query
  select d::date,
         coalesce(sum(nr.litres_sold), 0)::numeric,
         coalesce(sum(nr.sale_amount), 0)::numeric,
         coalesce(sum(nr.cash_amount), 0)::numeric,
         coalesce(sum(nr.credit_amount), 0)::numeric,
         coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'petrol'), 0)::numeric,
         coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'diesel'), 0)::numeric
    from generate_series(p_from, p_to, interval '1 day') d
    left join public.nozzle_readings nr on nr.reading_date = d::date
    left join public.nozzles n on n.id = nr.nozzle_id
    left join public.tanks   t on t.id = n.tank_id
   group by d
   order by d;
end;
$$;

-- ---------------------------------------------------------------------------
-- Monthly report: sales, cost of fuel bought, expenses, profit, and closing
-- stock per tank.
--
--   profit = sales - fuel purchased - expenses
--
-- Cash-basis against fuel PURCHASED in the month, not fuel sold from stock. In
-- a month with a big delivery near month-end, profit will look low and the
-- closing inventory figure is where that money went.
-- ---------------------------------------------------------------------------
create or replace function public.get_monthly_report(p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from     date;
  v_to       date;
  v_sales    numeric(14, 2);
  v_cost     numeric(14, 2);
  v_expenses numeric(14, 2);
  v_result   jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view the monthly report' using errcode = '42501';
  end if;

  v_from := make_date(p_year, p_month, 1);
  v_to   := (v_from + interval '1 month' - interval '1 day')::date;

  select coalesce(sum(nr.sale_amount), 0) into v_sales
    from public.nozzle_readings nr
   where nr.reading_date between v_from and v_to;

  select coalesce(sum(fp.total_cost), 0) into v_cost
    from public.fuel_purchases fp
   where fp.purchase_date between v_from and v_to;

  select coalesce(sum(e.amount), 0) into v_expenses
    from public.expenses e
   where e.expense_date between v_from and v_to;

  select jsonb_build_object(
    'from', v_from,
    'to',   v_to,
    'sales', (
      select jsonb_build_object(
        'litres_sold',   coalesce(sum(nr.litres_sold), 0),
        'sale_amount',   coalesce(sum(nr.sale_amount), 0),
        'cash_amount',   coalesce(sum(nr.cash_amount), 0),
        'credit_amount', coalesce(sum(nr.credit_amount), 0)
      )
      from public.nozzle_readings nr
      where nr.reading_date between v_from and v_to
    ),
    'sales_by_fuel', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fuel_type',   s.fuel_type,
               'litres_sold', s.litres_sold,
               'sale_amount', s.sale_amount
             ) order by s.fuel_type)
      from (
        select t.fuel_type,
               sum(nr.litres_sold) as litres_sold,
               sum(nr.sale_amount) as sale_amount
          from public.nozzle_readings nr
          join public.nozzles n on n.id = nr.nozzle_id
          join public.tanks   t on t.id = n.tank_id
         where nr.reading_date between v_from and v_to
         group by t.fuel_type
      ) s
    ), '[]'::jsonb),
    'purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(fp.quantity_litres), 0),
        'total_cost',      coalesce(sum(fp.total_cost), 0),
        'pending_amount',  coalesce(sum(fp.total_cost) filter (where fp.payment_status = 'pending'), 0)
      )
      from public.fuel_purchases fp
      where fp.purchase_date between v_from and v_to
    ),
    'expenses_total', v_expenses,
    'expenses_by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category', s.category, 'amount', s.amount)
                       order by s.amount desc)
      from (
        select e.category, sum(e.amount) as amount
          from public.expenses e
         where e.expense_date between v_from and v_to
         group by e.category
      ) s
    ), '[]'::jsonb),
    'profit', round(v_sales - v_cost - v_expenses, 2),
    'closing_inventory', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tank_id',        t.id,
               'name',           t.name,
               'fuel_type',      t.fuel_type,
               'closing_litres', public.calculate_expected_stock(t.id, v_to)
             ) order by t.fuel_type)
      from public.tanks t
    ), '[]'::jsonb),
    'stock_gain_loss', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tank_id',   s.tank_id,
               'fuel_type', s.fuel_type,
               'gain_loss', s.gain_loss
             ) order by s.fuel_type)
      from (
        select sc.tank_id, t.fuel_type, sum(sc.gain_loss) as gain_loss
          from public.stock_checks sc
          join public.tanks t on t.id = sc.tank_id
         where sc.check_date between v_from and v_to
         group by sc.tank_id, t.fuel_type
      ) s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- A customer's full picture: who they are, what they owe, and how much petrol
-- and diesel they have taken in total.
--
-- Available to data_entry too - staff need to see a balance before recording a
-- payment. It exposes one customer only, never the whole book.
-- ---------------------------------------------------------------------------
create or replace function public.get_customer_statement(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'customer', (select to_jsonb(c) from public.customers c where c.id = p_customer_id),
    'balance',  public.customer_balance(p_customer_id),
    'total_debits', (
      select coalesce(sum(le.amount), 0) from public.ledger_entries le
       where le.customer_id = p_customer_id and le.entry_type = 'debit'
    ),
    'total_credits', (
      select coalesce(sum(le.amount), 0) from public.ledger_entries le
       where le.customer_id = p_customer_id and le.entry_type = 'credit'
    ),
    'fuel_taken', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fuel_type', s.fuel_type,
               'litres',    s.litres,
               'amount',    s.amount
             ) order by s.fuel_type)
      from (
        select le.fuel_type, sum(le.litres) as litres, sum(le.amount) as amount
          from public.ledger_entries le
         where le.customer_id = p_customer_id
           and le.entry_type = 'debit'
           and le.fuel_type is not null
         group by le.fuel_type
      ) s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Outstanding balance for every customer, for the customer list screen.
-- One query instead of one per customer.
-- ---------------------------------------------------------------------------
create or replace function public.get_customer_balances()
returns table (
  customer_id    uuid,
  name           text,
  vehicle_number text,
  credit_limit   numeric,
  balance        numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select c.id,
         c.name,
         c.vehicle_number,
         c.credit_limit,
         coalesce(sum(case when le.entry_type = 'debit' then le.amount
                           else -le.amount end), 0)::numeric
    from public.customers c
    left join public.ledger_entries le on le.customer_id = c.id
   where c.is_active
   group by c.id, c.name, c.vehicle_number, c.credit_limit
   order by c.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Everything the monthly Excel workbook needs, in one call - including the
-- bank movements (added by the reference app's migration 019). This is not
-- only a convenience: the Banking page keeps only the 60 most recent
-- transactions per account (008_bank_accounts.sql), so the month's workbook,
-- taken before that detail ages out, is what makes it durable.
--
-- NOTE ON THE 'daily' BLOCK. Per-day totals are aggregated in a subquery and
-- only then run through jsonb_agg over the result - Postgres rejects sum()
-- nested directly inside jsonb_agg() with "aggregate function calls cannot be
-- nested", so the two levels are kept apart.
-- ---------------------------------------------------------------------------
create or replace function public.get_month_export(p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from     date;
  v_to       date;
  v_sales    numeric(14,2);
  v_cost     numeric(14,2);
  v_expenses numeric(14,2);
  v_result   jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may export the monthly report' using errcode = '42501';
  end if;

  v_from := make_date(p_year, p_month, 1);
  v_to   := (v_from + interval '1 month' - interval '1 day')::date;

  select coalesce(sum(nr.sale_amount), 0) into v_sales
    from public.nozzle_readings nr where nr.reading_date between v_from and v_to;
  select coalesce(sum(fp.total_cost), 0) into v_cost
    from public.fuel_purchases fp where fp.purchase_date between v_from and v_to;
  select coalesce(sum(e.amount), 0) into v_expenses
    from public.expenses e where e.expense_date between v_from and v_to;

  select jsonb_build_object(
    'from', v_from,
    'to',   v_to,
    'sales', (
      select jsonb_build_object(
        'litres_sold',   coalesce(sum(nr.litres_sold), 0),
        'sale_amount',   coalesce(sum(nr.sale_amount), 0),
        'cash_amount',   coalesce(sum(nr.cash_amount), 0),
        'credit_amount', coalesce(sum(nr.credit_amount), 0)
      ) from public.nozzle_readings nr where nr.reading_date between v_from and v_to
    ),
    'purchases', (
      select jsonb_build_object(
        'quantity_litres', coalesce(sum(fp.quantity_litres), 0),
        'total_cost',      coalesce(sum(fp.total_cost), 0),
        'pending_amount',  coalesce(sum(fp.total_cost) filter (where fp.payment_status = 'pending'), 0)
      ) from public.fuel_purchases fp where fp.purchase_date between v_from and v_to
    ),
    'expenses_total', v_expenses,
    'profit', round(v_sales - v_cost - v_expenses, 2),

    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day',           day,
               'litres_sold',   litres_sold,
               'petrol_litres', petrol_litres,
               'diesel_litres', diesel_litres,
               'sale_amount',   sale_amount,
               'cash_amount',   cash_amount,
               'credit_amount', credit_amount
             ) order by day)
      from (
        select d::date                                                              as day,
               coalesce(sum(nr.litres_sold), 0)                                     as litres_sold,
               coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'petrol'), 0) as petrol_litres,
               coalesce(sum(nr.litres_sold) filter (where t.fuel_type = 'diesel'), 0) as diesel_litres,
               coalesce(sum(nr.sale_amount), 0)                                     as sale_amount,
               coalesce(sum(nr.cash_amount), 0)                                     as cash_amount,
               coalesce(sum(nr.credit_amount), 0)                                   as credit_amount
          from generate_series(v_from, v_to, interval '1 day') d
          left join public.nozzle_readings nr on nr.reading_date = d::date
          left join public.nozzles n on n.id = nr.nozzle_id
          left join public.tanks   t on t.id = n.tank_id
         group by d
      ) per_day
    ), '[]'::jsonb),

    'closing_inventory', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', t.name, 'fuel_type', t.fuel_type,
               'closing_litres', public.calculate_expected_stock(t.id, v_to),
               'capacity_litres', t.capacity_litres
             ) order by t.fuel_type)
      from public.tanks t
    ), '[]'::jsonb),

    'purchase_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', fp.purchase_date, 'tank', t.name, 'fuel_type', t.fuel_type,
               'supplier', fp.supplier_name, 'invoice', fp.invoice_number,
               'litres', fp.quantity_litres, 'rate', fp.rate, 'cost', fp.total_cost,
               'payment_status', fp.payment_status
             ) order by fp.purchase_date, fp.created_at)
      from public.fuel_purchases fp join public.tanks t on t.id = fp.tank_id
      where fp.purchase_date between v_from and v_to
    ), '[]'::jsonb),

    'expense_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', e.expense_date, 'category', e.category,
               'note', e.note, 'amount', e.amount
             ) order by e.expense_date, e.created_at)
      from public.expenses e where e.expense_date between v_from and v_to
    ), '[]'::jsonb),

    'customer_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', s.name, 'vehicle_number', s.vehicle_number,
               'credit_limit', s.credit_limit, 'balance', s.balance
             ) order by s.name)
      from (
        select c.name, c.vehicle_number, c.credit_limit,
               coalesce(sum(case when le.entry_type = 'debit' then le.amount
                                 else -le.amount end), 0) as balance
          from public.customers c
          left join public.ledger_entries le on le.customer_id = c.id
         where c.is_active
         group by c.id, c.name, c.vehicle_number, c.credit_limit
      ) s
    ), '[]'::jsonb),

    'reading_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', nr.reading_date, 'unit', n.unit_number, 'nozzle', n.nozzle_label,
               'fuel_type', t.fuel_type, 'opening', nr.opening_reading,
               'closing', nr.closing_reading, 'litres', nr.litres_sold,
               'rate', nr.rate_per_litre, 'sale_amount', nr.sale_amount,
               'cash_amount', nr.cash_amount, 'credit_amount', nr.credit_amount
             ) order by nr.reading_date, n.unit_number, n.nozzle_label)
      from public.nozzle_readings nr
      join public.nozzles n on n.id = nr.nozzle_id
      join public.tanks   t on t.id = n.tank_id
      where nr.reading_date between v_from and v_to
    ), '[]'::jsonb),

    'bank_rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', bt.txn_date, 'account', ba.account_label, 'bank', ba.bank_name,
               'direction', bt.txn_type, 'category', bt.category,
               'note', bt.note, 'amount', bt.amount
             ) order by bt.txn_date, bt.created_at)
      from public.bank_transactions bt
      join public.bank_accounts ba on ba.id = bt.account_id
      where bt.txn_date between v_from and v_to
    ), '[]'::jsonb),

    'bank_accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'account', b.account_label, 'bank', b.bank_name,
               'balance', b.balance, 'total_deposited', b.total_deposited,
               'total_paid', b.total_paid
             ) order by b.created_at)
      from public.bank_account_balances b
    ), '[]'::jsonb),

    'bank_month', (
      select jsonb_build_object(
               'deposits', coalesce(sum(bt.amount) filter (where bt.txn_type = 'deposit'), 0),
               'payments', coalesce(sum(bt.amount) filter (where bt.txn_type = 'payment'), 0)
             )
        from public.bank_transactions bt where bt.txn_date between v_from and v_to
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.create_nozzle_reading(uuid, date, numeric, numeric, numeric, numeric, jsonb) from public;
revoke execute on function public.get_reading_sheet(date)      from public;
revoke execute on function public.delete_reading(uuid)          from public;
revoke execute on function public.clear_day(date)               from public;
revoke execute on function public.reset_all_data()               from public;
revoke execute on function public.get_daily_summary(date)      from public;
revoke execute on function public.get_sales_trend(date, date)  from public;
revoke execute on function public.get_monthly_report(int, int) from public;
revoke execute on function public.get_customer_statement(uuid) from public;
revoke execute on function public.get_customer_balances()      from public;
revoke execute on function public.get_month_export(int, int)   from public;

grant execute on function public.create_nozzle_reading(uuid, date, numeric, numeric, numeric, numeric, jsonb) to app_user;
grant execute on function public.get_reading_sheet(date)      to app_user;
grant execute on function public.delete_reading(uuid)          to app_user;
grant execute on function public.clear_day(date)               to app_user;
grant execute on function public.reset_all_data()               to app_user;
grant execute on function public.get_daily_summary(date)      to app_user;
grant execute on function public.get_sales_trend(date, date)  to app_user;
grant execute on function public.get_monthly_report(int, int) to app_user;
grant execute on function public.get_customer_statement(uuid) to app_user;
grant execute on function public.get_customer_balances()      to app_user;
grant execute on function public.get_month_export(int, int)   to app_user;
