-- Staging compatibility migration.
-- Keeps the currently published customer portal working while public reads
-- migrate to customer_portal_unavailable_periods_public.
-- Internal booking metadata remains hidden from anon.

grant select (id, start_date, end_date)
on public.customer_portal_unavailable_periods
to anon;

revoke select (booking_id, source_type)
on public.customer_portal_unavailable_periods
from anon;
