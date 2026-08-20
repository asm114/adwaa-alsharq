-- Commercial Customer Portal final features — fresh customer installations only.
-- Customer-neutral: no AAS identity, customer contact data, project refs, operational rows, or secrets.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

-- Visitor counter -------------------------------------------------------------

create table if not exists public.customer_portal_visitor_counter (
  id text primary key default 'main',
  total_count bigint not null default 0,
  launched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_portal_visitor_counter_singleton check (id = 'main'),
  constraint customer_portal_visitor_counter_nonnegative check (total_count >= 0)
);

comment on table public.customer_portal_visitor_counter is
  'Aggregate visit counter for one isolated customer portal. Raw visitor keys are never stored.';

insert into public.customer_portal_visitor_counter (id, total_count)
values ('main', 0)
on conflict (id) do nothing;

create table if not exists private.customer_portal_visitor_windows (
  visitor_hash text primary key,
  last_counted_at timestamptz not null default now()
);

revoke all on table private.customer_portal_visitor_windows from public, anon, authenticated;

alter table public.customer_portal_visitor_counter enable row level security;
revoke all on table public.customer_portal_visitor_counter from public, anon, authenticated;
grant select on table public.customer_portal_visitor_counter to authenticated;
grant select, insert, update, delete on table public.customer_portal_visitor_counter to service_role;

drop policy if exists "admins read customer portal visitor counter"
  on public.customer_portal_visitor_counter;
create policy "admins read customer portal visitor counter"
on public.customer_portal_visitor_counter
for select
to authenticated
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
  if p_visitor_key is null
     or char_length(p_visitor_key) < 20
     or char_length(p_visitor_key) > 200 then
    raise exception 'invalid visitor key';
  end if;

  v_hash := encode(extensions.digest(p_visitor_key, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtext(v_hash));

  select w.last_counted_at
    into v_last
  from private.customer_portal_visitor_windows w
  where w.visitor_hash = v_hash;

  if v_last is null or v_last <= now() - interval '24 hours' then
    insert into private.customer_portal_visitor_windows (visitor_hash, last_counted_at)
    values (v_hash, now())
    on conflict (visitor_hash)
    do update set last_counted_at = excluded.last_counted_at;

    update public.customer_portal_visitor_counter
       set total_count = total_count + 1,
           updated_at = now()
     where id = 'main'
    returning total_count into v_total;
  else
    select total_count
      into v_total
    from public.customer_portal_visitor_counter
    where id = 'main';
  end if;

  return coalesce(v_total, 0);
end;
$$;

revoke all on function public.increment_customer_portal_visitor(text) from public;
grant execute on function public.increment_customer_portal_visitor(text) to anon, authenticated;

-- Customer feedback -----------------------------------------------------------

create table if not exists public.customer_portal_feedback (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  message text not null,
  customer_name text not null default '',
  contact_number text not null default '',
  image_paths text[] not null default '{}',
  status text not null default 'new',
  admin_note text not null default '',
  submitted boolean not null default false,
  upload_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint customer_portal_feedback_category_check
    check (category in ('complaint','cleanliness','maintenance','suggestion','thanks','other')),
  constraint customer_portal_feedback_message_length
    check (char_length(message) between 10 and 4000),
  constraint customer_portal_feedback_customer_name_length
    check (char_length(customer_name) <= 120),
  constraint customer_portal_feedback_contact_number_length
    check (char_length(contact_number) <= 80),
  constraint customer_portal_feedback_status_check
    check (status in ('new','in_progress','completed','closed')),
  constraint customer_portal_feedback_admin_note_length
    check (char_length(admin_note) <= 4000),
  constraint customer_portal_feedback_images_limit
    check (cardinality(image_paths) <= 5)
);

comment on table public.customer_portal_feedback is
  'Private customer feedback for one isolated installation. Visitors submit through bounded RPCs; only portal admins can read submitted feedback.';
comment on column public.customer_portal_feedback.upload_token_hash is
  'One-way hash used only to authorize a short-lived anonymous upload/finalization flow.';

create index if not exists customer_portal_feedback_status_created_idx
  on public.customer_portal_feedback (status, created_at desc)
  where submitted;

create table if not exists private.customer_portal_feedback_rate_limits (
  visitor_hash text primary key,
  window_started_at timestamptz not null default now(),
  submission_count integer not null default 0,
  constraint customer_portal_feedback_rate_count_nonnegative
    check (submission_count >= 0)
);

revoke all on table private.customer_portal_feedback_rate_limits from public, anon, authenticated;

create or replace function public.set_customer_portal_feedback_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if public.is_resort_admin() then
    new.updated_by := (select auth.uid());
  else
    new.updated_by := old.updated_by;
  end if;
  return new;
end;
$$;

revoke all on function public.set_customer_portal_feedback_updated_at() from public, anon, authenticated;

drop trigger if exists customer_portal_feedback_set_updated_at
  on public.customer_portal_feedback;
create trigger customer_portal_feedback_set_updated_at
before update on public.customer_portal_feedback
for each row execute function public.set_customer_portal_feedback_updated_at();

alter table public.customer_portal_feedback enable row level security;
revoke all on table public.customer_portal_feedback from public, anon, authenticated;
grant select, update, delete on table public.customer_portal_feedback to authenticated;
grant select, insert, update, delete on table public.customer_portal_feedback to service_role;

drop policy if exists "admins read customer portal feedback"
  on public.customer_portal_feedback;
create policy "admins read customer portal feedback"
on public.customer_portal_feedback
for select
to authenticated
using (public.is_resort_admin() and submitted);

drop policy if exists "admins update customer portal feedback"
  on public.customer_portal_feedback;
create policy "admins update customer portal feedback"
on public.customer_portal_feedback
for update
to authenticated
using (public.is_resort_admin() and submitted)
with check (public.is_resort_admin() and submitted);

drop policy if exists "admins delete customer portal feedback"
  on public.customer_portal_feedback;
create policy "admins delete customer portal feedback"
on public.customer_portal_feedback
for delete
to authenticated
using (public.is_resort_admin() and submitted);

create or replace function public.begin_customer_portal_feedback(
  p_visitor_key text,
  p_category text,
  p_message text,
  p_customer_name text default '',
  p_contact_number text default ''
)
returns table(feedback_id uuid, upload_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_window_started_at timestamptz;
  v_submission_count integer;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if p_visitor_key is null
     or char_length(p_visitor_key) < 20
     or char_length(p_visitor_key) > 200 then
    raise exception 'invalid visitor key';
  end if;

  if p_category not in ('complaint','cleanliness','maintenance','suggestion','thanks','other') then
    raise exception 'invalid category';
  end if;

  if char_length(trim(coalesce(p_message, ''))) not between 10 and 4000 then
    raise exception 'invalid message';
  end if;

  if char_length(trim(coalesce(p_customer_name, ''))) > 120
     or char_length(trim(coalesce(p_contact_number, ''))) > 80 then
    raise exception 'invalid optional fields';
  end if;

  v_hash := encode(extensions.digest(p_visitor_key, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtext(v_hash));

  select r.window_started_at, r.submission_count
    into v_window_started_at, v_submission_count
  from private.customer_portal_feedback_rate_limits r
  where r.visitor_hash = v_hash;

  if v_window_started_at is null
     or v_window_started_at <= now() - interval '1 hour' then
    insert into private.customer_portal_feedback_rate_limits (
      visitor_hash, window_started_at, submission_count
    ) values (
      v_hash, now(), 1
    )
    on conflict (visitor_hash)
    do update set window_started_at = excluded.window_started_at,
                  submission_count = excluded.submission_count;
  elsif v_submission_count >= 3 then
    raise exception 'rate limit exceeded';
  else
    update private.customer_portal_feedback_rate_limits
       set submission_count = submission_count + 1
     where visitor_hash = v_hash;
  end if;

  insert into public.customer_portal_feedback (
    category,
    message,
    customer_name,
    contact_number,
    upload_token_hash
  ) values (
    p_category,
    trim(p_message),
    trim(coalesce(p_customer_name, '')),
    trim(coalesce(p_contact_number, '')),
    encode(extensions.digest(v_token, 'sha256'), 'hex')
  )
  returning id into feedback_id;

  upload_token := v_token;
  return next;
end;
$$;

create or replace function private.can_upload_customer_portal_feedback(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.customer_portal_feedback f
    where f.id::text = (storage.foldername(p_name))[1]
      and f.upload_token_hash = encode(
        extensions.digest((storage.foldername(p_name))[2], 'sha256'),
        'hex'
      )
      and not f.submitted
      and f.created_at > now() - interval '30 minutes'
  );
$$;

create or replace function public.finalize_customer_portal_feedback(
  p_feedback_id uuid,
  p_upload_token text,
  p_image_paths text[] default '{}'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  if p_upload_token is null
     or char_length(p_upload_token) < 32
     or char_length(p_upload_token) > 128 then
    raise exception 'invalid feedback token';
  end if;

  if cardinality(coalesce(p_image_paths, '{}')) > 5 then
    raise exception 'too many images';
  end if;

  if not exists (
    select 1
    from public.customer_portal_feedback f
    where f.id = p_feedback_id
      and not f.submitted
      and f.upload_token_hash = encode(extensions.digest(p_upload_token, 'sha256'), 'hex')
      and f.created_at > now() - interval '30 minutes'
  ) then
    raise exception 'invalid feedback token';
  end if;

  foreach v_path in array coalesce(p_image_paths, '{}') loop
    if v_path not like p_feedback_id::text || '/' || p_upload_token || '/%'
       or not exists (
         select 1
         from storage.objects o
         where o.bucket_id = 'customer-portal-feedback'
           and o.name = v_path
       ) then
      raise exception 'invalid image path';
    end if;
  end loop;

  update public.customer_portal_feedback
     set image_paths = coalesce(p_image_paths, '{}'),
         submitted = true,
         updated_at = now()
   where id = p_feedback_id;

  return true;
end;
$$;

revoke all on function public.begin_customer_portal_feedback(text,text,text,text,text) from public;
revoke all on function public.finalize_customer_portal_feedback(uuid,text,text[]) from public;
grant execute on function public.begin_customer_portal_feedback(text,text,text,text,text) to anon, authenticated;
grant execute on function public.finalize_customer_portal_feedback(uuid,text,text[]) to anon, authenticated;

revoke all on function private.can_upload_customer_portal_feedback(text) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.can_upload_customer_portal_feedback(text) to anon, authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'customer-portal-feedback',
  'customer-portal-feedback',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "visitors upload customer portal feedback images"
  on storage.objects;
create policy "visitors upload customer portal feedback images"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'customer-portal-feedback'
  and private.can_upload_customer_portal_feedback(name)
);

drop policy if exists "visitors clean failed customer portal feedback uploads"
  on storage.objects;
create policy "visitors clean failed customer portal feedback uploads"
on storage.objects
for delete
to anon, authenticated
using (
  bucket_id = 'customer-portal-feedback'
  and private.can_upload_customer_portal_feedback(name)
);

drop policy if exists "admins read customer portal feedback images"
  on storage.objects;
create policy "admins read customer portal feedback images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'customer-portal-feedback'
  and public.is_resort_admin()
);

drop policy if exists "admins delete customer portal feedback images"
  on storage.objects;
create policy "admins delete customer portal feedback images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'customer-portal-feedback'
  and public.is_resort_admin()
);

-- Admin activity log ----------------------------------------------------------

create table if not exists public.customer_portal_activity_log (
  id bigint generated always as identity primary key,
  action_type text not null,
  entity_type text not null,
  entity_id text not null default '',
  description text not null default '',
  admin_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.customer_portal_activity_log is
  'Admin-only audit trail for portal configuration and feedback management.';

create index if not exists customer_portal_activity_log_created_idx
  on public.customer_portal_activity_log (created_at desc);
create index if not exists customer_portal_activity_log_admin_idx
  on public.customer_portal_activity_log (admin_id);

alter table public.customer_portal_activity_log enable row level security;
revoke all on table public.customer_portal_activity_log from public, anon, authenticated;
grant select, insert on table public.customer_portal_activity_log to authenticated;
grant select, insert, update, delete on table public.customer_portal_activity_log to service_role;
grant usage, select on sequence public.customer_portal_activity_log_id_seq to authenticated;

drop policy if exists "admins read customer portal activity log"
  on public.customer_portal_activity_log;
create policy "admins read customer portal activity log"
on public.customer_portal_activity_log
for select
to authenticated
using (public.is_resort_admin());

drop policy if exists "admins create customer portal activity log"
  on public.customer_portal_activity_log;
create policy "admins create customer portal activity log"
on public.customer_portal_activity_log
for insert
to authenticated
with check (
  public.is_resort_admin()
  and admin_id = (select auth.uid())
);

create or replace function public.log_customer_portal_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_id text;
  v_description text;
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
begin
  if not public.is_resort_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_id := coalesce(
    case when tg_op = 'DELETE' then v_old->>'id' else v_new->>'id' end,
    ''
  );

  v_action := case tg_table_name
    when 'customer_portal_resort_info' then 'resort_info_' || lower(tg_op)
    when 'customer_portal_unavailable_periods' then 'unavailable_period_' || lower(tg_op)
    when 'customer_portal_pricing' then 'pricing_' || lower(tg_op)
    when 'customer_portal_seasons' then 'season_' || lower(tg_op)
    when 'customer_portal_contact' then 'contact_' || lower(tg_op)
    when 'customer_portal_feedback' then
      case
        when tg_op = 'UPDATE' and v_old->>'status' is distinct from v_new->>'status'
          then 'feedback_status_update'
        else 'feedback_' || lower(tg_op)
      end
    when 'customer_portal_images' then
      case
        when tg_op = 'INSERT' then 'image_upload'
        when tg_op = 'DELETE' then 'image_delete'
        when v_old->>'is_visible' is distinct from v_new->>'is_visible'
          then 'image_visibility_update'
        when v_old->>'is_cover' is distinct from v_new->>'is_cover'
          then 'image_cover_update'
        when v_old->>'display_order' is distinct from v_new->>'display_order'
          then 'image_order_update'
        else 'image_update'
      end
    else lower(tg_op)
  end;

  v_description := case v_action
    when 'image_upload' then 'رفع صورة إلى بوابة العملاء'
    when 'image_delete' then 'حذف صورة من بوابة العملاء'
    when 'image_visibility_update' then 'تغيير ظهور صورة في بوابة العملاء'
    when 'image_cover_update' then 'تغيير صورة الغلاف'
    when 'image_order_update' then 'تغيير ترتيب الصور'
    when 'feedback_status_update' then 'تغيير حالة ملاحظة عميل'
    else tg_op || ' on ' || tg_table_name
  end;

  insert into public.customer_portal_activity_log (
    action_type,
    entity_type,
    entity_id,
    description,
    admin_id
  ) values (
    v_action,
    tg_table_name,
    v_id,
    v_description,
    (select auth.uid())
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.log_customer_portal_admin_change() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'customer_portal_resort_info',
    'customer_portal_images',
    'customer_portal_unavailable_periods',
    'customer_portal_pricing',
    'customer_portal_seasons',
    'customer_portal_contact',
    'customer_portal_feedback'
  ] loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'log_' || t,
      t
    );
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.log_customer_portal_admin_change()',
      'log_' || t,
      t
    );
  end loop;
end $$;
