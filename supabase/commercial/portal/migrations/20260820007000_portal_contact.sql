-- Commercial Customer Portal contact information — fresh customer installations only.
-- Schema only: customer contact values are inserted later by secure provisioning/admin setup.

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
  'Public-safe contact information for one isolated customer deployment. Values are provisioned per customer; the template seeds none.';

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
grant select (id, whatsapp_number, maps_url, instagram_url, email, contact_hours)
  on table public.customer_portal_contact to anon;
grant select on table public.customer_portal_contact to authenticated;
grant insert, update on table public.customer_portal_contact to authenticated;

drop policy if exists "public reads customer portal contact"
  on public.customer_portal_contact;
create policy "public reads customer portal contact"
on public.customer_portal_contact
for select
to anon
using (id = 'main');

drop policy if exists "admins read customer portal contact"
  on public.customer_portal_contact;
create policy "admins read customer portal contact"
on public.customer_portal_contact
for select
to authenticated
using (public.is_resort_admin() and id = 'main');

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
using (public.is_resort_admin() and id = 'main')
with check (public.is_resort_admin() and id = 'main');
