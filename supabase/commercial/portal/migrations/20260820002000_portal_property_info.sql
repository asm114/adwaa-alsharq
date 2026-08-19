-- Commercial Customer Portal property information.
-- Schema only: customer identity is inserted later by the secure provisioning step.

create table if not exists public.customer_portal_resort_info (
  id text primary key default 'main',
  resort_name text not null,
  short_description text not null,
  detailed_description text not null,
  checkin_time text not null,
  checkout_time text not null,
  maps_url text not null default '',
  whatsapp_url text not null default '',
  instagram_url text not null default '',
  resort_address text not null default '',
  checkin_instructions text not null default '',
  features jsonb not null default '[]'::jsonb,
  booking_requests_open boolean not null default false,
  closed_message text not null default 'نعتذر، استقبال طلبات الحجز متوقف مؤقتًا في الوقت الحالي. يمكنكم التواصل معنا للاستفسار.',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint customer_portal_resort_info_singleton check (id = 'main'),
  constraint customer_portal_resort_info_name_length check (char_length(resort_name) between 1 and 120),
  constraint customer_portal_resort_info_short_length check (char_length(short_description) between 1 and 220),
  constraint customer_portal_resort_info_details_length check (char_length(detailed_description) between 1 and 2500),
  constraint customer_portal_resort_info_checkin_length check (char_length(checkin_time) between 1 and 80),
  constraint customer_portal_resort_info_checkout_length check (char_length(checkout_time) between 1 and 80),
  constraint customer_portal_resort_info_maps_url check (maps_url = '' or maps_url ~ '^https://'),
  constraint customer_portal_resort_info_whatsapp_url check (whatsapp_url = '' or whatsapp_url ~ '^https://'),
  constraint customer_portal_resort_info_instagram_url check (instagram_url = '' or instagram_url ~ '^https://'),
  constraint customer_portal_resort_info_address_length check (char_length(resort_address) <= 220),
  constraint customer_portal_resort_info_instructions_length check (char_length(checkin_instructions) <= 1500),
  constraint customer_portal_resort_info_features_array check (jsonb_typeof(features) = 'array'),
  constraint customer_portal_resort_info_closed_message_length check (char_length(closed_message) between 1 and 500)
);

comment on table public.customer_portal_resort_info is
  'Public-safe property information for one customer installation. Customer identity is provisioned separately from schema migrations.';

create or replace function public.set_customer_portal_resort_info_updated_at()
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

drop trigger if exists customer_portal_resort_info_set_updated_at
  on public.customer_portal_resort_info;
create trigger customer_portal_resort_info_set_updated_at
before update on public.customer_portal_resort_info
for each row execute function public.set_customer_portal_resort_info_updated_at();

alter table public.customer_portal_resort_info enable row level security;

revoke all on table public.customer_portal_resort_info from anon, authenticated;
grant select on table public.customer_portal_resort_info to anon, authenticated;
grant insert, update on table public.customer_portal_resort_info to authenticated;
grant select, insert, update, delete on table public.customer_portal_resort_info to service_role;

drop policy if exists "public reads customer portal resort info"
  on public.customer_portal_resort_info;
create policy "public reads customer portal resort info"
on public.customer_portal_resort_info
for select
to anon, authenticated
using (id = 'main');

drop policy if exists "admins insert customer portal resort info"
  on public.customer_portal_resort_info;
create policy "admins insert customer portal resort info"
on public.customer_portal_resort_info
for insert
to authenticated
with check (public.is_resort_admin() and id = 'main');

drop policy if exists "admins update customer portal resort info"
  on public.customer_portal_resort_info;
create policy "admins update customer portal resort info"
on public.customer_portal_resort_info
for update
to authenticated
using (public.is_resort_admin())
with check (public.is_resort_admin() and id = 'main');
