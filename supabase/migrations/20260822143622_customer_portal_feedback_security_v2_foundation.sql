-- Staging-only additive security foundation for customer portal feedback.
--
-- Historical live-only migrations are an accepted baseline and are not
-- replayed here. In particular, this migration depends on the existing
-- public.customer_portal_admins table and public.is_resort_admin() function.
--
-- This migration intentionally does NOT revoke the legacy feedback RPCs,
-- remove legacy Storage policies, switch the customer portal to V2, enable a
-- scheduler, or delete Storage objects. Those actions require a separate
-- Cutover approval.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

do $$
begin
  if to_regclass('public.customer_portal_feedback') is null then
    raise exception 'required staging baseline table public.customer_portal_feedback is missing';
  end if;

  if to_regclass('public.customer_portal_admins') is null then
    raise exception 'required staging baseline table public.customer_portal_admins is missing';
  end if;

  if to_regprocedure('public.is_resort_admin()') is null then
    raise exception 'required staging baseline function public.is_resort_admin() is missing';
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'customer-portal-feedback'
  ) then
    raise exception 'required staging bucket customer-portal-feedback is missing';
  end if;
end
$$;

alter table public.customer_portal_feedback
  add column if not exists submission_path text not null default 'legacy';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.customer_portal_feedback'::regclass
      and conname = 'customer_portal_feedback_submission_path_check'
  ) then
    alter table public.customer_portal_feedback
      add constraint customer_portal_feedback_submission_path_check
      check (submission_path in ('legacy', 'signed_slots_v2'));
  end if;
end
$$;

comment on column public.customer_portal_feedback.submission_path is
  'Additive routing marker. Legacy remains the default until an explicitly approved Cutover.';

create table private.customer_portal_feedback_upload_slots (
  feedback_id uuid not null
    references public.customer_portal_feedback(id) on delete cascade,
  slot_no smallint not null check (slot_no between 1 and 5),
  object_path text not null unique,
  content_type text not null
    check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  primary key (feedback_id, slot_no),
  constraint customer_portal_feedback_upload_slot_path_check check (
    object_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  )
);

create index customer_portal_feedback_upload_slots_created_idx
  on private.customer_portal_feedback_upload_slots(created_at);

create table private.customer_portal_feedback_rate_limit_rules (
  rule_key text primary key,
  subject_dimension text not null
    check (subject_dimension in ('browser', 'ip', 'global')),
  window_seconds integer not null check (window_seconds between 60 and 86400),
  limit_count integer not null check (limit_count > 0),
  shadow_mode boolean not null default true,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into private.customer_portal_feedback_rate_limit_rules (
  rule_key,
  subject_dimension,
  window_seconds,
  limit_count,
  shadow_mode,
  enabled
)
values
  ('browser_hour', 'browser', 3600, 3, true, true),
  ('browser_day', 'browser', 86400, 10, true, true),
  ('ip_hour', 'ip', 3600, 20, true, true),
  ('ip_day', 'ip', 86400, 100, true, true),
  ('global_hour', 'global', 3600, 100, true, true)
on conflict (rule_key) do update
set
  subject_dimension = excluded.subject_dimension,
  window_seconds = excluded.window_seconds,
  limit_count = excluded.limit_count,
  shadow_mode = true,
  enabled = true,
  updated_at = now();

create table private.customer_portal_feedback_rate_limit_windows (
  rule_key text not null
    references private.customer_portal_feedback_rate_limit_rules(rule_key)
    on delete cascade,
  subject_hash text not null
    check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (rule_key, subject_hash, window_started_at)
);

create index customer_portal_feedback_rate_windows_cleanup_idx
  on private.customer_portal_feedback_rate_limit_windows(window_started_at);

create table private.customer_portal_feedback_security_events (
  id bigint generated always as identity primary key,
  request_id uuid not null unique,
  feedback_id uuid references public.customer_portal_feedback(id) on delete set null,
  browser_hash text not null check (browser_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  turnstile_verified boolean not null,
  would_block_rules text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index customer_portal_feedback_security_events_created_idx
  on private.customer_portal_feedback_security_events(created_at desc);

comment on column private.customer_portal_feedback_security_events.ip_hash is
  'Server-side HMAC of normalized client IP. Raw IP addresses must never be stored here.';

create table private.customer_portal_feedback_cleanup_config (
  singleton boolean primary key default true check (singleton),
  dry_run_started_at timestamptz not null default now(),
  dry_run_until timestamptz not null default now() + interval '24 hours',
  deletion_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint customer_portal_feedback_cleanup_dry_run_minimum check (
    dry_run_until >= dry_run_started_at + interval '24 hours'
  )
);

insert into private.customer_portal_feedback_cleanup_config (
  singleton,
  dry_run_started_at,
  dry_run_until,
  deletion_enabled
)
values (true, now(), now() + interval '24 hours', false)
on conflict (singleton) do nothing;

create table private.customer_portal_feedback_cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('dry_run', 'delete')),
  candidate_count integer not null check (candidate_count >= 0),
  deleted_count integer not null check (deleted_count >= 0),
  unclear_count integer not null check (unclear_count >= 0),
  error_count integer not null check (error_count >= 0),
  created_at timestamptz not null default now(),
  constraint customer_portal_feedback_cleanup_dry_run_deletes_nothing check (
    mode <> 'dry_run' or deleted_count = 0
  )
);

alter table private.customer_portal_feedback_upload_slots enable row level security;
alter table private.customer_portal_feedback_rate_limit_rules enable row level security;
alter table private.customer_portal_feedback_rate_limit_windows enable row level security;
alter table private.customer_portal_feedback_security_events enable row level security;
alter table private.customer_portal_feedback_cleanup_config enable row level security;
alter table private.customer_portal_feedback_cleanup_runs enable row level security;

revoke all on table private.customer_portal_feedback_upload_slots
  from public, anon, authenticated;
revoke all on table private.customer_portal_feedback_rate_limit_rules
  from public, anon, authenticated;
revoke all on table private.customer_portal_feedback_rate_limit_windows
  from public, anon, authenticated;
revoke all on table private.customer_portal_feedback_security_events
  from public, anon, authenticated;
revoke all on table private.customer_portal_feedback_cleanup_config
  from public, anon, authenticated;
revoke all on table private.customer_portal_feedback_cleanup_runs
  from public, anon, authenticated;
revoke all on sequence private.customer_portal_feedback_security_events_id_seq
  from public, anon, authenticated;

create or replace function private.consume_customer_portal_feedback_rate_limits_v2(
  p_browser_hash text,
  p_ip_hash text
)
returns table(allowed boolean, would_block_rules text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule private.customer_portal_feedback_rate_limit_rules%rowtype;
  v_subject_hash text;
  v_window_started_at timestamptz;
  v_count integer;
begin
  if p_browser_hash is null or p_browser_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid browser correlation hash';
  end if;

  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid ip hmac';
  end if;

  allowed := true;
  would_block_rules := '{}'::text[];

  for v_rule in
    select *
    from private.customer_portal_feedback_rate_limit_rules
    where enabled
    order by rule_key
  loop
    v_subject_hash := case v_rule.subject_dimension
      when 'browser' then p_browser_hash
      when 'ip' then p_ip_hash
      else repeat('0', 64)
    end;

    v_window_started_at := to_timestamp(
      floor(extract(epoch from statement_timestamp()) / v_rule.window_seconds)
      * v_rule.window_seconds
    );

    insert into private.customer_portal_feedback_rate_limit_windows (
      rule_key,
      subject_hash,
      window_started_at,
      request_count,
      updated_at
    ) values (
      v_rule.rule_key,
      v_subject_hash,
      v_window_started_at,
      1,
      now()
    )
    on conflict (rule_key, subject_hash, window_started_at) do update
    set
      request_count = private.customer_portal_feedback_rate_limit_windows.request_count + 1,
      updated_at = now()
    returning request_count into v_count;

    if v_count > v_rule.limit_count then
      would_block_rules := array_append(would_block_rules, v_rule.rule_key);
      if not v_rule.shadow_mode then
        allowed := false;
      end if;
    end if;
  end loop;

  return next;
end;
$$;

create or replace function public.begin_customer_portal_feedback_v2(
  p_request_id uuid,
  p_browser_hash text,
  p_ip_hash text,
  p_turnstile_verified boolean,
  p_category text,
  p_message text,
  p_customer_name text default '',
  p_contact_number text default '',
  p_content_types text[] default '{}'
)
returns table(
  feedback_id uuid,
  upload_token text,
  object_paths text[],
  allowed boolean,
  would_block_rules text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rate record;
  v_token text := gen_random_uuid()::text || gen_random_uuid()::text;
  v_content_type text;
  v_extension text;
  v_slot_no integer := 0;
  v_object_path text;
begin
  if p_request_id is null then
    raise exception 'request id is required';
  end if;

  if p_turnstile_verified is distinct from true then
    raise exception 'turnstile verification is required';
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

  if cardinality(coalesce(p_content_types, '{}'::text[])) > 5 then
    raise exception 'too many upload slots';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_content_types, '{}'::text[])) as requested(content_type)
    where content_type not in ('image/jpeg', 'image/png', 'image/webp')
  ) then
    raise exception 'unsupported upload content type';
  end if;

  select * into v_rate
  from private.consume_customer_portal_feedback_rate_limits_v2(
    p_browser_hash,
    p_ip_hash
  );

  allowed := v_rate.allowed;
  would_block_rules := v_rate.would_block_rules;
  object_paths := '{}'::text[];

  if not allowed then
    insert into private.customer_portal_feedback_security_events (
      request_id,
      browser_hash,
      ip_hash,
      turnstile_verified,
      would_block_rules
    ) values (
      p_request_id,
      p_browser_hash,
      p_ip_hash,
      true,
      would_block_rules
    );
    return next;
    return;
  end if;

  insert into public.customer_portal_feedback (
    category,
    message,
    customer_name,
    contact_number,
    upload_token_hash,
    submission_path
  ) values (
    p_category,
    trim(p_message),
    trim(coalesce(p_customer_name, '')),
    trim(coalesce(p_contact_number, '')),
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    'signed_slots_v2'
  )
  returning id into feedback_id;

  foreach v_content_type in array coalesce(p_content_types, '{}'::text[])
  loop
    v_slot_no := v_slot_no + 1;
    v_extension := case v_content_type
      when 'image/jpeg' then 'jpg'
      when 'image/png' then 'png'
      else 'webp'
    end;
    v_object_path := feedback_id::text || '/' || gen_random_uuid()::text || '.' || v_extension;

    insert into private.customer_portal_feedback_upload_slots (
      feedback_id,
      slot_no,
      object_path,
      content_type
    ) values (
      feedback_id,
      v_slot_no,
      v_object_path,
      v_content_type
    );

    object_paths := array_append(object_paths, v_object_path);
  end loop;

  upload_token := v_token;

  insert into private.customer_portal_feedback_security_events (
    request_id,
    feedback_id,
    browser_hash,
    ip_hash,
    turnstile_verified,
    would_block_rules
  ) values (
    p_request_id,
    feedback_id,
    p_browser_hash,
    p_ip_hash,
    true,
    would_block_rules
  );

  return next;
end;
$$;

create or replace function public.finalize_customer_portal_feedback_v2(
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
  v_feedback public.customer_portal_feedback%rowtype;
  v_path text;
begin
  if cardinality(coalesce(p_image_paths, '{}'::text[])) > 5 then
    raise exception 'too many images';
  end if;

  if cardinality(coalesce(p_image_paths, '{}'::text[])) <> (
    select count(distinct path_value)
    from unnest(coalesce(p_image_paths, '{}'::text[])) as supplied(path_value)
  ) then
    raise exception 'duplicate image path';
  end if;

  select * into v_feedback
  from public.customer_portal_feedback
  where id = p_feedback_id
  for update;

  if v_feedback.id is null
     or v_feedback.submission_path <> 'signed_slots_v2'
     or v_feedback.submitted
     or v_feedback.upload_token_hash <> encode(extensions.digest(p_upload_token, 'sha256'), 'hex')
     or v_feedback.created_at <= now() - interval '2 hours' then
    raise exception 'invalid feedback ticket';
  end if;

  foreach v_path in array coalesce(p_image_paths, '{}'::text[])
  loop
    if not exists (
      select 1
      from private.customer_portal_feedback_upload_slots slot
      join storage.objects object
        on object.bucket_id = 'customer-portal-feedback'
       and object.name = slot.object_path
      where slot.feedback_id = p_feedback_id
        and slot.object_path = v_path
        and lower(coalesce(object.metadata->>'mimetype', '')) = slot.content_type
    ) then
      raise exception 'invalid or missing uploaded object';
    end if;
  end loop;

  update private.customer_portal_feedback_upload_slots
  set uploaded_at = now()
  where feedback_id = p_feedback_id
    and object_path = any(coalesce(p_image_paths, '{}'::text[]));

  update public.customer_portal_feedback
  set
    image_paths = coalesce(p_image_paths, '{}'::text[]),
    submitted = true,
    updated_at = now()
  where id = p_feedback_id;

  return true;
end;
$$;

create or replace function public.list_customer_portal_feedback_orphans_v2(
  p_limit integer default 500
)
returns table(
  object_path text,
  reason text,
  object_age interval
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    object.name,
    case
      when slot.object_path is null then 'unreserved_older_than_24h'
      when feedback.submitted then 'submitted_unreferenced_older_than_24h'
      else 'pending_ticket_expired_older_than_2h'
    end,
    now() - coalesce(object.created_at, object.updated_at)
  from storage.objects object
  left join private.customer_portal_feedback_upload_slots slot
    on slot.object_path = object.name
  left join public.customer_portal_feedback feedback
    on feedback.id = slot.feedback_id
  where object.bucket_id = 'customer-portal-feedback'
    and coalesce(object.created_at, object.updated_at) <= now() - interval '2 hours'
    and not (
      feedback.submitted
      and object.name = any(coalesce(feedback.image_paths, '{}'::text[]))
    )
    and (
      (slot.object_path is null
        and coalesce(object.created_at, object.updated_at) <= now() - interval '24 hours')
      or (feedback.submitted
        and object.name <> all(coalesce(feedback.image_paths, '{}'::text[]))
        and coalesce(object.created_at, object.updated_at) <= now() - interval '24 hours')
      or (feedback.id is not null and not feedback.submitted)
    )
  order by coalesce(object.created_at, object.updated_at)
  limit greatest(1, least(coalesce(p_limit, 500), 500));
$$;

create or replace function public.get_customer_portal_feedback_cleanup_mode_v2()
returns table(
  dry_run_started_at timestamptz,
  dry_run_until timestamptz,
  deletion_enabled boolean,
  dry_run boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    config.dry_run_started_at,
    config.dry_run_until,
    config.deletion_enabled,
    (not config.deletion_enabled or now() < config.dry_run_until)
  from private.customer_portal_feedback_cleanup_config config
  where config.singleton;
$$;

create or replace function public.record_customer_portal_feedback_cleanup_run_v2(
  p_mode text,
  p_candidate_count integer,
  p_deleted_count integer,
  p_unclear_count integer,
  p_error_count integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  if p_mode not in ('dry_run', 'delete')
     or least(
       p_candidate_count,
       p_deleted_count,
       p_unclear_count,
       p_error_count
     ) < 0 then
    raise exception 'invalid cleanup run';
  end if;

  if p_mode = 'dry_run' and p_deleted_count <> 0 then
    raise exception 'dry run cannot record deletions';
  end if;

  insert into private.customer_portal_feedback_cleanup_runs (
    mode,
    candidate_count,
    deleted_count,
    unclear_count,
    error_count
  ) values (
    p_mode,
    p_candidate_count,
    p_deleted_count,
    p_unclear_count,
    p_error_count
  )
  returning id into v_run_id;

  return v_run_id;
end;
$$;

revoke all on function private.consume_customer_portal_feedback_rate_limits_v2(text, text)
  from public, anon, authenticated;
revoke all on function public.begin_customer_portal_feedback_v2(uuid, text, text, boolean, text, text, text, text, text[])
  from public, anon, authenticated;
revoke all on function public.finalize_customer_portal_feedback_v2(uuid, text, text[])
  from public, anon, authenticated;
revoke all on function public.list_customer_portal_feedback_orphans_v2(integer)
  from public, anon, authenticated;
revoke all on function public.get_customer_portal_feedback_cleanup_mode_v2()
  from public, anon, authenticated;
revoke all on function public.record_customer_portal_feedback_cleanup_run_v2(text, integer, integer, integer, integer)
  from public, anon, authenticated;

grant execute on function public.begin_customer_portal_feedback_v2(uuid, text, text, boolean, text, text, text, text, text[])
  to service_role;
grant execute on function public.finalize_customer_portal_feedback_v2(uuid, text, text[])
  to service_role;
grant execute on function public.list_customer_portal_feedback_orphans_v2(integer)
  to service_role;
grant execute on function public.get_customer_portal_feedback_cleanup_mode_v2()
  to service_role;
grant execute on function public.record_customer_portal_feedback_cleanup_run_v2(text, integer, integer, integer, integer)
  to service_role;

comment on function public.begin_customer_portal_feedback_v2(uuid, text, text, boolean, text, text, text, text, text[]) is
  'Service-only additive V2 ticket creator. Turnstile must be verified by the Edge Function before invocation.';
comment on function public.list_customer_portal_feedback_orphans_v2(integer) is
  'Read-only candidate list. Actual deletion, when separately approved, must use the Storage API.';
