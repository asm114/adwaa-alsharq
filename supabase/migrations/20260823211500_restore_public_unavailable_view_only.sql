-- Finalize the customer-portal calendar security posture after the corrected
-- resort/portal.js (which reads customer_portal_unavailable_periods_public)
-- is deployed to Staging.
--
-- IMPORTANT: this migration is intentionally NOT applied to the current
-- Staging deployment until the corrected portal.js is live there. Applying it
-- before that deployment would break the currently published calendar.

revoke select (id)
on public.customer_portal_unavailable_periods
from anon;

grant select (start_date, end_date)
on public.customer_portal_unavailable_periods
to anon;

revoke select (booking_id, source_type)
on public.customer_portal_unavailable_periods
from anon;
