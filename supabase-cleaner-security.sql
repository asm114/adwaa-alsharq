-- مراجعة فقط: لا تشغّل هذا الملف على قاعدة الإنتاج قبل أخذ نسخة احتياطية
-- واختباره في مشروع Supabase تجريبي.
--
-- الهدف:
-- 1) منع anon من قراءة/كتابة app_state مباشرة.
-- 2) إبقاء بوابة عامل التنظيف تعمل من خلال دالتين محدودتين فقط.
-- 3) التحقق من task id وtoken داخل PostgreSQL وإرجاع بيانات المهمة الضرورية فقط.

begin;

alter table public.app_state enable row level security;

-- اربط صف الحالة بمالك مصادق عليه. يجب تعيين owner_id يدويًا قبل تفعيل
-- السياسات في الإنتاج، وبعد التأكد من UUID الخاص بحساب المدير.
alter table public.app_state
  add column if not exists owner_id uuid references auth.users(id);

-- مثال للمراجعة فقط (استبدل القيمة ولا تشغله كما هو):
-- update public.app_state
-- set owner_id = 'MANAGER_AUTH_USER_UUID'
-- where id = 'main' and owner_id is null;

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
using (owner_id = auth.uid());

create policy "Owner inserts app_state"
on public.app_state for insert to authenticated
with check (owner_id = auth.uid());

create policy "Owner updates app_state"
on public.app_state for update to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Owner deletes app_state"
on public.app_state for delete to authenticated
using (owner_id = auth.uid());

revoke all on table public.app_state from anon;
grant select, insert, update, delete on table public.app_state to authenticated;

create or replace function public.cleaner_get_task(
  p_task_id uuid,
  p_token text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task jsonb;
  v_created timestamptz;
  v_expires timestamptz;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    return null;
  end if;

  select task into v_task
  from public.app_state s
  cross join lateral jsonb_array_elements(coalesce(s.data->'cleaningTasks', '[]'::jsonb)) task
  where s.id = 'main'
    and task->>'id' = p_task_id::text
    and task->>'token' = p_token
  limit 1;

  if v_task is null then return null; end if;
  if coalesce(v_task->>'status', '') in ('ملغي', 'cancelled') then return null; end if;

  v_created := nullif(v_task->>'createdAt', '')::timestamptz;
  v_expires := coalesce(
    nullif(v_task->>'accessExpiresAt', '')::timestamptz,
    v_created + interval '30 days'
  );
  if v_expires is not null and v_expires < now() then return null; end if;

  return jsonb_build_object(
    'id', v_task->>'id',
    'bookingCode', left(coalesce(v_task->>'bookingCode', ''), 80),
    'bookingDate', left(coalesce(v_task->>'bookingDate', ''), 32),
    'bookingType', left(coalesce(v_task->>'bookingType', 'يومي'), 20),
    'notes', left(coalesce(v_task->>'notes', ''), 1000),
    'status', left(coalesce(v_task->>'status', 'pending'), 40),
    'photos', coalesce(v_task->'photos', '[]'::jsonb),
    'issues', coalesce(v_task->'issues', '[]'::jsonb),
    'arrivedAt', v_task->>'arrivedAt',
    'handedOverAt', v_task->>'handedOverAt',
    'departedAt', v_task->>'departedAt',
    'startedAt', v_task->>'startedAt',
    'completedAt', v_task->>'completedAt'
  );
exception when others then
  return null;
end;
$$;

create or replace function public.cleaner_update_task(
  p_task_id uuid,
  p_token text,
  p_patch jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state jsonb;
  v_tasks jsonb;
  v_task jsonb;
  v_next jsonb;
  v_index integer;
  v_status text;
  v_previous_status text;
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
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then
    raise exception using errcode = '22023', message = 'invalid_request';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object'
     or pg_column_size(p_patch) > 6000000 then
    raise exception using errcode = '22023', message = 'invalid_request';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_patch) k
    where k not in (
      'status','photos','issues','arrivedAt','handedOverAt','departedAt',
      'startedAt','completedAt'
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid_request';
  end if;

  select data into v_state
  from public.app_state
  where id = 'main'
  for update;

  v_tasks := coalesce(v_state->'cleaningTasks', '[]'::jsonb);
  select (ord - 1)::integer, item into v_index, v_task
  from jsonb_array_elements(v_tasks) with ordinality a(item, ord)
  where item->>'id' = p_task_id::text
    and item->>'token' = p_token
  limit 1;

  if v_task is null
     or coalesce(v_task->>'status','') in ('approved','done','ملغي','cancelled')
     or coalesce(
       nullif(v_task->>'accessExpiresAt','')::timestamptz,
       nullif(v_task->>'createdAt','')::timestamptz + interval '30 days'
     ) < now() then
    raise exception using errcode = '42501', message = 'access_denied';
  end if;

  v_status := coalesce(p_patch->>'status', v_task->>'status', 'pending');
  v_previous_status := coalesce(v_task->>'status', 'pending');
  if not (v_status = any(v_allowed_statuses)) then
    raise exception using errcode = '22023', message = 'invalid_request';
  end if;
  if jsonb_array_length(coalesce(p_patch->'photos', v_task->'photos', '[]'::jsonb)) > 20
     or jsonb_array_length(coalesce(p_patch->'issues', v_task->'issues', '[]'::jsonb)) > 20 then
    raise exception using errcode = '22023', message = 'invalid_request';
  end if;

  v_next := v_task || jsonb_strip_nulls(jsonb_build_object(
    'status', v_status,
    'photos', coalesce(p_patch->'photos', v_task->'photos', '[]'::jsonb),
    'issues', coalesce(p_patch->'issues', v_task->'issues', '[]'::jsonb),
    'arrivedAt', p_patch->>'arrivedAt',
    'handedOverAt', p_patch->>'handedOverAt',
    'departedAt', p_patch->>'departedAt',
    'startedAt', p_patch->>'startedAt',
    'completedAt', p_patch->>'completedAt',
    'worker', 'جميل'
  ));

  v_tasks := jsonb_set(v_tasks, array[v_index::text], v_next, false);

  if v_status <> v_previous_status then
    v_notification_type := case v_status
      when 'arrived' then 'arrival'
      when 'handed_over' then 'handover'
      when 'departed' then 'departure'
      when 'in_progress' then 'cleaning_started'
      when 'pending_approval' then 'cleaning_complete'
      else 'cleaning_update'
    end;
    v_message := case v_status
      when 'arrived' then 'وصل العميل للحجز'
      when 'handed_over' then 'تم تسليم المنتجع للعميل'
      when 'departed' then 'غادر العميل وبدأت مرحلة التنظيف'
      when 'in_progress' then 'بدأ عامل النظافة تنفيذ المهمة'
      when 'pending_approval' then 'اكتمل التنظيف وأصبحت الصور بانتظار اعتماد المدير'
      else 'تم تحديث مهمة التنظيف'
    end;
    v_notifications := coalesce(v_state->'notifications', '[]'::jsonb);
    v_notifications := jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text,
      'type', v_notification_type,
      'message', v_message || case when coalesce(v_task->>'bookingCode','') <> ''
        then ' #' || left(v_task->>'bookingCode',80) else '' end,
      'taskId', p_task_id::text,
      'bookingId', coalesce(v_task->>'bookingId',''),
      'createdAt', now()::text,
      'read', false
    )) || v_notifications;
    v_state := jsonb_set(v_state, '{notifications}', (
      select coalesce(jsonb_agg(value), '[]'::jsonb)
      from (select value from jsonb_array_elements(v_notifications) limit 100) n
    ), true);
  end if;

  -- عند اكتمال المهمة ننسخ صورها إلى الحجز المرتبط فقط، دون كشف الحجز للعامل.
  if v_status = 'pending_approval' and v_previous_status <> 'pending_approval' then
    v_booking_id := v_task->>'bookingId';
    v_bookings := coalesce(v_state->'bookings', '[]'::jsonb);
    select (ord - 1)::integer, item into v_booking_index, v_booking
    from jsonb_array_elements(v_bookings) with ordinality b(item, ord)
    where item->>'id' = v_booking_id
    limit 1;
    if v_booking is not null then
      select coalesce(jsonb_agg(photo), '[]'::jsonb) into v_booking_photos
      from (
        select value as photo
        from jsonb_array_elements(coalesce(v_booking->'photos','[]'::jsonb))
        where value->>'cleaningTaskId' is distinct from p_task_id::text
        union all
        select value || jsonb_build_object(
          'type', case when value->>'phase' = 'after' then 'after' else 'before' end,
          'note', left(coalesce(value->>'place',''),200),
          'uploadedBy', 'جميل',
          'uploadedAt', value->>'time',
          'originalName', '',
          'cleaningTaskId', p_task_id::text
        )
        from jsonb_array_elements(coalesce(v_next->'photos','[]'::jsonb))
      ) q;
      v_booking := v_booking
        || jsonb_build_object(
          'photos', v_booking_photos,
          'cleaningStatus', 'بانتظار اعتماد المدير',
          'cleaningCompletedAt', now()::text
        );
      v_bookings := jsonb_set(v_bookings, array[v_booking_index::text], v_booking, false);
      v_state := jsonb_set(v_state, '{bookings}', v_bookings, false);
    end if;
  end if;

  update public.app_state
  set data = jsonb_set(v_state, '{cleaningTasks}', v_tasks, false),
      updated_at = now()
  where id = 'main';

  return public.cleaner_get_task(p_task_id, p_token);
end;
$$;

revoke all on function public.cleaner_get_task(uuid,text) from public;
revoke all on function public.cleaner_update_task(uuid,text,jsonb) from public;
grant execute on function public.cleaner_get_task(uuid,text) to anon, authenticated;
grant execute on function public.cleaner_update_task(uuid,text,jsonb) to anon, authenticated;

commit;
