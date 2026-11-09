-- Booking storage v2: migrate bookings out of the single app_state JSON row.
-- This migration is intentionally reversible at the application level: app_state remains untouched.

create table if not exists public.booking_migration_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_state_id text not null,
  source_updated_at timestamptz,
  source_state_hash text not null,
  bookings_count integer not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists booking_migration_snapshots_source_hash_key
  on public.booking_migration_snapshots(source_state_id, source_state_hash);

alter table public.booking_migration_snapshots enable row level security;
drop policy if exists "manager select booking migration snapshots" on public.booking_migration_snapshots;
create policy "manager select booking migration snapshots"
  on public.booking_migration_snapshots
  for select
  to authenticated
  using (lower(coalesce(auth.jwt()->>'email','')) = lower('asm114@hotmail.com'));

alter table public.reservations add column if not exists legacy_booking_id text;
alter table public.reservations add column if not exists booking_code text;
alter table public.reservations add column if not exists customer_name_snapshot text;
alter table public.reservations add column if not exists customer_phone_snapshot text;
alter table public.reservations add column if not exists paid_amount numeric not null default 0;
alter table public.reservations add column if not exists record_type text;
alter table public.reservations add column if not exists stay_days integer not null default 1;
alter table public.reservations add column if not exists subscription_id text;
alter table public.reservations add column if not exists portal_unavailable_period_ids jsonb not null default '[]'::jsonb;
alter table public.reservations add column if not exists commission_snapshot jsonb;
alter table public.reservations add column if not exists legacy_payload jsonb not null default '{}'::jsonb;
alter table public.reservations add column if not exists source_hash text;
alter table public.reservations add column if not exists revision bigint not null default 1;
alter table public.reservations add column if not exists legacy_created_at timestamptz;
alter table public.reservations add column if not exists legacy_updated_at timestamptz;
alter table public.reservations add column if not exists updated_at timestamptz not null default now();
alter table public.reservations add column if not exists migrated_at timestamptz;

create unique index if not exists reservations_legacy_booking_id_key
  on public.reservations(legacy_booking_id);
create unique index if not exists reservations_booking_code_key
  on public.reservations(booking_code);
create index if not exists reservations_reservation_date_idx
  on public.reservations(reservation_date);
create index if not exists reservations_status_idx
  on public.reservations(status);

alter table public.payments add column if not exists legacy_payment_id text;
alter table public.payments add column if not exists payment_type text;
alter table public.payments add column if not exists legacy_payload jsonb not null default '{}'::jsonb;
alter table public.payments add column if not exists source_hash text;
alter table public.payments add column if not exists legacy_created_at timestamptz;
alter table public.payments add column if not exists updated_at timestamptz not null default now();

create unique index if not exists payments_reservation_legacy_payment_key
  on public.payments(reservation_id, legacy_payment_id);

-- Tighten the currently broad authenticated policies before this storage becomes authoritative.
drop policy if exists "manager reservations" on public.reservations;
drop policy if exists "manager payments" on public.payments;

drop policy if exists "manager reservations v2" on public.reservations;
create policy "manager reservations v2"
  on public.reservations
  for all
  to authenticated
  using (lower(coalesce(auth.jwt()->>'email','')) = lower('asm114@hotmail.com'))
  with check (lower(coalesce(auth.jwt()->>'email','')) = lower('asm114@hotmail.com'));

drop policy if exists "manager payments v2" on public.payments;
create policy "manager payments v2"
  on public.payments
  for all
  to authenticated
  using (lower(coalesce(auth.jwt()->>'email','')) = lower('asm114@hotmail.com'))
  with check (lower(coalesce(auth.jwt()->>'email','')) = lower('asm114@hotmail.com'));

-- Immutable recovery point for the exact source row before backfill.
insert into public.booking_migration_snapshots (
  source_state_id, source_updated_at, source_state_hash, bookings_count, data
)
select
  s.id,
  s.updated_at,
  md5(s.data::text),
  jsonb_array_length(coalesce(s.data->'bookings','[]'::jsonb)),
  s.data
from public.app_state s
where s.id='main'
on conflict (source_state_id, source_state_hash) do nothing;

-- Backfill one row per booking while preserving the complete original JSON payload.
with source_bookings as (
  select b.value as booking
  from public.app_state s
  cross join lateral jsonb_array_elements(coalesce(s.data->'bookings','[]'::jsonb)) b(value)
  where s.id='main'
)
insert into public.reservations (
  legacy_booking_id,
  booking_code,
  customer_name_snapshot,
  customer_phone_snapshot,
  reservation_date,
  reservation_type,
  total_amount,
  paid_amount,
  status,
  record_type,
  notes,
  stay_days,
  subscription_id,
  portal_unavailable_period_ids,
  commission_snapshot,
  legacy_payload,
  source_hash,
  revision,
  legacy_created_at,
  legacy_updated_at,
  migrated_at
)
select
  booking->>'id',
  booking->>'code',
  booking->>'name',
  nullif(booking->>'phone',''),
  (booking->>'date')::date,
  case booking->>'type'
    when 'يومي' then 'daily'
    when 'مبيت' then 'overnight'
    else null
  end,
  coalesce((booking->>'total')::numeric,0),
  coalesce((booking->>'paid')::numeric,0),
  booking->>'status',
  booking->>'recordType',
  booking->>'notes',
  coalesce((booking->>'stayDays')::integer,1),
  nullif(booking->>'subscriptionId',''),
  coalesce(booking->'portalUnavailablePeriodIds','[]'::jsonb),
  booking->'commissionSnapshot',
  booking,
  md5(booking::text),
  1,
  nullif(booking->>'createdAt','')::timestamptz,
  nullif(booking->>'updatedAt','')::timestamptz,
  now()
from source_bookings
on conflict (legacy_booking_id) do update set
  booking_code=excluded.booking_code,
  customer_name_snapshot=excluded.customer_name_snapshot,
  customer_phone_snapshot=excluded.customer_phone_snapshot,
  reservation_date=excluded.reservation_date,
  reservation_type=excluded.reservation_type,
  total_amount=excluded.total_amount,
  paid_amount=excluded.paid_amount,
  status=excluded.status,
  record_type=excluded.record_type,
  notes=excluded.notes,
  stay_days=excluded.stay_days,
  subscription_id=excluded.subscription_id,
  portal_unavailable_period_ids=excluded.portal_unavailable_period_ids,
  commission_snapshot=excluded.commission_snapshot,
  legacy_payload=excluded.legacy_payload,
  source_hash=excluded.source_hash,
  legacy_created_at=excluded.legacy_created_at,
  legacy_updated_at=excluded.legacy_updated_at,
  migrated_at=excluded.migrated_at,
  updated_at=now();

-- Backfill payment history with stable legacy identifiers.
with source_payments as (
  select
    b.value->>'id' as legacy_booking_id,
    p.value as payment
  from public.app_state s
  cross join lateral jsonb_array_elements(coalesce(s.data->'bookings','[]'::jsonb)) b(value)
  cross join lateral jsonb_array_elements(coalesce(b.value->'payments','[]'::jsonb)) p(value)
  where s.id='main'
)
insert into public.payments (
  reservation_id,
  legacy_payment_id,
  amount,
  payment_method,
  payment_date,
  payment_type,
  note,
  legacy_payload,
  source_hash,
  legacy_created_at,
  updated_at
)
select
  r.id,
  p.payment->>'id',
  coalesce((p.payment->>'amount')::numeric,0),
  p.payment->>'method',
  nullif(p.payment->>'date','')::date,
  p.payment->>'type',
  p.payment->>'note',
  p.payment,
  md5(p.payment::text),
  nullif(p.payment->>'createdAt','')::timestamptz,
  now()
from source_payments p
join public.reservations r on r.legacy_booking_id=p.legacy_booking_id
on conflict (reservation_id, legacy_payment_id) do update set
  amount=excluded.amount,
  payment_method=excluded.payment_method,
  payment_date=excluded.payment_date,
  payment_type=excluded.payment_type,
  note=excluded.note,
  legacy_payload=excluded.legacy_payload,
  source_hash=excluded.source_hash,
  legacy_created_at=excluded.legacy_created_at,
  updated_at=now();

-- Atomic, revision-checked booking write used after cutover.
create or replace function public.save_booking_v2(
  p_booking jsonb,
  p_expected_revision bigint default null
)
returns table (
  reservation_id uuid,
  legacy_booking_id text,
  booking_code text,
  revision bigint,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id text := nullif(p_booking->>'id','');
  v_code text := nullif(p_booking->>'code','');
  v_reservation_id uuid;
  v_current_revision bigint;
  v_new_revision bigint;
begin
  if lower(coalesce(auth.jwt()->>'email','')) <> lower('asm114@hotmail.com') then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if v_id is null or v_code is null then
    raise exception 'booking_id_and_code_required' using errcode='22023';
  end if;

  select r.id, r.revision
    into v_reservation_id, v_current_revision
  from public.reservations r
  where r.legacy_booking_id=v_id
  for update;

  if v_reservation_id is null then
    if p_expected_revision is not null and p_expected_revision <> 0 then
      raise exception 'booking_revision_conflict' using errcode='40001';
    end if;

    insert into public.reservations (
      legacy_booking_id, booking_code, customer_name_snapshot, customer_phone_snapshot,
      reservation_date, reservation_type, total_amount, paid_amount, status, record_type,
      notes, stay_days, subscription_id, portal_unavailable_period_ids, commission_snapshot,
      legacy_payload, source_hash, revision, legacy_created_at, legacy_updated_at, migrated_at, updated_at
    ) values (
      v_id,
      v_code,
      p_booking->>'name',
      nullif(p_booking->>'phone',''),
      (p_booking->>'date')::date,
      case p_booking->>'type' when 'يومي' then 'daily' when 'مبيت' then 'overnight' else null end,
      coalesce((p_booking->>'total')::numeric,0),
      coalesce((p_booking->>'paid')::numeric,0),
      p_booking->>'status',
      p_booking->>'recordType',
      p_booking->>'notes',
      coalesce((p_booking->>'stayDays')::integer,1),
      nullif(p_booking->>'subscriptionId',''),
      coalesce(p_booking->'portalUnavailablePeriodIds','[]'::jsonb),
      p_booking->'commissionSnapshot',
      p_booking,
      md5(p_booking::text),
      1,
      nullif(p_booking->>'createdAt','')::timestamptz,
      nullif(p_booking->>'updatedAt','')::timestamptz,
      now(),
      now()
    )
    returning id, revision into v_reservation_id, v_new_revision;
  else
    if p_expected_revision is null or p_expected_revision <> v_current_revision then
      raise exception 'booking_revision_conflict' using errcode='40001';
    end if;

    update public.reservations r set
      booking_code=v_code,
      customer_name_snapshot=p_booking->>'name',
      customer_phone_snapshot=nullif(p_booking->>'phone',''),
      reservation_date=(p_booking->>'date')::date,
      reservation_type=case p_booking->>'type' when 'يومي' then 'daily' when 'مبيت' then 'overnight' else null end,
      total_amount=coalesce((p_booking->>'total')::numeric,0),
      paid_amount=coalesce((p_booking->>'paid')::numeric,0),
      status=p_booking->>'status',
      record_type=p_booking->>'recordType',
      notes=p_booking->>'notes',
      stay_days=coalesce((p_booking->>'stayDays')::integer,1),
      subscription_id=nullif(p_booking->>'subscriptionId',''),
      portal_unavailable_period_ids=coalesce(p_booking->'portalUnavailablePeriodIds','[]'::jsonb),
      commission_snapshot=p_booking->'commissionSnapshot',
      legacy_payload=p_booking,
      source_hash=md5(p_booking::text),
      revision=r.revision+1,
      legacy_created_at=nullif(p_booking->>'createdAt','')::timestamptz,
      legacy_updated_at=nullif(p_booking->>'updatedAt','')::timestamptz,
      updated_at=now()
    where r.id=v_reservation_id
    returning r.revision into v_new_revision;
  end if;

  delete from public.payments p where p.reservation_id=v_reservation_id;
  insert into public.payments (
    reservation_id, legacy_payment_id, amount, payment_method, payment_date,
    payment_type, note, legacy_payload, source_hash, legacy_created_at, updated_at
  )
  select
    v_reservation_id,
    payment->>'id',
    coalesce((payment->>'amount')::numeric,0),
    payment->>'method',
    nullif(payment->>'date','')::date,
    payment->>'type',
    payment->>'note',
    payment,
    md5(payment::text),
    nullif(payment->>'createdAt','')::timestamptz,
    now()
  from jsonb_array_elements(coalesce(p_booking->'payments','[]'::jsonb)) payment;

  return query
  select v_reservation_id, v_id, v_code, v_new_revision, now();
end;
$$;

revoke all on function public.save_booking_v2(jsonb,bigint) from public;
grant execute on function public.save_booking_v2(jsonb,bigint) to authenticated;
