-- Commercial Worker Checks — fresh customer installations only.
-- Customer-neutral: no AAS identity, customer data, project refs, operational rows, or secrets.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create table if not exists public.customer_portal_worker_checks (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null,
  booking_code text not null default '',
  booking_date date,
  property_name text not null,
  property_type text not null,
  access_token_hash text not null,
  status text not null default 'ready',
  issue_types text[] not null default '{}',
  photo_paths text[] not null default '{}',
  voice_path text not null default '',
  shared_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint customer_portal_worker_checks_booking_id_length
    check (char_length(booking_id) between 1 and 160),
  constraint customer_portal_worker_checks_booking_code_length
    check (char_length(booking_code) <= 80),
  constraint customer_portal_worker_checks_property_name_length
    check (char_length(property_name) between 1 and 120),
  constraint customer_portal_worker_checks_property_type_length
    check (char_length(property_type) between 1 and 60),
  constraint customer_portal_worker_checks_token_hash
    check (access_token_hash ~ '^[0-9a-f]{64}$'),
  constraint customer_portal_worker_checks_status
    check (status in ('ready','submitted','reviewed')),
  constraint customer_portal_worker_checks_issue_limit
    check (cardinality(issue_types) <= 6),
  constraint customer_portal_worker_checks_issue_values
    check (issue_types <@ array[
      'ok','damage_furniture','damage_electrical','damage_water',
      'damage_glass','damage_building','extra_dirt'
    ]::text[]),
  constraint customer_portal_worker_checks_ok_exclusive
    check (not ('ok' = any(issue_types) and cardinality(issue_types) > 1)),
  constraint customer_portal_worker_checks_photo_limit
    check (cardinality(photo_paths) <= 6)
);

comment on table public.customer_portal_worker_checks is
  'Private worker inspection reports for one isolated customer installation. Public workers access only short-lived token RPCs; portal admins manage reports.';
comment on column public.customer_portal_worker_checks.access_token_hash is
  'One-way SHA-256 hash for the short-lived worker link token. The raw token is never stored in the table.';

create index if not exists customer_portal_worker_checks_booking_idx
  on public.customer_portal_worker_checks (booking_id, created_at desc);
create index if not exists customer_portal_worker_checks_status_idx
  on public.customer_portal_worker_checks (status, submitted_at desc nulls last);
create unique index if not exists customer_portal_worker_checks_token_idx
  on public.customer_portal_worker_checks (access_token_hash);
create unique index if not exists customer_portal_worker_checks_one_active_booking_idx
  on public.customer_portal_worker_checks (booking_id)
  where status in ('ready','submitted');

alter table public.customer_portal_worker_checks enable row level security;
revoke all on table public.customer_portal_worker_checks from public, anon, authenticated;
grant select, insert, update, delete on table public.customer_portal_worker_checks to authenticated;
grant select, insert, update, delete on table public.customer_portal_worker_checks to service_role;

drop policy if exists "admins read worker checks" on public.customer_portal_worker_checks;
create policy "admins read worker checks"
on public.customer_portal_worker_checks
for select
to authenticated
using (public.is_resort_admin());

drop policy if exists "admins create worker checks" on public.customer_portal_worker_checks;
create policy "admins create worker checks"
on public.customer_portal_worker_checks
for insert
to authenticated
with check (public.is_resort_admin() and created_by = (select auth.uid()));

drop policy if exists "admins update worker checks" on public.customer_portal_worker_checks;
create policy "admins update worker checks"
on public.customer_portal_worker_checks
for update
to authenticated
using (public.is_resort_admin())
with check (public.is_resort_admin());

drop policy if exists "admins delete worker checks" on public.customer_portal_worker_checks;
create policy "admins delete worker checks"
on public.customer_portal_worker_checks
for delete
to authenticated
using (public.is_resort_admin());

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
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if not public.is_resort_admin() then
    raise exception 'not authorized';
  end if;

  if char_length(trim(coalesce(p_booking_id, ''))) not between 1 and 160 then
    raise exception 'invalid booking id';
  end if;
  if char_length(trim(coalesce(p_booking_code, ''))) > 80 then
    raise exception 'invalid booking code';
  end if;
  if char_length(trim(coalesce(p_property_name, ''))) not between 1 and 120 then
    raise exception 'invalid property name';
  end if;
  if char_length(trim(coalesce(p_property_type, ''))) not between 1 and 60 then
    raise exception 'invalid property type';
  end if;

  perform pg_advisory_xact_lock(hashtext(trim(p_booking_id)));

  select c.id, c.status
    into v_id, v_status
  from public.customer_portal_worker_checks c
  where c.booking_id = trim(p_booking_id)
    and c.status in ('ready','submitted')
  order by c.created_at desc
  limit 1;

  if v_status = 'submitted' then
    raise exception 'worker check already submitted';
  elsif v_id is null then
    insert into public.customer_portal_worker_checks (
      booking_id,
      booking_code,
      booking_date,
      property_name,
      property_type,
      access_token_hash,
      status,
      created_by
    ) values (
      trim(p_booking_id),
      trim(coalesce(p_booking_code, '')),
      p_booking_date,
      trim(p_property_name),
      trim(p_property_type),
      encode(extensions.digest(v_token, 'sha256'), 'hex'),
      'ready',
      (select auth.uid())
    )
    returning id into v_id;
  else
    update public.customer_portal_worker_checks
       set booking_code = trim(coalesce(p_booking_code, '')),
           booking_date = p_booking_date,
           property_name = trim(p_property_name),
           property_type = trim(p_property_type),
           access_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
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
  select
    c.id,
    c.booking_code,
    c.booking_date,
    c.property_name,
    c.property_type,
    c.status,
    c.submitted_at
  from public.customer_portal_worker_checks c
  where char_length(coalesce(p_access_token, '')) between 32 and 128
    and c.access_token_hash = encode(
      extensions.digest(coalesce(p_access_token, ''), 'sha256'),
      'hex'
    )
    and c.created_at >= now() - interval '14 days'
  limit 1;
$$;

create or replace function private.can_upload_customer_portal_worker_check(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.customer_portal_worker_checks c
    where c.id::text = (storage.foldername(p_name))[1]
      and char_length(coalesce((storage.foldername(p_name))[2], '')) between 32 and 128
      and c.access_token_hash = encode(
        extensions.digest((storage.foldername(p_name))[2], 'sha256'),
        'hex'
      )
      and c.status = 'ready'
      and c.created_at >= now() - interval '14 days'
  );
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
  v_issues text[] := coalesce(p_issue_types, '{}');
  v_photos text[] := coalesce(p_photo_paths, '{}');
  v_voice text := coalesce(p_voice_path, '');
begin
  if char_length(coalesce(p_access_token, '')) not between 32 and 128 then
    raise exception 'invalid worker check token';
  end if;

  select c.id
    into v_id
  from public.customer_portal_worker_checks c
  where c.access_token_hash = encode(
      extensions.digest(p_access_token, 'sha256'),
      'hex'
    )
    and c.status = 'ready'
    and c.created_at >= now() - interval '14 days'
  limit 1;

  if v_id is null then
    raise exception 'invalid or expired worker check';
  end if;

  if cardinality(v_photos) < 1 or cardinality(v_photos) > 6 then
    raise exception 'invalid photo count';
  end if;
  if cardinality(v_issues) < 1 or cardinality(v_issues) > 6 then
    raise exception 'invalid issue count';
  end if;
  if 'ok' = any(v_issues) and cardinality(v_issues) > 1 then
    raise exception 'ok cannot be combined with issue types';
  end if;

  foreach v_issue in array v_issues loop
    if v_issue not in (
      'ok','damage_furniture','damage_electrical','damage_water',
      'damage_glass','damage_building','extra_dirt'
    ) then
      raise exception 'invalid issue type';
    end if;
  end loop;

  foreach v_path in array v_photos loop
    if v_path not like v_id::text || '/' || p_access_token || '/photo-%'
       or not exists (
         select 1
         from storage.objects o
         where o.bucket_id = 'customer-portal-worker-checks'
           and o.name = v_path
       ) then
      raise exception 'invalid photo path';
    end if;
  end loop;

  if v_voice <> '' then
    if v_voice not like v_id::text || '/' || p_access_token || '/voice-%'
       or not exists (
         select 1
         from storage.objects o
         where o.bucket_id = 'customer-portal-worker-checks'
           and o.name = v_voice
       ) then
      raise exception 'invalid voice path';
    end if;
  end if;

  update public.customer_portal_worker_checks
     set issue_types = v_issues,
         photo_paths = v_photos,
         voice_path = v_voice,
         status = 'submitted',
         submitted_at = now(),
         updated_at = now()
   where id = v_id
     and status = 'ready';

  if not found then
    raise exception 'worker check is no longer ready';
  end if;

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

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'customer-portal-worker-checks',
  'customer-portal-worker-checks',
  false,
  8388608,
  array[
    'image/jpeg','image/png','image/webp',
    'audio/webm','audio/mp4','audio/mpeg','audio/aac','audio/ogg'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "worker uploads worker check media" on storage.objects;
create policy "worker uploads worker check media"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'customer-portal-worker-checks'
  and private.can_upload_customer_portal_worker_check(name)
);

drop policy if exists "worker cleans pending worker check media" on storage.objects;
create policy "worker cleans pending worker check media"
on storage.objects
for delete
to anon, authenticated
using (
  bucket_id = 'customer-portal-worker-checks'
  and private.can_upload_customer_portal_worker_check(name)
);

drop policy if exists "admins read worker check media" on storage.objects;
create policy "admins read worker check media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'customer-portal-worker-checks'
  and public.is_resort_admin()
);

drop policy if exists "admins delete worker check media" on storage.objects;
create policy "admins delete worker check media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'customer-portal-worker-checks'
  and public.is_resort_admin()
);

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customer_portal_worker_checks'
  ) then
    alter publication supabase_realtime add table public.customer_portal_worker_checks;
  end if;
end;
$$;
