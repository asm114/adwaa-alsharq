# Final Supabase Cleanup Audit

Project Ref: `ztqqdjryvecscidxxbfe`

## Result

`ztqqdjryvecscidxxbfe` is now dedicated to the standalone customer portal.

## Remaining public tables

- `customer_portal_activity_log`
- `customer_portal_admins`
- `customer_portal_contact`
- `customer_portal_feedback`
- `customer_portal_images`
- `customer_portal_pricing`
- `customer_portal_resort_info`
- `customer_portal_seasons`
- `customer_portal_unavailable_periods`
- `customer_portal_visitor_counter`

## Removed legacy tables

- `resort_activity_log`
- `resort_prices`
- `resort_feedback`
- `resort_media_submissions`
- `resort_site_settings`
- `resort_unavailable_dates`
- `resort_unavailable_periods`
- `resort_bookings`
- `app_state`
- `resort_admins`

## Removed legacy functions

- `check_resort_booking_overlap`
- `check_unavailable_period_overlap`
- `get_resort_availability`
- `log_resort_change`
- `log_resort_price_change`
- `cleaner_get_task`
- `cleaner_sanitize_issues`
- `cleaner_sanitize_photos`
- `cleaner_update_task`

## Validation

- No database metadata references remain for the legacy names.
- `is_resort_admin()` reads from `customer_portal_admins`.
- Admin RLS test passed.
- Non-admin RLS test passed.
- Public read test passed.
- Feedback RPC test passed in rollback.
- Visitor counter RPC test passed in rollback.
- Storage buckets exist with expected MIME and size limits.
