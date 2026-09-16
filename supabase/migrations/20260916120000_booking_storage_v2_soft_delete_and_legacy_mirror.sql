-- Booking storage v2 soft-delete and rollback-mirror support.
-- Final deletion never removes the reservation row or its financial ledger.
-- app_state.bookings remains a rollback-compatible mirror after cutover, while the
-- immutable pre-cutover snapshot remains in booking_migration_snapshots.

alter table public.reservations
  add column if not exists deleted_at timestamptz;
alter table public.reservations
  add column if not exists deleted_by text;

create index if not exists reservations_deleted_at_idx
  on public.reservations(deleted_at);

-- A soft-deleted booking must immediately stop blocking calendar availability.
alter table public.reservations
  drop constraint if exists reservations_no_active_date_overlap;

alter table public.reservations
  add constraint reservations_no_active_date_overlap
  exclude using gist (occupied_range with &&)
  where (deleted_at is null and coalesce(status, '') <> 'ملغي');

-- Authenticated clients may update a reservation through the manager path, but may
-- never hard-delete the row. Historical rows survive for audit/rollback purposes.
revoke delete on table public.reservations from authenticated;

create or replace function public.protect_deleted_booking_v2()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.deleted_at is not null and new is distinct from old then
    raise exception 'booking_deleted' using errcode='55000';
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_protect_deleted_v2 on public.reservations;
create trigger reservations_protect_deleted_v2
before update on public.reservations
for each row execute function public.protect_deleted_booking_v2();

create or replace function public.delete_booking_v2(
  p_booking_id text,
  p_expected_revision bigint
)
returns table (
  reservation_id uuid,
  legacy_booking_id text,
  revision bigint,
  deleted_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_id text := nullif(trim(p_booking_id),'');
  v_reservation_id uuid;
  v_current_revision bigint;
  v_current_deleted_at timestamptz;
  v_new_revision bigint;
  v_deleted_at timestamptz;
begin
  if lower(coalesce(auth.jwt()->>'email','')) <> lower('asm114@hotmail.com') then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if v_id is null then
    raise exception 'booking_id_required' using errcode='22023';
  end if;

  select r.id, r.revision, r.deleted_at
    into v_reservation_id, v_current_revision, v_current_deleted_at
  from public.reservations r
  where r.legacy_booking_id=v_id
  for update;

  if v_reservation_id is null then
    raise exception 'booking_not_found' using errcode='P0002';
  end if;

  -- Retry-safe: if the first delete committed but its response was lost, an immediate
  -- retry with the previous revision returns the same deleted row instead of failing.
  if v_current_deleted_at is not null then
    if p_expected_revision in (v_current_revision, v_current_revision-1) then
      return query select v_reservation_id, v_id, v_current_revision, v_current_deleted_at;
      return;
    end if;
    raise exception 'booking_revision_conflict' using errcode='40001';
  end if;

  if p_expected_revision is null or p_expected_revision <> v_current_revision then
    raise exception 'booking_revision_conflict' using errcode='40001';
  end if;

  update public.reservations r
  set deleted_at=now(),
      deleted_by=lower(coalesce(auth.jwt()->>'email','')),
      revision=r.revision+1,
      updated_at=now()
  where r.id=v_reservation_id
  returning r.revision, r.deleted_at into v_new_revision, v_deleted_at;

  -- Payments are intentionally untouched.
  return query select v_reservation_id, v_id, v_new_revision, v_deleted_at;
end;
$$;

revoke all on function public.delete_booking_v2(text,bigint) from public;
grant execute on function public.delete_booking_v2(text,bigint) to authenticated;

-- Rebuild only the bookings key in app_state from authoritative active v2 rows.
-- All unrelated app_state keys (expenses, settings, cleaning tasks, audit, etc.) remain intact.
create or replace function public.sync_booking_legacy_mirror_v2()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_bookings jsonb;
  v_count integer;
begin
  if lower(coalesce(auth.jwt()->>'email','')) <> lower('asm114@hotmail.com') then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  perform 1 from public.app_state where id='main' for update;
  if not found then
    raise exception 'legacy_state_missing' using errcode='P0002';
  end if;

  select
    coalesce(jsonb_agg(r.legacy_payload order by r.reservation_number), '[]'::jsonb),
    count(*)::integer
  into v_bookings, v_count
  from public.reservations r
  where r.legacy_booking_id is not null
    and r.deleted_at is null;

  update public.app_state
  set data=jsonb_set(data, '{bookings}', v_bookings, true),
      updated_at=now()
  where id='main';

  return v_count;
end;
$$;

revoke all on function public.sync_booking_legacy_mirror_v2() from public;
grant execute on function public.sync_booking_legacy_mirror_v2() to authenticated;
