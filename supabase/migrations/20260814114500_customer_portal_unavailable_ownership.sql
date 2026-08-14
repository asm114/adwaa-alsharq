-- Distinguish booking-generated unavailability from manual closures.
-- Existing rows are marked legacy so they can be reviewed/adopted safely without
-- silently deleting historical manual closures.

alter table public.customer_portal_unavailable_periods
  add column if not exists source_type text;

alter table public.customer_portal_unavailable_periods
  add column if not exists booking_id text;

update public.customer_portal_unavailable_periods
set source_type = 'legacy'
where source_type is null;

alter table public.customer_portal_unavailable_periods
  alter column source_type set default 'manual';

alter table public.customer_portal_unavailable_periods
  alter column source_type set not null;

alter table public.customer_portal_unavailable_periods
  drop constraint if exists customer_portal_unavailable_periods_source_type_check;

alter table public.customer_portal_unavailable_periods
  add constraint customer_portal_unavailable_periods_source_type_check
  check (source_type in ('legacy','manual','booking'));

alter table public.customer_portal_unavailable_periods
  drop constraint if exists customer_portal_unavailable_periods_booking_owner_check;

alter table public.customer_portal_unavailable_periods
  add constraint customer_portal_unavailable_periods_booking_owner_check
  check (
    (source_type = 'booking' and nullif(btrim(booking_id), '') is not null)
    or
    (source_type in ('legacy','manual') and booking_id is null)
  );

create index if not exists customer_portal_unavailable_periods_booking_idx
  on public.customer_portal_unavailable_periods (booking_id, start_date, end_date)
  where source_type = 'booking';

comment on column public.customer_portal_unavailable_periods.source_type is
  'Ownership of the closure: legacy (pre-ownership row), manual (admin closure), or booking (generated from an admin booking).';

comment on column public.customer_portal_unavailable_periods.booking_id is
  'Admin booking identifier when source_type=booking. Kept as text because the booking state lives in a separate Supabase project.';
