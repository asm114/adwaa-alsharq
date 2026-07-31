-- Customer Portal admin phase 1 task 3: image management only.
-- Prepared for review and Staging application. Do not apply to Production without approval.

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
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.customer_portal_images (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'general',
  title text not null default '',
  description text not null default '',
  image_alt text not null default '',
  image_url text not null,
  display_order integer not null default 0,
  is_cover boolean not null default false,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint customer_portal_images_category_check check (
    category in (
      'general',
      'green_area',
      'pool',
      'tent',
      'men''s_majlis',
      'indoor_hall',
      'kitchen',
      'double_bedroom',
      'six_beds_room',
      'extra_room',
      'outdoor_session'
    )
  ),
  constraint customer_portal_images_title_length check (char_length(title) <= 140),
  constraint customer_portal_images_description_length check (char_length(description) <= 500),
  constraint customer_portal_images_alt_length check (char_length(image_alt) <= 180),
  constraint customer_portal_images_url_check check (image_url ~ '^https://'),
  constraint customer_portal_images_order_check check (display_order >= 0)
);

comment on table public.customer_portal_images is
  'Public-safe Customer Portal resort gallery images. Does not store bookings, customers, prices, seasons, or unavailable dates.';
comment on column public.customer_portal_images.category is
  'Flexible image category for resort areas. New sections can be represented without changing table structure.';
comment on column public.customer_portal_images.image_alt is
  'Alternative text for accessibility and SEO.';
comment on column public.customer_portal_images.updated_by is
  'Last admin user who changed image metadata.';

create index if not exists customer_portal_images_public_order_idx
  on public.customer_portal_images (is_visible, display_order, created_at);
create index if not exists customer_portal_images_category_order_idx
  on public.customer_portal_images (category, display_order, created_at);
create unique index if not exists customer_portal_images_single_cover_per_category_idx
  on public.customer_portal_images (category)
  where is_cover;

create or replace function public.set_customer_portal_images_updated_at()
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

drop trigger if exists customer_portal_images_set_updated_at
  on public.customer_portal_images;
create trigger customer_portal_images_set_updated_at
before update on public.customer_portal_images
for each row execute function public.set_customer_portal_images_updated_at();

alter table public.customer_portal_images enable row level security;

revoke all on table public.customer_portal_images from anon, authenticated;
grant select on table public.customer_portal_images to anon, authenticated;
grant insert, update, delete on table public.customer_portal_images to authenticated;

drop policy if exists "public reads visible customer portal images"
  on public.customer_portal_images;
create policy "public reads visible customer portal images"
on public.customer_portal_images
for select
to anon, authenticated
using (is_visible = true);

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
with check (public.is_resort_admin());

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

drop policy if exists "public reads customer portal image files"
  on storage.objects;
create policy "public reads customer portal image files"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'customer-portal-images');

drop policy if exists "admins upload customer portal image files"
  on storage.objects;
create policy "admins upload customer portal image files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'customer-portal-images'
  and public.is_resort_admin()
);

drop policy if exists "admins update customer portal image files"
  on storage.objects;
create policy "admins update customer portal image files"
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
);

drop policy if exists "admins delete customer portal image files"
  on storage.objects;
create policy "admins delete customer portal image files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'customer-portal-images'
  and public.is_resort_admin()
);
