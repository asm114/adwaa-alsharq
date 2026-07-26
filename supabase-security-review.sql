-- SECURITY REVIEW BUNDLE — STAGING FIRST, NEVER RUN BLINDLY ON PRODUCTION.
--
-- Safe order:
-- 01 preflight (read-only)
-- 02 schema
-- 03 manual owner assignment (separate example file; never commit a UUID)
-- 04 owner guard + RLS/policies
-- 05 RPC
-- 06 grants
-- 07 verification
-- 08 rollback (separate review-only file)
--
-- Legacy cleaning tasks have no revision. They are treated as revision 0.
-- The first successful worker update stores revision 1.

begin;

-- 02-schema
alter table public.app_state
  add column if not exists owner_id uuid references auth.users(id);

-- 04-owner-guard
-- This intentionally aborts before changing RLS or policies unless a valid
-- staging owner was assigned manually.
do $guard$
declare
  v_owner uuid;
begin
  if to_regclass('public.app_state') is null then
    raise exception using errcode = '55000', message = 'preflight_failed_app_state_missing';
  end if;

  select owner_id into v_owner
  from public.app_state
  where id = 'main';

  if not found then
    raise exception using errcode = '55000', message = 'preflight_failed_main_missing';
  end if;
  if v_owner is null then
    raise exception using errcode = '55000', message = 'preflight_failed_owner_missing';
  end if;
  if not exists (select 1 from auth.users where id = v_owner) then
    raise exception using errcode = '55000', message = 'preflight_failed_owner_invalid';
  end if;
end
$guard$;

alter table public.app_state enable row level security;

drop policy if exists "Public app_state access" on public.app_state;
drop policy if exists "anon app_state access" on public.app_state;
drop policy if exists "Allow public read" on public.app_state;
drop policy if exists "Allow public write" on public.app_state;
drop policy if exists "Authenticated app_state access" on public.app_state;
drop policy if exists "Owner selects app_state" on public.app_state;
drop policy if exists "Owner inserts app_state" on public.app_state;
drop policy if exists "Owner updates app_state" on public.app_state;
drop policy if exists "Owner deletes app_state" on public.app_state;

create policy "Owner selects app_state"
on public.app_state for select to authenticated
using (id = 'main' and owner_id = auth.uid());

create policy "Owner inserts app_state"
on public.app_state for insert to authenticated
with check (id = 'main' and owner_id = auth.uid());

create policy "Owner updates app_state"
on public.app_state for update to authenticated
using (id = 'main' and owner_id = auth.uid())
with check (id = 'main' and owner_id = auth.uid());

create policy "Owner deletes app_state"
on public.app_state for delete to authenticated
using (id = 'main' and owner_id = auth.uid());

revoke all on table public.app_state from anon;
grant select, insert, update, delete on table public.app_state to authenticated;

-- 05-rpc helper: strict worker photo normalization.
create or replace function public.cleaner_sanitize_photos(
  p_items jsonb,
  p_strict boolean default false
) returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_item jsonb;
  v_output jsonb := '[]'::jsonb;
  v_url text;
  v_time text;
begin
  if p_items is null then return '[]'::jsonb; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 20 then
    if p_strict then raise exception using errcode='22023', message='invalid_request'; end if;
    return '[]'::jsonb;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or exists (
         select 1 from jsonb_object_keys(v_item) k
         where k not in ('id','place','phase','time','dataUrl','uploadedBy')
       )
       or coalesce(v_item->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(v_item->>'phase','') not in ('before','after')
       or length(coalesce(v_item->>'place','')) > 100 then
      if p_strict then raise exception using errcode='22023', message='invalid_request'; end if;
      continue;
    end if;

    v_url := coalesce(v_item->>'dataUrl','');
    v_time := coalesce(v_item->>'time','');
    if length(v_url) > 1000000
       or v_url !~* '^data:image/(png|jpeg|webp);base64,[a-z0-9+/=\r\n]+$'
       or length(v_time) > 64
       or v_time !~ '^\d{4}-\d{2}-\d{2}T' then
      if p_strict then raise exception using errcode='22023', message='invalid_request'; end if;
      continue;
    end if;

    v_output := v_output || jsonb_build_array(jsonb_build_object(
      'id', v_item->>'id',
      'place', left(v_item->>'place',100),
      'phase', v_item->>'phase',
      'time', v_time,
      'dataUrl', v_url
    ));
  end loop;
  return v_output;
end;
$$;

-- 05-rpc helper: strict operational issue normalization.
create or replace function public.cleaner_sanitize_issues(
  p_items jsonb,
  p_strict boolean default false
) returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_item jsonb;
  v_output jsonb := '[]'::jsonb;
  v_types jsonb;
  v_photo text;
  v_time text;
begin
  if p_items is null then return '[]'::jsonb; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 20 then
    if p_strict then raise exception using errcode='22023', message='invalid_request'; end if;
    return '[]'::jsonb;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or exists (
         select 1 from jsonb_object_keys(v_item) k
         where k not in ('id','types','place','phase','time','photoDataUrl')
       )
       or coalesce(v_item->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(v_item->>'phase','') not in ('before','after')
       or length(coalesce(v_item->>'place','')) > 100
       or jsonb_typeof(v_item->'types') <> 'array'
       or jsonb_array_length(v_item->'types') > 6
       or exists (
         select 1 from jsonb_array_elements(v_item->'types') x
         where jsonb_typeof(x) <> 'string' or length(trim(both '"' from x::text)) > 50
       ) then
      if p_strict then raise exception using errcode='22023', message='invalid_request'; end if;
      continue;
    end if;

    select coalesce(jsonb_agg(to_jsonb(left(value,50))), '[]'::jsonb)
    into v_types
    from jsonb_array_elements_text(v_item->'types') t(value);
    v_photo := coalesce(v_item->>'photoDataUrl','');
    v_time := coalesce(v_item->>'time','');

    if length(v_photo) > 1000000
       or (v_photo <> '' and v_photo !~* '^data:image/(png|jpeg|webp);base64,[a-z0-9+/=\r\n]+$')
       or length(v_time) > 64
       or v_time !~ '^\d{4}-\d{2}-\d{2}T' then
      if p_strict then raise exception using errcode='22023', message='invalid_request'; end if;
      continue;
    end if;

    v_output := v_output || jsonb_build_array(jsonb_build_object(
      'id', v_item->>'id',
      'types', v_types,
      'place', left(v_item->>'place',100),
      'phase', v_item->>'phase',
      'time', v_time,
      'photoDataUrl', v_photo
    ));
  end loop;
  return v_output;
end;
$$;

create or replace function public.cleaner_get_task(
  p_task_id uuid,
  p_token text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_task jsonb;
  v_created timestamptz;
  v_expires timestamptz;
  v_revision bigint;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return null; end if;

  select task into v_task
  from public.app_state s
  cross join lateral jsonb_array_elements(coalesce(s.data->'cleaningTasks','[]'::jsonb)) task
  where s.id='main'
    and task->>'id'=p_task_id::text
    and task->>'token'=p_token
  limit 1;

  if v_task is null or coalesce(v_task->>'status','') in ('ملغي','cancelled') then return null; end if;
  v_created := nullif(v_task->>'createdAt','')::timestamptz;
  v_expires := coalesce(nullif(v_task->>'accessExpiresAt','')::timestamptz,v_created+interval '30 days');
  if v_expires is not null and v_expires < now() then return null; end if;
  v_revision := case when coalesce(v_task->>'revision','') ~ '^\d{1,18}$'
    then (v_task->>'revision')::bigint else 0 end;

  return jsonb_build_object(
    'id',v_task->>'id',
    'revision',v_revision,
    'bookingCode',left(coalesce(v_task->>'bookingCode',''),80),
    'bookingDate',left(coalesce(v_task->>'bookingDate',''),32),
    'bookingType',left(coalesce(v_task->>'bookingType','يومي'),20),
    'notes',left(coalesce(v_task->>'notes',''),1000),
    'status',left(coalesce(v_task->>'status','pending'),40),
    'photos',public.cleaner_sanitize_photos(v_task->'photos',false),
    'issues',public.cleaner_sanitize_issues(v_task->'issues',false),
    'arrivedAt',v_task->>'arrivedAt',
    'handedOverAt',v_task->>'handedOverAt',
    'departedAt',v_task->>'departedAt',
    'startedAt',v_task->>'startedAt',
    'completedAt',v_task->>'completedAt'
  );
exception when others then
  return null;
end;
$$;

create or replace function public.cleaner_update_task(
  p_task_id uuid,
  p_token text,
  p_expected_revision bigint,
  p_patch jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_state jsonb;
  v_tasks jsonb;
  v_task jsonb;
  v_next jsonb;
  v_index integer;
  v_revision bigint;
  v_status text;
  v_previous_status text;
  v_photos jsonb;
  v_issues jsonb;
  v_booking_id text;
  v_bookings jsonb;
  v_booking jsonb;
  v_booking_index integer;
  v_booking_photos jsonb;
  v_notifications jsonb;
  v_message text;
  v_notification_type text;
  v_allowed_statuses constant text[] := array[
    'pending','arrived','handed_over','departed','in_progress','pending_approval'
  ];
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$'
     or p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode='22023',message='invalid_request';
  end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or pg_column_size(p_patch)>6000000 then
    raise exception using errcode='22023',message='invalid_request';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_patch) k
    where k not in ('status','photos','issues','arrivedAt','handedOverAt','departedAt','startedAt','completedAt')
  ) then
    raise exception using errcode='22023',message='invalid_request';
  end if;

  select data into v_state from public.app_state where id='main' for update;
  if v_state is null then raise exception using errcode='42501',message='access_denied'; end if;

  v_tasks := coalesce(v_state->'cleaningTasks','[]'::jsonb);
  select (ord-1)::integer,item into v_index,v_task
  from jsonb_array_elements(v_tasks) with ordinality a(item,ord)
  where item->>'id'=p_task_id::text and item->>'token'=p_token
  limit 1;

  if v_task is null
     or coalesce(v_task->>'status','') in ('approved','done','ملغي','cancelled')
     or coalesce(
       nullif(v_task->>'accessExpiresAt','')::timestamptz,
       nullif(v_task->>'createdAt','')::timestamptz+interval '30 days'
     ) < now() then
    raise exception using errcode='42501',message='access_denied';
  end if;

  v_revision := case when coalesce(v_task->>'revision','') ~ '^\d{1,18}$'
    then (v_task->>'revision')::bigint else 0 end;
  if v_revision <> p_expected_revision then
    raise exception using errcode='40001',message='conflict';
  end if;

  v_status := coalesce(p_patch->>'status',v_task->>'status','pending');
  v_previous_status := coalesce(v_task->>'status','pending');
  if not (v_status=any(v_allowed_statuses)) then
    raise exception using errcode='22023',message='invalid_request';
  end if;

  v_photos := public.cleaner_sanitize_photos(coalesce(p_patch->'photos',v_task->'photos','[]'::jsonb),true);
  v_issues := public.cleaner_sanitize_issues(coalesce(p_patch->'issues',v_task->'issues','[]'::jsonb),true);
  v_next := v_task || jsonb_strip_nulls(jsonb_build_object(
    'revision',v_revision+1,
    'status',v_status,
    'photos',v_photos,
    'issues',v_issues,
    'arrivedAt',p_patch->>'arrivedAt',
    'handedOverAt',p_patch->>'handedOverAt',
    'departedAt',p_patch->>'departedAt',
    'startedAt',p_patch->>'startedAt',
    'completedAt',p_patch->>'completedAt',
    'worker','جميل'
  ));
  v_tasks := jsonb_set(v_tasks,array[v_index::text],v_next,false);

  if v_status<>v_previous_status then
    v_notification_type := case v_status
      when 'arrived' then 'arrival' when 'handed_over' then 'handover'
      when 'departed' then 'departure' when 'in_progress' then 'cleaning_started'
      when 'pending_approval' then 'cleaning_complete' else 'cleaning_update' end;
    v_message := case v_status
      when 'arrived' then 'وصل العميل للحجز'
      when 'handed_over' then 'تم تسليم المنتجع للعميل'
      when 'departed' then 'غادر العميل وبدأت مرحلة التنظيف'
      when 'in_progress' then 'بدأ عامل النظافة تنفيذ المهمة'
      when 'pending_approval' then 'اكتمل التنظيف وأصبحت الصور بانتظار اعتماد المدير'
      else 'تم تحديث مهمة التنظيف' end;
    v_notifications := jsonb_build_array(jsonb_build_object(
      'id',gen_random_uuid()::text,'type',v_notification_type,
      'message',v_message||case when coalesce(v_task->>'bookingCode','')<>''
        then ' #'||left(v_task->>'bookingCode',80) else '' end,
      'taskId',p_task_id::text,'bookingId',coalesce(v_task->>'bookingId',''),
      'createdAt',now()::text,'read',false
    )) || coalesce(v_state->'notifications','[]'::jsonb);
    v_state := jsonb_set(v_state,'{notifications}',(
      select coalesce(jsonb_agg(value),'[]'::jsonb)
      from (select value from jsonb_array_elements(v_notifications) limit 100) n
    ),true);
  end if;

  -- bookingId is read only from the locked, server-stored task. It is not an
  -- accepted patch field. Only sanitized cleaning photos and cleaning status
  -- are copied to that one associated booking.
  if v_status='pending_approval' and v_previous_status<>'pending_approval' then
    v_booking_id := v_task->>'bookingId';
    v_bookings := coalesce(v_state->'bookings','[]'::jsonb);
    select (ord-1)::integer,item into v_booking_index,v_booking
    from jsonb_array_elements(v_bookings) with ordinality b(item,ord)
    where item->>'id'=v_booking_id
    limit 1;
    if v_booking is not null then
      select coalesce(jsonb_agg(photo),'[]'::jsonb) into v_booking_photos
      from (
        select value as photo
        from jsonb_array_elements(coalesce(v_booking->'photos','[]'::jsonb))
        where value->>'cleaningTaskId' is distinct from p_task_id::text
        union all
        select jsonb_build_object(
          'id',value->>'id','dataUrl',value->>'dataUrl',
          'type',case when value->>'phase'='after' then 'after' else 'before' end,
          'note',left(coalesce(value->>'place',''),100),
          'uploadedBy','جميل','uploadedAt',value->>'time',
          'originalName','','cleaningTaskId',p_task_id::text
        )
        from jsonb_array_elements(v_photos)
      ) q;
      v_booking := v_booking || jsonb_build_object(
        'photos',v_booking_photos,
        'cleaningStatus','بانتظار اعتماد المدير',
        'cleaningCompletedAt',now()::text
      );
      v_bookings := jsonb_set(v_bookings,array[v_booking_index::text],v_booking,false);
      v_state := jsonb_set(v_state,'{bookings}',v_bookings,false);
    end if;
  end if;

  update public.app_state
  set data=jsonb_set(v_state,'{cleaningTasks}',v_tasks,false),updated_at=now()
  where id='main';

  return public.cleaner_get_task(p_task_id,p_token);
end;
$$;

-- Remove the obsolete three-argument update RPC if it exists.
drop function if exists public.cleaner_update_task(uuid,text,jsonb);

-- 06-grants: helpers are never public RPC endpoints.
revoke all on function public.cleaner_sanitize_photos(jsonb,boolean) from public, anon, authenticated;
revoke all on function public.cleaner_sanitize_issues(jsonb,boolean) from public, anon, authenticated;
revoke all on function public.cleaner_get_task(uuid,text) from public;
revoke all on function public.cleaner_update_task(uuid,text,bigint,jsonb) from public;
grant execute on function public.cleaner_get_task(uuid,text) to anon,authenticated;
grant execute on function public.cleaner_update_task(uuid,text,bigint,jsonb) to anon,authenticated;

commit;
