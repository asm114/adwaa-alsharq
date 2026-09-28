-- Customer Portal final pre-production features. Apply to Staging only first.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create table if not exists public.customer_portal_visitor_counter (
  id text primary key default 'main' check (id = 'main'),
  total_count bigint not null default 0 check (total_count >= 0),
  launched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.customer_portal_visitor_counter (id, total_count)
values ('main', 0) on conflict (id) do nothing;

create table if not exists private.customer_portal_visitor_windows (
  visitor_hash text primary key,
  last_counted_at timestamptz not null default now()
);

alter table public.customer_portal_visitor_counter enable row level security;
revoke all on public.customer_portal_visitor_counter from public, anon, authenticated;
grant select on public.customer_portal_visitor_counter to authenticated;

create policy "admins read customer portal visitor counter"
on public.customer_portal_visitor_counter for select to authenticated
using (public.is_resort_admin());

create or replace function public.increment_customer_portal_visitor(p_visitor_key text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_last timestamptz;
  v_total bigint;
begin
  if p_visitor_key is null or char_length(p_visitor_key) < 20 or char_length(p_visitor_key) > 200 then
    raise exception 'invalid visitor key';
  end if;
  v_hash := encode(extensions.digest(p_visitor_key, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtext(v_hash));
  select last_counted_at into v_last
  from private.customer_portal_visitor_windows where visitor_hash = v_hash;
  if v_last is null or v_last <= now() - interval '24 hours' then
    insert into private.customer_portal_visitor_windows(visitor_hash, last_counted_at)
    values (v_hash, now())
    on conflict (visitor_hash) do update set last_counted_at = excluded.last_counted_at;
    update public.customer_portal_visitor_counter
    set total_count = total_count + 1, updated_at = now() where id = 'main'
    returning total_count into v_total;
  else
    select total_count into v_total from public.customer_portal_visitor_counter where id = 'main';
  end if;
  return v_total;
end;
$$;

revoke all on function public.increment_customer_portal_visitor(text) from public;
grant execute on function public.increment_customer_portal_visitor(text) to anon, authenticated;

create table if not exists public.customer_portal_feedback (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('complaint','cleanliness','maintenance','suggestion','thanks','other')),
  message text not null check (char_length(message) between 10 and 4000),
  customer_name text not null default '' check (char_length(customer_name) <= 120),
  contact_number text not null default '' check (char_length(contact_number) <= 80),
  image_paths text[] not null default '{}',
  status text not null default 'new' check (status in ('new','in_progress','completed','closed')),
  admin_note text not null default '' check (char_length(admin_note) <= 4000),
  submitted boolean not null default false,
  upload_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint customer_portal_feedback_images_limit check (cardinality(image_paths) <= 5)
);

create index if not exists customer_portal_feedback_status_created_idx
on public.customer_portal_feedback(status, created_at desc) where submitted;

create table if not exists private.customer_portal_feedback_rate_limits (
  visitor_hash text primary key,
  window_started_at timestamptz not null default now(),
  submission_count integer not null default 0
);

alter table public.customer_portal_feedback enable row level security;
revoke all on public.customer_portal_feedback from public, anon, authenticated;
grant select, update, delete on public.customer_portal_feedback to authenticated;

create policy "admins read customer portal feedback"
on public.customer_portal_feedback for select to authenticated
using (public.is_resort_admin() and submitted);
create policy "admins update customer portal feedback"
on public.customer_portal_feedback for update to authenticated
using (public.is_resort_admin() and submitted)
with check (public.is_resort_admin() and submitted);
create policy "admins delete customer portal feedback"
on public.customer_portal_feedback for delete to authenticated
using (public.is_resort_admin() and submitted);

create or replace function public.begin_customer_portal_feedback(
  p_visitor_key text, p_category text, p_message text,
  p_customer_name text default '', p_contact_number text default ''
)
returns table(feedback_id uuid, upload_token text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_hash text;
  v_rate private.customer_portal_feedback_rate_limits%rowtype;
  v_token text := gen_random_uuid()::text || gen_random_uuid()::text;
begin
  if p_visitor_key is null or char_length(p_visitor_key) < 20 or char_length(p_visitor_key) > 200 then raise exception 'invalid visitor key'; end if;
  if p_category not in ('complaint','cleanliness','maintenance','suggestion','thanks','other') then raise exception 'invalid category'; end if;
  if char_length(trim(coalesce(p_message,''))) not between 10 and 4000 then raise exception 'invalid message'; end if;
  if char_length(trim(coalesce(p_customer_name,''))) > 120 or char_length(trim(coalesce(p_contact_number,''))) > 80 then raise exception 'invalid optional fields'; end if;
  v_hash := encode(extensions.digest(p_visitor_key, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtext(v_hash));
  select * into v_rate from private.customer_portal_feedback_rate_limits where visitor_hash = v_hash;
  if v_rate.visitor_hash is null or v_rate.window_started_at <= now() - interval '1 hour' then
    insert into private.customer_portal_feedback_rate_limits(visitor_hash, window_started_at, submission_count)
    values(v_hash, now(), 1) on conflict(visitor_hash) do update set window_started_at=now(), submission_count=1;
  elsif v_rate.submission_count >= 3 then
    raise exception 'rate limit exceeded';
  else
    update private.customer_portal_feedback_rate_limits set submission_count=submission_count+1 where visitor_hash=v_hash;
  end if;
  insert into public.customer_portal_feedback(category,message,customer_name,contact_number,upload_token_hash)
  values(p_category,trim(p_message),trim(coalesce(p_customer_name,'')),trim(coalesce(p_contact_number,'')),encode(extensions.digest(v_token,'sha256'),'hex'))
  returning id into feedback_id;
  upload_token := v_token;
  return next;
end;
$$;

create or replace function private.can_upload_customer_portal_feedback(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(
    select 1 from public.customer_portal_feedback f
    where f.id::text = (storage.foldername(p_name))[1]
      and f.upload_token_hash = encode(extensions.digest((storage.foldername(p_name))[2], 'sha256'), 'hex')
      and not f.submitted and f.created_at > now() - interval '30 minutes'
  );
$$;

create or replace function public.finalize_customer_portal_feedback(p_feedback_id uuid, p_upload_token text, p_image_paths text[] default '{}')
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_path text;
begin
  if cardinality(coalesce(p_image_paths,'{}')) > 5 then raise exception 'too many images'; end if;
  if not exists(select 1 from public.customer_portal_feedback f where f.id=p_feedback_id and not f.submitted and f.upload_token_hash=encode(extensions.digest(p_upload_token,'sha256'),'hex') and f.created_at>now()-interval '30 minutes') then raise exception 'invalid feedback token'; end if;
  foreach v_path in array coalesce(p_image_paths,'{}') loop
    if v_path not like p_feedback_id::text || '/' || p_upload_token || '/%' or not exists(select 1 from storage.objects o where o.bucket_id='customer-portal-feedback' and o.name=v_path) then raise exception 'invalid image path'; end if;
  end loop;
  update public.customer_portal_feedback set image_paths=coalesce(p_image_paths,'{}'), submitted=true, updated_at=now() where id=p_feedback_id;
  return true;
end;
$$;

revoke all on function public.begin_customer_portal_feedback(text,text,text,text,text) from public;
revoke all on function public.finalize_customer_portal_feedback(uuid,text,text[]) from public;
grant execute on function public.begin_customer_portal_feedback(text,text,text,text,text) to anon, authenticated;
grant execute on function public.finalize_customer_portal_feedback(uuid,text,text[]) to anon, authenticated;
grant usage on schema private to anon, authenticated;
revoke all on function private.can_upload_customer_portal_feedback(text) from public;
grant execute on function private.can_upload_customer_portal_feedback(text) to anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('customer-portal-feedback','customer-portal-feedback',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "visitors upload customer portal feedback images"
on storage.objects for insert to anon, authenticated
with check(bucket_id='customer-portal-feedback' and private.can_upload_customer_portal_feedback(name));
create policy "admins read customer portal feedback images"
on storage.objects for select to authenticated
using(bucket_id='customer-portal-feedback' and public.is_resort_admin());
create policy "admins delete customer portal feedback images"
on storage.objects for delete to authenticated
using(bucket_id='customer-portal-feedback' and public.is_resort_admin());

create table if not exists public.customer_portal_activity_log (
  id bigint generated always as identity primary key,
  action_type text not null,
  entity_type text not null,
  entity_id text not null default '',
  description text not null default '',
  admin_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists customer_portal_activity_log_created_idx on public.customer_portal_activity_log(created_at desc);
alter table public.customer_portal_activity_log enable row level security;
revoke all on public.customer_portal_activity_log from public, anon, authenticated;
grant select, insert on public.customer_portal_activity_log to authenticated;
create policy "admins read customer portal activity log" on public.customer_portal_activity_log for select to authenticated using(public.is_resort_admin());
create policy "admins create customer portal activity log" on public.customer_portal_activity_log for insert to authenticated with check(public.is_resort_admin() and admin_id=auth.uid());

create or replace function public.log_customer_portal_admin_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_action text; v_id text;
begin
  if not public.is_resort_admin() then
    return case when tg_op='DELETE' then old else new end;
  end if;
  v_action := lower(tg_op);
  v_id := case when tg_op='DELETE' then coalesce(to_jsonb(old)->>'id','') else coalesce(to_jsonb(new)->>'id','') end;
  insert into public.customer_portal_activity_log(action_type,entity_type,entity_id,description,admin_id)
  values(v_action,tg_table_name,v_id,tg_op || ' on ' || tg_table_name,auth.uid());
  return case when tg_op='DELETE' then old else new end;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['customer_portal_resort_info','customer_portal_images','customer_portal_unavailable_periods','customer_portal_pricing','customer_portal_seasons','customer_portal_contact','customer_portal_feedback'] loop
    execute format('drop trigger if exists %I on public.%I','log_'||t,t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_customer_portal_admin_change()','log_'||t,t);
  end loop;
end $$;

grant usage, select on sequence public.customer_portal_activity_log_id_seq to authenticated;
