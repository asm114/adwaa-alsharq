-- Customer Portal admin phase 1 task 6: contact information only.
-- Prepared for review and Staging application. Do not apply to Production without approval.

create table if not exists public.customer_portal_contact (
  id text primary key default 'main',
  whatsapp_number text not null,
  maps_url text not null,
  instagram_url text not null,
  email text not null default '',
  contact_hours text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint customer_portal_contact_singleton check (id = 'main'),
  constraint customer_portal_contact_whatsapp_digits check (whatsapp_number ~ '^[0-9]{8,15}$'),
  constraint customer_portal_contact_maps_url check (maps_url ~ '^https://'),
  constraint customer_portal_contact_instagram_url check (instagram_url ~ '^https://'),
  constraint customer_portal_contact_email_format check (email = '' or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint customer_portal_contact_hours_length check (char_length(contact_hours) between 1 and 500)
);

comment on table public.customer_portal_contact is
  'Public-safe Customer Portal contact information. Does not store messages, leads, bookings, customers, or internal communication logs.';

insert into public.customer_portal_contact (
  id,
  whatsapp_number,
  maps_url,
  instagram_url,
  email,
  contact_hours
) values (
  'main',
  '966560442799',
  'https://maps.app.goo.gl/uh8t93tMm5agNWvx7?g_st=com.google.maps.preview.copy',
  'https://www.instagram.com/adwaa_al_sharq_resort?igsh=ODg0Z3AxZnNld2Jx&utm_source=q',
  '',
  'يوميًا حسب أوقات استقبال الطلبات المعتمدة من الإدارة.'
)
on conflict (id) do nothing;

create or replace function public.set_customer_portal_contact_updated_at()
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

drop trigger if exists customer_portal_contact_set_updated_at
  on public.customer_portal_contact;
create trigger customer_portal_contact_set_updated_at
before update on public.customer_portal_contact
for each row execute function public.set_customer_portal_contact_updated_at();

alter table public.customer_portal_contact enable row level security;

revoke all on table public.customer_portal_contact from anon, authenticated;
grant select on table public.customer_portal_contact to anon, authenticated;
grant insert, update on table public.customer_portal_contact to authenticated;

drop policy if exists "public reads customer portal contact"
  on public.customer_portal_contact;
create policy "public reads customer portal contact"
on public.customer_portal_contact
for select
to anon, authenticated
using (id = 'main');

drop policy if exists "admins insert customer portal contact"
  on public.customer_portal_contact;
create policy "admins insert customer portal contact"
on public.customer_portal_contact
for insert
to authenticated
with check (public.is_resort_admin() and id = 'main');

drop policy if exists "admins update customer portal contact"
  on public.customer_portal_contact;
create policy "admins update customer portal contact"
on public.customer_portal_contact
for update
to authenticated
using (public.is_resort_admin())
with check (public.is_resort_admin() and id = 'main');
