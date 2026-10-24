-- MANUAL EMERGENCY ROLLBACK ONLY — never executed by migrations or application startup.
-- Purpose: rebuild only app_state.data.bookings from authoritative active v2 rows before
-- redeploying the pre-v2 application. All v2 tables and payment history remain intact.
--
-- Required operating sequence:
-- 1) stop/disable booking writes in the application;
-- 2) run this script as an administrator;
-- 3) verify the final counts/hash output;
-- 4) only then redeploy the previous stable application version.

begin;

-- Serialize against legacy-state changes while the rollback mirror is rebuilt.
select 1
from public.app_state
where id='main'
for update;

-- Keep another immutable copy of the exact legacy state immediately before rollback reconciliation.
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

-- Abort if any active v2 booking is structurally incomplete.
do $$
begin
  if exists (
    select 1
    from public.reservations r
    where r.deleted_at is null
      and r.legacy_booking_id is not null
      and (
        nullif(r.booking_code,'') is null
        or r.legacy_payload is null
        or jsonb_typeof(r.legacy_payload) <> 'object'
        or nullif(r.legacy_payload->>'id','') is null
        or nullif(r.legacy_payload->>'code','') is null
      )
  ) then
    raise exception 'rollback_active_booking_payload_invalid' using errcode='22023';
  end if;
end;
$$;

-- Abort if the immutable payment ledger and each booking's legacy payload disagree in
-- count, IDs, or exact JSON. Rollback must never guess or silently drop financial history.
do $$
begin
  if exists (
    select 1
    from public.reservations r
    where r.deleted_at is null
      and r.legacy_booking_id is not null
      and jsonb_array_length(coalesce(r.legacy_payload->'payments','[]'::jsonb)) <>
          (select count(*) from public.payments p where p.reservation_id=r.id)
  ) then
    raise exception 'rollback_payment_count_mismatch' using errcode='22023';
  end if;

  if exists (
    select 1
    from public.reservations r
    cross join lateral jsonb_array_elements(coalesce(r.legacy_payload->'payments','[]'::jsonb)) movement
    left join public.payments p
      on p.reservation_id=r.id
     and p.legacy_payment_id=movement->>'id'
    where r.deleted_at is null
      and r.legacy_booking_id is not null
      and (
        nullif(movement->>'id','') is null
        or p.id is null
        or p.source_hash is distinct from md5(movement::text)
      )
  ) then
    raise exception 'rollback_payment_payload_mismatch' using errcode='22023';
  end if;

  if exists (
    select 1
    from public.payments p
    join public.reservations r on r.id=p.reservation_id
    where r.deleted_at is null
      and r.legacy_booking_id is not null
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(r.legacy_payload->'payments','[]'::jsonb)) movement
        where movement->>'id'=p.legacy_payment_id
          and md5(movement::text)=p.source_hash
      )
  ) then
    raise exception 'rollback_payment_ledger_not_in_payload' using errcode='22023';
  end if;

  if exists (
    select 1
    from public.reservations r
    where r.deleted_at is null
      and r.legacy_booking_id is not null
      and coalesce((r.legacy_payload->>'paid')::numeric,0) <>
          coalesce((select sum(p.amount) from public.payments p where p.reservation_id=r.id),0)
  ) then
    raise exception 'rollback_paid_total_mismatch' using errcode='22023';
  end if;
end;
$$;

-- Replace the bookings key only. Expenses/settings/audit/cleaning/etc. remain exactly as-is.
with authoritative as (
  select coalesce(
    jsonb_agg(r.legacy_payload order by r.reservation_number),
    '[]'::jsonb
  ) as bookings
  from public.reservations r
  where r.legacy_booking_id is not null
    and r.deleted_at is null
)
update public.app_state s
set data=jsonb_set(s.data,'{bookings}',authoritative.bookings,true),
    updated_at=now()
from authoritative
where s.id='main';

-- Final in-transaction verification; any mismatch aborts the entire rollback mirror write.
do $$
declare
  v_active integer;
  v_legacy integer;
begin
  select count(*)::integer into v_active
  from public.reservations
  where legacy_booking_id is not null and deleted_at is null;

  select jsonb_array_length(coalesce(data->'bookings','[]'::jsonb)) into v_legacy
  from public.app_state where id='main';

  if v_active <> v_legacy then
    raise exception 'rollback_final_booking_count_mismatch' using errcode='22023';
  end if;
end;
$$;

commit;

-- Operator verification output. Keep v2 intact even after a successful rollback.
select
  (select count(*) from public.reservations where legacy_booking_id is not null and deleted_at is null) as active_v2_bookings,
  (select jsonb_array_length(coalesce(data->'bookings','[]'::jsonb)) from public.app_state where id='main') as app_state_bookings,
  (select count(*) from public.payments p join public.reservations r on r.id=p.reservation_id where r.legacy_booking_id is not null and r.deleted_at is null) as active_payment_rows,
  (select coalesce(sum(p.amount),0) from public.payments p join public.reservations r on r.id=p.reservation_id where r.legacy_booking_id is not null and r.deleted_at is null) as active_payment_total,
  (select md5(data::text) from public.app_state where id='main') as app_state_hash;
