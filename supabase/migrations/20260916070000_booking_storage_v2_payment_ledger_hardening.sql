-- Booking storage v2 payment-ledger hardening.
-- This migration replaces the first v2 save function before application cutover.
-- Booking edits may append new payment movements, but they may never delete or rewrite
-- an existing financial movement. Corrections/refunds must be new movements.

alter table public.payments enable row level security;

drop policy if exists "manager payments v2" on public.payments;
drop policy if exists "manager payments v2 select" on public.payments;
drop policy if exists "manager payments v2 insert" on public.payments;

create policy "manager payments v2 select"
  on public.payments
  for select
  to authenticated
  using (lower(coalesce(auth.jwt()->>'email','')) = lower('asm114@hotmail.com'));

create policy "manager payments v2 insert"
  on public.payments
  for insert
  to authenticated
  with check (lower(coalesce(auth.jwt()->>'email','')) = lower('asm114@hotmail.com'));

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

  -- Every financial movement needs a stable immutable identifier.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_booking->'payments','[]'::jsonb)) payment
    where nullif(payment->>'id','') is null
  ) then
    raise exception 'payment_id_required' using errcode='22023';
  end if;

  select r.id, r.revision
    into v_reservation_id, v_current_revision
  from public.reservations r
  where r.legacy_booking_id=v_id
  for update;

  -- A booking save must never mutate an already-recorded financial movement.
  if v_reservation_id is not null and exists (
    select 1
    from jsonb_array_elements(coalesce(p_booking->'payments','[]'::jsonb)) incoming
    join public.payments p
      on p.reservation_id=v_reservation_id
     and p.legacy_payment_id=incoming->>'id'
    where p.source_hash is distinct from md5(incoming::text)
  ) then
    raise exception 'payment_history_is_immutable' using errcode='22023';
  end if;

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

  -- Append only: existing movements are left byte-for-byte intact.
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
  from jsonb_array_elements(coalesce(p_booking->'payments','[]'::jsonb)) payment
  on conflict (reservation_id, legacy_payment_id) do nothing;

  return query
  select v_reservation_id, v_id, v_code, v_new_revision, now();
end;
$$;

revoke all on function public.save_booking_v2(jsonb,bigint) from public;
grant execute on function public.save_booking_v2(jsonb,bigint) to authenticated;
