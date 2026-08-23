-- Staging-only calendar awareness layer.
-- Purpose: show government occasions and school-calendar awareness inside the admin calendar.
-- This table is informational only. It MUST NOT affect booking availability, pricing, payments,
-- customer portal availability, or any booking workflow.

do $$
begin
  if to_regprocedure('public.is_resort_admin()') is null then
    raise exception 'required staging baseline function public.is_resort_admin() is missing';
  end if;
end
$$;

create table if not exists public.resort_calendar_awareness_events (
  event_key text primary key,
  title text not null,
  category text not null check (category in ('government_holiday','school_holiday','school_milestone')),
  start_date date not null,
  end_date date not null,
  verification_status text not null check (verification_status in ('official','published','provisional')),
  scope text not null default 'saudi_general',
  source_name text not null,
  source_url text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint resort_calendar_awareness_events_date_order check (start_date <= end_date),
  constraint resort_calendar_awareness_events_title_length check (char_length(title) between 2 and 160)
);

comment on table public.resort_calendar_awareness_events is
  'Admin-only informational calendar layer. Never used to block dates or change booking/pricing logic.';

alter table public.resort_calendar_awareness_events enable row level security;

revoke all on table public.resort_calendar_awareness_events from public, anon, authenticated;
grant select, insert, update, delete on table public.resort_calendar_awareness_events to authenticated;

drop policy if exists "resort admins read calendar awareness events"
  on public.resort_calendar_awareness_events;
create policy "resort admins read calendar awareness events"
on public.resort_calendar_awareness_events
for select
to authenticated
using ((select public.is_resort_admin()));

drop policy if exists "resort admins insert calendar awareness events"
  on public.resort_calendar_awareness_events;
create policy "resort admins insert calendar awareness events"
on public.resort_calendar_awareness_events
for insert
to authenticated
with check ((select public.is_resort_admin()));

drop policy if exists "resort admins update calendar awareness events"
  on public.resort_calendar_awareness_events;
create policy "resort admins update calendar awareness events"
on public.resort_calendar_awareness_events
for update
to authenticated
using ((select public.is_resort_admin()))
with check ((select public.is_resort_admin()));

drop policy if exists "resort admins delete calendar awareness events"
  on public.resort_calendar_awareness_events;
create policy "resort admins delete calendar awareness events"
on public.resort_calendar_awareness_events
for delete
to authenticated
using ((select public.is_resort_admin()));

insert into public.resort_calendar_awareness_events
  (event_key,title,category,start_date,end_date,verification_status,scope,source_name,source_url,notes)
values
  ('school-start-1448-general','بداية الدراسة للطلاب','school_milestone','2026-08-23','2026-08-23','published','saudi_general','وزارة التعليم - التقويم الدراسي','https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx','الموعد العام لمعظم مناطق المملكة؛ توجد استثناءات محلية لبعض إدارات التعليم.'),
  ('national-day-2026','اليوم الوطني السعودي','government_holiday','2026-09-23','2026-09-23','official','saudi_all','مناسبة وطنية رسمية','https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx','تنبيه تشغيلي فقط ولا يحجز اليوم تلقائيًا.'),
  ('school-national-day-1448','إجازة اليوم الوطني للمدارس','school_holiday','2026-09-23','2026-09-24','published','saudi_general','وزارة التعليم - التقويم الدراسي','https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx','إجازة مدرسية؛ لا تؤثر في توفر المنتجع.'),
  ('school-autumn-break-1448','إجازة الخريف للمدارس','school_holiday','2026-11-20','2026-11-28','published','saudi_general','وزارة التعليم - التقويم الدراسي','https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx','تنبيه لارتفاع احتمالية الطلب خلال الإجازة.'),
  ('school-midyear-break-1448','إجازة منتصف العام للمدارس','school_holiday','2027-01-08','2027-01-16','published','saudi_general','وزارة التعليم - التقويم الدراسي','https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx','تنبيه لارتفاع احتمالية الطلب خلال الإجازة.'),
  ('school-semester-2-start-1448','بداية الفصل الدراسي الثاني','school_milestone','2027-01-17','2027-01-17','published','saudi_general','وزارة التعليم - التقويم الدراسي','https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx',null),
  ('founding-day-2027','يوم التأسيس','government_holiday','2027-02-22','2027-02-22','official','saudi_all','مناسبة وطنية رسمية','https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx','تنبيه تشغيلي فقط ولا يحجز اليوم تلقائيًا.'),
  ('school-founding-day-break-1448','إجازة يوم التأسيس للمدارس','school_holiday','2027-02-19','2027-02-22','published','saudi_general','التقويم الدراسي المنشور للعام 1448-1449','https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx','تعرض كإجازة مدارس مع إبقاء المصدر والحالة ظاهرة للمراجعة.'),
  ('school-eid-fitr-break-1448','إجازة عيد الفطر للمدارس','school_holiday','2027-02-26','2027-03-13','provisional','saudi_general','التقويم الدراسي المنشور للعام 1448-1449','https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx','موعد تقديري/قابل للتحديث حسب الإعلان الرسمي ورؤية الهلال.'),
  ('school-eid-adha-break-1448','إجازة عيد الأضحى للمدارس','school_holiday','2027-05-07','2027-05-22','provisional','saudi_general','التقويم الدراسي المنشور للعام 1448-1449','https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx','موعد تقديري/قابل للتحديث حسب الإعلان الرسمي ورؤية الهلال.'),
  ('school-year-end-1448','بداية إجازة نهاية العام الدراسي','school_milestone','2027-06-24','2027-06-24','published','saudi_general','وزارة التعليم - التقويم الدراسي','https://www.moe.gov.sa/ar/education/generaleducation/Pages/academicCalendar.aspx','تنبيه تخطيطي فقط.')
on conflict (event_key) do update
set title = excluded.title,
    category = excluded.category,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    verification_status = excluded.verification_status,
    scope = excluded.scope,
    source_name = excluded.source_name,
    source_url = excluded.source_url,
    notes = excluded.notes,
    is_active = true,
    updated_at = now();
