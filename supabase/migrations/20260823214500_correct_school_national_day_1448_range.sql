-- Correct the 1448-1449 school National Day break range on Staging.
-- Informational calendar awareness only; does not affect booking availability or pricing.

update public.resort_calendar_awareness_events
set end_date = date '2026-09-26',
    notes = 'إجازة مدرسية 23–26 سبتمبر 2026؛ لا تؤثر في توفر المنتجع.',
    updated_at = now()
where event_key = 'school-national-day-1448';
