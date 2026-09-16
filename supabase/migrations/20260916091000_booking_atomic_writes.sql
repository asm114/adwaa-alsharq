-- Atomic, idempotent write functions for the relational booking store.

create or replace function public.save_booking_v2(
  p_booking jsonb,
  p_expected_version bigint default null,
  p_idempotency_key uuid default gen_random_uuid()
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare
  v_id text:=coalesce(nullif(trim(p_booking->>'id'),''),gen_random_uuid()::text);
  v_code text:=trim(coalesce(p_booking->>'code',''));
  v_name text:=trim(coalesce(p_booking->>'name',p_booking->>'customer_name',''));
  v_phone text:=nullif(trim(coalesce(p_booking->>'phone',p_booking->>'customer_phone','')),'');
  v_date date; v_end date; v_existing public.bookings%rowtype; v_saved public.bookings%rowtype; v_result jsonb;
begin
  if not public.is_adwaa_booking_manager() then raise exception 'Not authorized' using errcode='42501'; end if;
  select result into v_result from public.booking_mutations where idempotency_key=p_idempotency_key;
  if found then return v_result; end if;
  if v_code='' or v_name='' then raise exception 'Booking code and customer name are required' using errcode='22023'; end if;
  begin
    v_date:=(p_booking->>'date')::date;
    v_end:=coalesce(nullif(p_booking->>'endDate','')::date,v_date);
  exception when others then raise exception 'Valid booking date is required' using errcode='22023'; end;
  if v_end<v_date then raise exception 'Invalid booking date range' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('adwaa-booking-write',0));
  select * into v_existing from public.bookings where id=v_id for update;
  if not found then select * into v_existing from public.bookings where code=v_code for update; end if;

  if found then
    if p_expected_version is not null and v_existing.version<>p_expected_version then
      raise exception 'Booking changed on another device; refresh before saving' using errcode='40001';
    end if;
    update public.bookings set
      code=v_code,customer_name=v_name,customer_phone=v_phone,booking_date=v_date,end_date=v_end,
      booking_type=coalesce(nullif(p_booking->>'type',''),v_existing.booking_type),
      status=coalesce(nullif(p_booking->>'status',''),v_existing.status),
      total_amount=greatest(0,coalesce(nullif(p_booking->>'total','')::numeric,v_existing.total_amount)),
      discount_amount=greatest(0,coalesce(nullif(p_booking->>'discount','')::numeric,v_existing.discount_amount)),
      notes=nullif(p_booking->>'notes',''),source=nullif(p_booking->>'source',''),version=v_existing.version+1,legacy_payload=p_booking
    where id=v_existing.id returning * into v_saved;
  else
    insert into public.bookings(id,code,customer_name,customer_phone,booking_date,end_date,booking_type,status,total_amount,discount_amount,notes,source,legacy_payload,created_by,updated_by)
    values(v_id,v_code,v_name,v_phone,v_date,v_end,coalesce(nullif(p_booking->>'type',''),'يومي'),coalesce(nullif(p_booking->>'status',''),'مؤكد'),
      greatest(0,coalesce(nullif(p_booking->>'total','')::numeric,0)),greatest(0,coalesce(nullif(p_booking->>'discount','')::numeric,0)),
      nullif(p_booking->>'notes',''),nullif(p_booking->>'source',''),p_booking,auth.uid(),auth.uid()) returning * into v_saved;
  end if;

  v_result:=to_jsonb(v_saved);
  insert into public.booking_mutations(idempotency_key,booking_id,operation,result,created_by)
  values(p_idempotency_key,v_saved.id,case when v_existing.id is null then 'insert' else 'update' end,v_result,auth.uid());
  return v_result;
end $$;
revoke all on function public.save_booking_v2(jsonb,bigint,uuid) from public,anon;
grant execute on function public.save_booking_v2(jsonb,bigint,uuid) to authenticated;

create or replace function public.record_booking_payment_v2(
  p_booking_id text,p_payment_type text,p_amount numeric,p_method text default null,p_paid_at timestamptz default now(),p_note text default null,p_idempotency_key uuid default gen_random_uuid()
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v public.booking_payments%rowtype;
begin
  if not public.is_adwaa_booking_manager() then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_amount<=0 then raise exception 'Payment amount must be positive' using errcode='22023'; end if;
  select * into v from public.booking_payments where idempotency_key=p_idempotency_key; if found then return to_jsonb(v); end if;
  insert into public.booking_payments(booking_id,payment_type,amount,method,paid_at,note,idempotency_key,created_by)
  values(p_booking_id,coalesce(nullif(trim(p_payment_type),''),'payment'),p_amount,nullif(trim(p_method),''),coalesce(p_paid_at,now()),nullif(trim(p_note),''),p_idempotency_key,auth.uid()) returning * into v;
  return to_jsonb(v);
end $$;
revoke all on function public.record_booking_payment_v2(text,text,numeric,text,timestamptz,text,uuid) from public,anon;
grant execute on function public.record_booking_payment_v2(text,text,numeric,text,timestamptz,text,uuid) to authenticated;

create or replace function public.record_booking_refund_v2(
  p_booking_id text,p_payment_id uuid,p_amount numeric,p_method text default null,p_refunded_at timestamptz default now(),p_note text default null,p_idempotency_key uuid default gen_random_uuid()
) returns jsonb language plpgsql security invoker set search_path=''
as $$
declare payment_amount numeric; already_refunded numeric; v public.booking_refunds%rowtype;
begin
  if not public.is_adwaa_booking_manager() then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_amount<=0 then raise exception 'Refund amount must be positive' using errcode='22023'; end if;
  select * into v from public.booking_refunds where idempotency_key=p_idempotency_key; if found then return to_jsonb(v); end if;
  if p_payment_id is not null then
    select amount into payment_amount from public.booking_payments where id=p_payment_id and booking_id=p_booking_id for update;
    if not found then raise exception 'Payment does not belong to booking' using errcode='23503'; end if;
    select coalesce(sum(amount),0) into already_refunded from public.booking_refunds where payment_id=p_payment_id;
    if already_refunded+p_amount>payment_amount then raise exception 'Refund exceeds original payment' using errcode='23514'; end if;
  end if;
  insert into public.booking_refunds(booking_id,payment_id,amount,method,refunded_at,note,idempotency_key,created_by)
  values(p_booking_id,p_payment_id,p_amount,nullif(trim(p_method),''),coalesce(p_refunded_at,now()),nullif(trim(p_note),''),p_idempotency_key,auth.uid()) returning * into v;
  return to_jsonb(v);
end $$;
revoke all on function public.record_booking_refund_v2(text,uuid,numeric,text,timestamptz,text,uuid) from public,anon;
grant execute on function public.record_booking_refund_v2(text,uuid,numeric,text,timestamptz,text,uuid) to authenticated;
