-- Read trigger row fields through JSON so the shared trigger is safe for every portal table.

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

  v_id := coalesce(case when tg_op = 'DELETE' then v_old->>'id' else v_new->>'id' end, '');

  v_action := case tg_table_name
    when 'customer_portal_resort_info' then 'resort_info_' || lower(tg_op)
    when 'customer_portal_unavailable_periods' then 'unavailable_period_' || lower(tg_op)
    when 'customer_portal_pricing' then 'pricing_' || lower(tg_op)
    when 'customer_portal_seasons' then 'season_' || lower(tg_op)
    when 'customer_portal_contact' then 'contact_' || lower(tg_op)
    when 'customer_portal_feedback' then
      case when tg_op = 'UPDATE' and v_old->>'status' is distinct from v_new->>'status'
        then 'feedback_status_update' else 'feedback_' || lower(tg_op) end
    when 'customer_portal_images' then
      case
        when tg_op = 'INSERT' then 'image_upload'
        when tg_op = 'DELETE' then 'image_delete'
        when v_old->>'is_visible' is distinct from v_new->>'is_visible' then 'image_visibility_update'
        when v_old->>'is_cover' is distinct from v_new->>'is_cover' then 'image_cover_update'
        when v_old->>'display_order' is distinct from v_new->>'display_order' then 'image_order_update'
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

  insert into public.customer_portal_activity_log(
    action_type, entity_type, entity_id, description, admin_id
  ) values (v_action, tg_table_name, v_id, v_description, auth.uid());

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.log_customer_portal_admin_change() from public, anon, authenticated;
