-- Hardening for public feedback cleanup and descriptive portal activity logs.

create policy "visitors clean failed customer portal feedback uploads"
on storage.objects for delete to anon, authenticated
using (
  bucket_id = 'customer-portal-feedback'
  and private.can_upload_customer_portal_feedback(name)
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
begin
  if not public.is_resort_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_id := case when tg_op = 'DELETE'
    then coalesce(to_jsonb(old)->>'id', '')
    else coalesce(to_jsonb(new)->>'id', '')
  end;

  v_action := case tg_table_name
    when 'customer_portal_resort_info' then 'resort_info_' || lower(tg_op)
    when 'customer_portal_unavailable_periods' then 'unavailable_period_' || lower(tg_op)
    when 'customer_portal_pricing' then 'pricing_' || lower(tg_op)
    when 'customer_portal_seasons' then 'season_' || lower(tg_op)
    when 'customer_portal_contact' then 'contact_' || lower(tg_op)
    when 'customer_portal_feedback' then
      case when tg_op = 'UPDATE' and old.status is distinct from new.status
        then 'feedback_status_update' else 'feedback_' || lower(tg_op) end
    when 'customer_portal_images' then
      case
        when tg_op = 'INSERT' then 'image_upload'
        when tg_op = 'DELETE' then 'image_delete'
        when old.is_visible is distinct from new.is_visible then 'image_visibility_update'
        when old.is_cover is distinct from new.is_cover then 'image_cover_update'
        when old.display_order is distinct from new.display_order then 'image_order_update'
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
