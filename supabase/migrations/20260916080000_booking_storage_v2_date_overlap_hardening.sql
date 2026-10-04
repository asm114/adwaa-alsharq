-- Booking storage v2 date-overlap hardening.
-- The browser already prevents overlapping resort stays, but the database must enforce
-- the same invariant so concurrent clients cannot create conflicting reservations.

alter table public.reservations
  add column if not exists occupied_range daterange
  generated always as (
    daterange(
      reservation_date,
      reservation_date + greatest(stay_days, 1),
      '[)'
    )
  ) stored;

-- Refuse to install the constraint if the migrated source itself already contains
-- an active overlap. Cancelled bookings intentionally do not block availability,
-- matching the existing application rule.
do $$
begin
  if exists (
    select 1
    from public.reservations a
    join public.reservations b
      on a.id < b.id
     and a.occupied_range && b.occupied_range
    where coalesce(a.status, '') <> 'ملغي'
      and coalesce(b.status, '') <> 'ملغي'
  ) then
    raise exception 'existing_booking_date_overlap' using errcode='23P01';
  end if;
end;
$$;

-- One resort can have only one non-cancelled booking occupying any calendar day.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.reservations'::regclass
      and conname='reservations_no_active_date_overlap'
  ) then
    alter table public.reservations
      add constraint reservations_no_active_date_overlap
      exclude using gist (occupied_range with &&)
      where (coalesce(status, '') <> 'ملغي');
  end if;
end;
$$;
