-- Remove legacy system tables and functions after customer portal admins have
-- been moved to customer_portal_admins and RLS tests have passed.

do $$
begin
  if to_regclass('public.resort_bookings') is not null then
    drop trigger if exists check_resort_booking_overlap_trigger on public.resort_bookings;
    drop trigger if exists resort_booking_overlap_guard on public.resort_bookings;
    drop trigger if exists log_resort_bookings_change on public.resort_bookings;
    drop trigger if exists log_resort_bookings on public.resort_bookings;
  end if;

  if to_regclass('public.resort_unavailable_periods') is not null then
    drop trigger if exists check_unavailable_period_overlap_trigger on public.resort_unavailable_periods;
    drop trigger if exists resort_unavailable_period_overlap_guard on public.resort_unavailable_periods;
    drop trigger if exists resort_unavailable_overlap_guard on public.resort_unavailable_periods;
    drop trigger if exists log_resort_unavailable_periods_change on public.resort_unavailable_periods;
  end if;

  if to_regclass('public.resort_prices') is not null then
    drop trigger if exists log_resort_prices_change on public.resort_prices;
    drop trigger if exists log_resort_prices on public.resort_prices;
  end if;
end;
$$;

drop function if exists public.check_resort_booking_overlap();
drop function if exists public.check_unavailable_period_overlap();
drop function if exists public.get_resort_availability(date, date);
drop function if exists public.log_resort_change();
drop function if exists public.log_resort_price_change();
drop function if exists public.cleaner_get_task(uuid, text);
drop function if exists public.cleaner_sanitize_issues(jsonb, boolean);
drop function if exists public.cleaner_sanitize_photos(jsonb, boolean);
drop function if exists public.cleaner_update_task(uuid, text, bigint, jsonb);

drop table if exists public.resort_activity_log cascade;
drop table if exists public.resort_prices cascade;
drop table if exists public.resort_feedback cascade;
drop table if exists public.resort_media_submissions cascade;
drop table if exists public.resort_site_settings cascade;
drop table if exists public.resort_unavailable_dates cascade;
drop table if exists public.resort_unavailable_periods cascade;
drop table if exists public.resort_bookings cascade;
drop table if exists public.app_state cascade;
drop table if exists public.resort_admins cascade;
