-- Customer portal administration, phase 1.
-- Prepared for review only. Do not apply to Production.

create table if not exists public.customer_portal_settings (
  id text primary key default 'main',
  whatsapp_number text not null,
  instagram_url text not null,
  maps_url text not null,
  booking_requests_open boolean not null default true,
  pause_message text not null default 'نعتذر، استقبال طلبات الحجز متوقف مؤقتًا في الوقت الحالي. يمكنكم التواصل معنا عبر واتساب للاستفسار.',
  daily_price numeric(10,2),
  overnight_fee numeric(10,2) not null default 100,
  overnight_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint customer_portal_settings_singleton check (id = 'main'),
  constraint customer_portal_settings_whatsapp check (whatsapp_number ~ '^9665[0-9]{8}$'),
  constraint customer_portal_settings_instagram_url check (instagram_url ~ '^https://'),
  constraint customer_portal_settings_maps_url check (maps_url ~ '^https://'),
  constraint customer_portal_settings_daily_price check (daily_price is null or daily_price >= 0),
  constraint customer_portal_settings_overnight_fee check (overnight_fee >= 0),
  constraint customer_portal_settings_pause_message_length check (char_length(pause_message) between 1 and 500)
);

comment on table public.customer_portal_settings is
  'Public-safe, centrally managed customer portal settings. Fixed marketing copy remains in source control.';
comment on column public.customer_portal_settings.overnight_fee is
  'One fee per overnight booking, not a fee per night.';

insert into public.customer_portal_settings (
  id,
  whatsapp_number,
  instagram_url,
  maps_url,
  booking_requests_open,
  pause_message,
  daily_price,
  overnight_fee,
  overnight_enabled
) values (
  'main',
  '966560442799',
  'https://www.instagram.com/adwaa_al_sharq_resort?igsh=ODg0Z3AxZnNld2Jx&utm_source=q',
  'https://maps.app.goo.gl/uh8t93tMm5agNWvx7?g_st=com.google.maps.preview.copy',
  true,
  'نعتذر، استقبال طلبات الحجز متوقف مؤقتًا في الوقت الحالي. يمكنكم التواصل معنا عبر واتساب للاستفسار.',
  null,
  100,
  true
)
on conflict (id) do nothing;

create table if not exists public.customer_portal_images (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  alt_text text,
  sort_order integer not null default 0,
  is_hero boolean not null default false,
  is_visible boolean not null default true,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint customer_portal_images_path check (
    storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  ),
  constraint customer_portal_images_alt_length check (
    alt_text is null or char_length(alt_text) <= 240
  ),
  constraint customer_portal_images_sort_order check (sort_order >= 0),
  constraint customer_portal_images_mime_type check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  constraint customer_portal_images_size check (
    size_bytes > 0 and size_bytes <= 10485760
  )
);

comment on table public.customer_portal_images is
  'Metadata for resort images stored in the customer-portal-images bucket.';

create unique index if not exists customer_portal_images_one_hero_idx
  on public.customer_portal_images ((is_hero))
  where is_hero;

create index if not exists customer_portal_images_public_order_idx
  on public.customer_portal_images (is_visible, sort_order, created_at);

create or replace function public.get_resort_date_availability(
  requested_start date,
  requested_end date
)
returns table (
  booking_date date,
  availability text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    day_value::date,
    case
      when exists (
        select 1
        from public.resort_bookings booking
        where booking.status = 'booked'
          and day_value::date between booking.start_date and booking.end_date
      ) then 'booked'
      when exists (
        select 1
        from public.resort_unavailable_dates blocked
        where day_value::date between blocked.start_date and blocked.end_date
      ) or exists (
        select 1
        from public.resort_unavailable_periods blocked
        where day_value::date between blocked.start_date and blocked.end_date
      ) then 'unavailable'
      else 'available'
    end
  from generate_series(requested_start, requested_end, interval '1 day') day_value
  where requested_start is not null
    and requested_end is not null
    and requested_end >= requested_start
    and requested_end - requested_start <= 30;
$$;

comment on function public.get_resort_date_availability(date, date) is
  'Returns public-safe availability only; never exposes customer or internal booking data.';

revoke all on function public.get_resort_date_availability(date, date) from public;
grant execute on function public.get_resort_date_availability(date, date) to anon, authenticated;

create or replace function public.set_customer_portal_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists customer_portal_settings_set_updated_at
  on public.customer_portal_settings;
create trigger customer_portal_settings_set_updated_at
before update on public.customer_portal_settings
for each row execute function public.set_customer_portal_updated_at();

drop trigger if exists customer_portal_images_set_updated_at
  on public.customer_portal_images;
create trigger customer_portal_images_set_updated_at
before update on public.customer_portal_images
for each row execute function public.set_customer_portal_updated_at();

alter table public.customer_portal_settings enable row level security;
alter table public.customer_portal_images enable row level security;

revoke all on table public.customer_portal_settings from anon, authenticated;
revoke all on table public.customer_portal_images from anon, authenticated;
grant select on table public.customer_portal_settings to anon, authenticated;
grant select on table public.customer_portal_images to anon, authenticated;
grant insert, update on table public.customer_portal_settings to authenticated;
grant insert, update, delete on table public.customer_portal_images to authenticated;

drop policy if exists "public reads customer portal settings"
  on public.customer_portal_settings;
create policy "public reads customer portal settings"
on public.customer_portal_settings
for select
to anon, authenticated
using (id = 'main');

drop policy if exists "admins insert customer portal settings"
  on public.customer_portal_settings;
create policy "admins insert customer portal settings"
on public.customer_portal_settings
for insert
to authenticated
with check (public.is_resort_admin() and id = 'main');

drop policy if exists "admins update customer portal settings"
  on public.customer_portal_settings;
create policy "admins update customer portal settings"
on public.customer_portal_settings
for update
to authenticated
using (public.is_resort_admin())
with check (public.is_resort_admin() and id = 'main');

drop policy if exists "public reads visible customer portal images"
  on public.customer_portal_images;
create policy "public reads visible customer portal images"
on public.customer_portal_images
for select
to anon, authenticated
using (is_visible);

drop policy if exists "admins read all customer portal images"
  on public.customer_portal_images;
create policy "admins read all customer portal images"
on public.customer_portal_images
for select
to authenticated
using (public.is_resort_admin());

drop policy if exists "admins insert customer portal images"
  on public.customer_portal_images;
create policy "admins insert customer portal images"
on public.customer_portal_images
for insert
to authenticated
with check (
  public.is_resort_admin()
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists "admins update customer portal images"
  on public.customer_portal_images;
create policy "admins update customer portal images"
on public.customer_portal_images
for update
to authenticated
using (public.is_resort_admin())
with check (public.is_resort_admin());

drop policy if exists "admins delete customer portal images"
  on public.customer_portal_images;
create policy "admins delete customer portal images"
on public.customer_portal_images
for delete
to authenticated
using (public.is_resort_admin());

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'customer-portal-images',
  'customer-portal-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public reads customer portal image objects"
  on storage.objects;
create policy "public reads customer portal image objects"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'customer-portal-images');

drop policy if exists "admins insert customer portal image objects"
  on storage.objects;
create policy "admins insert customer portal image objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'customer-portal-images'
  and public.is_resort_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
  and lower(storage.extension(name)) in ('jpg', 'png', 'webp')
);

drop policy if exists "admins update customer portal image objects"
  on storage.objects;
create policy "admins update customer portal image objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'customer-portal-images'
  and public.is_resort_admin()
)
with check (
  bucket_id = 'customer-portal-images'
  and public.is_resort_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
  and lower(storage.extension(name)) in ('jpg', 'png', 'webp')
);

drop policy if exists "admins delete customer portal image objects"
  on storage.objects;
create policy "admins delete customer portal image objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'customer-portal-images'
  and public.is_resort_admin()
);
