-- Secure worker property check flow for the dedicated customer-portal backend.
-- Apply to the dedicated portal Supabase project (ztqqdjryvecscidxxbfe), not the core app_state project.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create table if not exists public.customer_portal_worker_checks (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null,
  booking_code text not null default '',
  booking_date date,
  property_name text not null check (char_length(property_name) between 1 and 120),
  property_type text not null check (char_length(property_type) between 1 and 60),
  access_token_hash text not null,
  status text not null default 'ready' check (status in ('ready','submitted','reviewed')),
  issue_types text[] not null default '{}',
  photo_paths text[] not null default '{}',
  voice_path text not null default '',
  shared_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint customer_portal_worker_checks_photo_limit check (cardinality(photo_paths) <= 6)
);

create index if not exists customer_portal_worker_checks_booking_idx
on public.customer_portal_worker_checks(booking_id, created_at desc);
create index if not exists customer_portal_worker_checks_status_idx
on public.customer_portal_worker_checks(status, submitted_at desc nulls last);
create unique index if not exists customer_portal_worker_checks_token_idx
on public.customer_portal_worker_checks(access_token_hash);

alter table public.customer_portal_worker_checks enable row level security;
revoke all on public.customer_portal_worker_checks from public, anon, authenticated;
grant select, insert, update on public.customer_portal_worker_checks to authenticated;

drop policy if exists "admins read worker checks" on public.customer_portal_worker_checks;
create policy "admins read worker checks"
on public.customer_portal_worker_checks for select to authenticated
using (public.is_resort_admin());

drop policy if exists "admins create worker checks" on public.customer_portal_worker_checks;
create policy "admins create worker checks"
on public.customer_portal_worker_checks for insert to authenticated
with check (public.is_resort_admin() and created_by = auth.uid());

drop policy if exists "admins update worker checks" on public.customer_portal_worker_checks;
create policy "admins update worker checks"
on public.customer_portal_worker_checks for update to authenticated
using (public.is_resort_admin())
with check (public.is_resort_admin());

create or replace function public.create_customer_portal_worker_check(
  p_booking_id text,
  p_booking_code text,
  p_booking_date date,
  p_property_name text,
  p_property_type text
)
returns table(check_id uuid, access_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
  v_token text := gen_random_uuid()::text || replace(gen_random_uuid()::text, '-', '');
begin
  if not public.is_resort_admin() then raise exception 'not authorized'; end if;
  if char_length(trim(coalesce(p_booking_id,''))) not between 1 and 160 then raise exception 'invalid booking id'; end if;
  if char_length(trim(coalesce(p_booking_code,''))) > 80 then raise exception 'invalid booking code'; end if;
  if char_length(trim(coalesce(p_property_name,''))) not between 1 and 120 then raise exception 'invalid property name'; end if;
  if char_length(trim(coalesce(p_property_type,''))) not between 1 and 60 then raise exception 'invalid property type'; end if;

  select id, status into v_id, v_status
  from public.customer_portal_worker_checks
  where booking_id = p_booking_id and status in ('ready','submitted')
  order by created_at desc
  limit 1;

  if v_status = 'submitted' then
    raise exception 'worker check already submitted';
  elsif v_id is null then
    insert into public.customer_portal_worker_checks(
      booking_id, booking_code, booking_date, property_name, property_type,
      access_token_hash, status, created_by
    ) values (
      trim(p_booking_id), trim(coalesce(p_booking_code,'')), p_booking_date,
      trim(p_property_name), trim(p_property_type),
      encode(extensions.digest(v_token,'sha256'),'hex'), 'ready', auth.uid()
    ) returning id into v_id;
  else
    update public.customer_portal_worker_checks
    set booking_code = trim(coalesce(p_booking_code,'')),
        booking_date = p_booking_date,
        property_name = trim(p_property_name),
        property_type = trim(p_property_type),
        access_token_hash = encode(extensions.digest(v_token,'sha256'),'hex'),
        shared_at = null,
        updated_at = now()
    where id = v_id;
  end if;

  check_id := v_id;
  access_token := v_token;
  return next;
end;
$$;

create or replace function public.get_customer_portal_worker_check(p_access_token text)
returns table(
  check_id uuid,
  booking_code text,
  booking_date date,
  property_name text,
  property_type text,
  status text,
  submitted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.booking_code, c.booking_date, c.property_name, c.property_type, c.status, c.submitted_at
  from public.customer_portal_worker_checks c
  where c.access_token_hash = encode(extensions.digest(coalesce(p_access_token,''),'sha256'),'hex')
    and c.created_at >= now() - interval '14 days'
  limit 1
$$;

create or replace function private.can_upload_customer_portal_worker_check(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.customer_portal_worker_checks c
    where c.id::text = (storage.foldername(p_name))[1]
      and c.access_token_hash = encode(extensions.digest((storage.foldername(p_name))[2], 'sha256'), 'hex')
      and c.status = 'ready'
      and c.created_at >= now() - interval '14 days'
  )
$$;

create or replace function public.finalize_customer_portal_worker_check(
  p_access_token text,
  p_issue_types text[] default '{}',
  p_photo_paths text[] default '{}',
  p_voice_path text default ''
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_path text;
  v_issue text;
begin
  select c.id into v_id
  from public.customer_portal_worker_checks c
  where c.access_token_hash = encode(extensions.digest(coalesce(p_access_token,''),'sha256'),'hex')
    and c.status = 'ready'
    and c.created_at >= now() - interval '14 days'
  limit 1;

  if v_id is null then raise exception 'invalid or expired worker check'; end if;
  if cardinality(coalesce(p_photo_paths,'{}')) < 1 or cardinality(coalesce(p_photo_paths,'{}')) > 6 then raise exception 'invalid photo count'; end if;
  if cardinality(coalesce(p_issue_types,'{}')) > 6 then raise exception 'too many issue types'; end if;

  foreach v_issue in array coalesce(p_issue_types,'{}') loop
    if v_issue not in ('ok','damage_furniture','damage_electrical','damage_water','damage_glass','damage_building','extra_dirt') then
      raise exception 'invalid issue type';
    end if;
  end loop;

  foreach v_path in array coalesce(p_photo_paths,'{}') loop
    if v_path not like v_id::text || '/' || p_access_token || '/%'
       or not exists(
         select 1 from storage.objects o
         where o.bucket_id = 'customer-portal-worker-checks' and o.name = v_path
       ) then
      raise exception 'invalid photo path';
    end if;
  end loop;

  if coalesce(p_voice_path,'') <> '' then
    if p_voice_path not like v_id::text || '/' || p_access_token || '/%'
       or not exists(
         select 1 from storage.objects o
         where o.bucket_id = 'customer-portal-worker-checks' and o.name = p_voice_path
       ) then
      raise exception 'invalid voice path';
    end if;
  end if;

  update public.customer_portal_worker_checks
  set issue_types = coalesce(p_issue_types,'{}'),
      photo_paths = coalesce(p_photo_paths,'{}'),
      voice_path = coalesce(p_voice_path,''),
      status = 'submitted',
      submitted_at = now(),
      updated_at = now()
  where id = v_id;

  return true;
end;
$$;

revoke all on function public.create_customer_portal_worker_check(text,text,date,text,text) from public;
revoke all on function public.get_customer_portal_worker_check(text) from public;
revoke all on function public.finalize_customer_portal_worker_check(text,text[],text[],text) from public;
revoke all on function private.can_upload_customer_portal_worker_check(text) from public;
grant execute on function public.create_customer_portal_worker_check(text,text,date,text,text) to authenticated;
grant execute on function public.get_customer_portal_worker_check(text) to anon, authenticated;
grant execute on function public.finalize_customer_portal_worker_check(text,text[],text[],text) to anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.can_upload_customer_portal_worker_check(text) to anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'customer-portal-worker-checks',
  'customer-portal-worker-checks',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp','audio/webm','audio/mp4','audio/mpeg','audio/aac','audio/ogg']
)
on conflict(id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "worker uploads worker check media" on storage.objects;
create policy "worker uploads worker check media"
on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'customer-portal-worker-checks'
  and private.can_upload_customer_portal_worker_check(name)
);

drop policy if exists "admins read worker check media" on storage.objects;
create policy "admins read worker check media"
on storage.objects for select to authenticated
using (
  bucket_id = 'customer-portal-worker-checks'
  and public.is_resort_admin()
);

drop policy if exists "admins delete worker check media" on storage.objects;
create policy "admins delete worker check media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'customer-portal-worker-checks'
  and public.is_resort_admin()
);

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customer_portal_worker_checks'
  ) then
    alter publication supabase_realtime add table public.customer_portal_worker_checks;
  end if;
end;
$$;
