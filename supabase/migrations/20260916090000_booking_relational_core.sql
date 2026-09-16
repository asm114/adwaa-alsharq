-- Relational booking core for Adwaa AlSharq.
-- Additive and reversible: this migration does not read, rewrite, or delete app_state.
-- Legacy data migration and cutover are intentionally separate migrations.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) > 0),
  phone text,
  normalized_phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_normalized_phone_idx
  on public.customers (normalized_phone)
  where normalized_phone is not null and normalized_phone <> '';

create table if not exists public.bookings (
  id text primary key default gen_random_uuid()::text,
  code text not null unique check (length(trim(code)) > 0),
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null check (length(trim(customer_name)) > 0),
  customer_phone text,
  booking_date date not null,
  end_date date not null,
  booking_type text not null default 'يومي',
  status text not null default 'مؤكد',
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  notes text,
  source text,
  version bigint not null default 1 check (version >= 1),
  legacy_payload jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_valid_date_range check (end_date >= booking_date)
);

create index if not exists bookings_date_status_idx on public.bookings (booking_date, status);
create index if not exists bookings_customer_phone_idx on public.bookings (customer_phone);
create index if not exists bookings_updated_at_idx on public.bookings (updated_at desc);

create table if not exists public.booking_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings(id) on delete restrict,
  payment_type text not null default 'payment',
  amount numeric(12,2) not null check (amount > 0),
  method text,
  paid_at timestamptz not null default now(),
  note text,
  idempotency_key uuid not null default gen_random_uuid() unique,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists booking_payments_booking_idx on public.booking_payments (booking_id, paid_at);

create table if not exists public.booking_refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings(id) on delete restrict,
  payment_id uuid references public.booking_payments(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  method text,
  refunded_at timestamptz not null default now(),
  note text,
  idempotency_key uuid not null default gen_random_uuid() unique,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists booking_refunds_booking_idx on public.booking_refunds (booking_id, refunded_at);
create index if not exists booking_refunds_payment_idx on public.booking_refunds (payment_id) where payment_id is not null;

create table if not exists public.booking_status_history (
  id bigint generated always as identity primary key,
  booking_id text not null references public.bookings(id) on delete restrict,
  old_status text,
  new_status text not null,
  note text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists booking_status_history_booking_idx on public.booking_status_history (booking_id, changed_at desc);

create table if not exists public.booking_audit_log (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists booking_audit_log_entity_idx on public.booking_audit_log (entity_type, entity_id, changed_at desc);

create table if not exists public.booking_mutations (
  idempotency_key uuid primary key,
  booking_id text references public.bookings(id) on delete restrict,
  operation text not null,
  result jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.booking_sync_health (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  source text not null default 'client',
  status text not null check (status in ('ok','warning','error')),
  booking_count integer,
  pending_mutations integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  checked_by uuid
);

create index if not exists booking_sync_health_checked_idx on public.booking_sync_health (checked_at desc);

create table if not exists public.booking_migration_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_row_id text not null,
  source_updated_at timestamptz,
  source_booking_count integer not null,
  app_state_data jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid
);

create or replace function public.is_adwaa_booking_manager()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower('asm114@hotmail.com');
$$;

revoke all on function public.is_adwaa_booking_manager() from public, anon;
grant execute on function public.is_adwaa_booking_manager() to authenticated;

create or replace function public.booking_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  if tg_table_name = 'bookings' then
    new.updated_by = auth.uid();
  end if;
  return new;
end;
$$;

create or replace function public.booking_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entity_id_value text;
begin
  entity_id_value := coalesce(new.id::text, old.id::text);
  insert into public.booking_audit_log(entity_type, entity_id, action, before_data, after_data, changed_by)
  values (
    tg_table_name,
    entity_id_value,
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.booking_audit_trigger() from public, anon, authenticated;

create or replace function public.booking_status_history_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.booking_status_history(booking_id, old_status, new_status, changed_by)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.booking_status_history(booking_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function public.booking_status_history_trigger() from public, anon, authenticated;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers
for each row execute function public.booking_set_updated_at();

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at before update on public.bookings
for each row execute function public.booking_set_updated_at();

drop trigger if exists bookings_status_history on public.bookings;
create trigger bookings_status_history after insert or update of status on public.bookings
for each row execute function public.booking_status_history_trigger();

drop trigger if exists bookings_audit on public.bookings;
create trigger bookings_audit after insert or update or delete on public.bookings
for each row execute function public.booking_audit_trigger();

drop trigger if exists booking_payments_audit on public.booking_payments;
create trigger booking_payments_audit after insert or update or delete on public.booking_payments
for each row execute function public.booking_audit_trigger();

drop trigger if exists booking_refunds_audit on public.booking_refunds;
create trigger booking_refunds_audit after insert or update or delete on public.booking_refunds
for each row execute function public.booking_audit_trigger();

alter table public.customers enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_payments enable row level security;
alter table public.booking_refunds enable row level security;
alter table public.booking_status_history enable row level security;
alter table public.booking_audit_log enable row level security;
alter table public.booking_mutations enable row level security;
alter table public.booking_sync_health enable row level security;
alter table public.booking_migration_snapshots enable row level security;

-- Match the existing production manager policy without widening access.
do $$
declare
  t text;
begin
  foreach t in array array['customers','bookings','booking_payments','booking_refunds','booking_status_history','booking_audit_log','booking_mutations','booking_sync_health','booking_migration_snapshots']
  loop
    execute format('drop policy if exists manager_all_%I on public.%I', t, t);
    execute format('create policy manager_all_%I on public.%I for all to authenticated using (public.is_adwaa_booking_manager()) with check (public.is_adwaa_booking_manager())', t, t);
  end loop;
end $$;

create or replace function public.save_booking_v2(
  p_booking jsonb,
  p_expected_version bigint default null,
  p_idempotency_key uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id text := coalesce(nullif(trim(p_booking ->> 'id'), ''), gen_random_uuid()::text);
  v_code text := trim(coalesce(p_booking ->> 'code', ''));
  v_name text := trim(coalesce(p_booking ->> 'name', p_booking ->> 'customer_name', ''));
  v_phone text := nullif(trim(coalesce(p_booking ->> 'phone', p_booking ->> 'customer_phone', '')), '');
  v_date date;
  v_end_date date;
  v_existing public.bookings%rowtype;
  v_saved public.bookings%rowtype;
  v_prior jsonb;
begin
  if not public.is_adwaa_booking_manager() then
    raise exception 'Not authorized to save bookings' using errcode = '42501';
  end if;

  select result into v_prior from public.booking_mutations where idempotency_key = p_idempotency_key;
  if found then return v_prior; end if;

  if v_code = '' then raise exception 'Booking code is required' using errcode = '22023'; end if;
  if v_name = '' then raise exception 'Customer name is required' using errcode = '22023'; end if;
  begin
    v_date := (p_booking ->> 'date')::date;
    v_end_date := coalesce(nullif(p_booking ->> 'endDate','')::date, v_date);
  exception when others then
    raise exception 'Valid booking date is required' using errcode = '22023';
  end;
  if v_end_date < v_date then raise exception 'Booking end date cannot precede start date' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('adwaa-booking-write', 0));

  select * into v_existing from public.bookings where id = v_id for update;
  if not found then
    select * into v_existing from public.bookings where code = v_code for update;
  end if;

  if found then
    if p_expected_version is not null and v_existing.version <> p_expected_version then
      raise exception 'Booking was changed on another device; refresh before saving' using errcode = '40001';
    end if;
    update public.bookings
       set code = v_code,
           customer_name = v_name,
           customer_phone = v_phone,
           booking_date = v_date,
           end_date = v_end_date,
           booking_type = coalesce(nullif(p_booking ->> 'type',''), v_existing.booking_type),
           status = coalesce(nullif(p_booking ->> 'status',''), v_existing.status),
           total_amount = greatest(0, coalesce(nullif(p_booking ->> 'total','')::numeric, v_existing.total_amount)),
           discount_amount = greatest(0, coalesce(nullif(p_booking ->> 'discount','')::numeric, v_existing.discount_amount)),
           notes = nullif(p_booking ->> 'notes',''),
           source = nullif(p_booking ->> 'source',''),
           version = v_existing.version + 1,
           legacy_payload = p_booking
     where id = v_existing.id
     returning * into v_saved;
  else
    insert into public.bookings(
      id, code, customer_name, customer_phone, booking_date, end_date, booking_type, status,
      total_amount, discount_amount, notes, source, legacy_payload, created_by, updated_by
    ) values (
      v_id, v_code, v_name, v_phone, v_date, v_end_date,
      coalesce(nullif(p_booking ->> 'type',''), 'يومي'),
      coalesce(nullif(p_booking ->> 'status',''), 'مؤكد'),
      greatest(0, coalesce(nullif(p_booking ->> 'total','')::numeric, 0)),
      greatest(0, coalesce(nullif(p_booking ->> 'discount','')::numeric, 0)),
      nullif(p_booking ->> 'notes',''), nullif(p_booking ->> 'source',''), p_booking, auth.uid(), auth.uid()
    ) returning * into v_saved;
  end if;

  v_prior := to_jsonb(v_saved);
  insert into public.booking_mutations(idempotency_key, booking_id, operation, result, created_by)
  values (p_idempotency_key, v_saved.id, case when v_existing.id is null then 'insert' else 'update' end, v_prior, auth.uid());
  return v_prior;
end;
$$;

revoke all on function public.save_booking_v2(jsonb,bigint,uuid) from public, anon;
grant execute on function public.save_booking_v2(jsonb,bigint,uuid) to authenticated;

create or replace function public.record_booking_payment_v2(
  p_booking_id text,
  p_payment_type text,
  p_amount numeric,
  p_method text default null,
  p_paid_at timestamptz default now(),
  p_note text default null,
  p_idempotency_key uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_saved public.booking_payments%rowtype;
begin
  if not public.is_adwaa_booking_manager() then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_amount <= 0 then raise exception 'Payment amount must be positive' using errcode='22023'; end if;
  select * into v_saved from public.booking_payments where idempotency_key=p_idempotency_key;
  if found then return to_jsonb(v_saved); end if;
  insert into public.booking_payments(booking_id,payment_type,amount,method,paid_at,note,idempotency_key,created_by)
  values(p_booking_id,coalesce(nullif(trim(p_payment_type),''),'payment'),p_amount,nullif(trim(p_method),''),coalesce(p_paid_at,now()),nullif(trim(p_note),''),p_idempotency_key,auth.uid())
  returning * into v_saved;
  return to_jsonb(v_saved);
end;
$$;

revoke all on function public.record_booking_payment_v2(text,text,numeric,text,timestamptz,text,uuid) from public, anon;
grant execute on function public.record_booking_payment_v2(text,text,numeric,text,timestamptz,text,uuid) to authenticated;

create or replace function public.record_booking_refund_v2(
  p_booking_id text,
  p_payment_id uuid,
  p_amount numeric,
  p_method text default null,
  p_refunded_at timestamptz default now(),
  p_note text default null,
  p_idempotency_key uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment_amount numeric;
  v_refunded numeric;
  v_saved public.booking_refunds%rowtype;
begin
  if not public.is_adwaa_booking_manager() then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_amount <= 0 then raise exception 'Refund amount must be positive' using errcode='22023'; end if;
  select * into v_saved from public.booking_refunds where idempotency_key=p_idempotency_key;
  if found then return to_jsonb(v_saved); end if;

  if p_payment_id is not null then
    select amount into v_payment_amount from public.booking_payments where id=p_payment_id and booking_id=p_booking_id for update;
    if not found then raise exception 'Payment does not belong to booking' using errcode='23503'; end if;
    select coalesce(sum(amount),0) into v_refunded from public.booking_refunds where payment_id=p_payment_id;
    if v_refunded + p_amount > v_payment_amount then
      raise exception 'Refund exceeds original payment' using errcode='23514';
    end if;
  end if;

  insert into public.booking_refunds(booking_id,payment_id,amount,method,refunded_at,note,idempotency_key,created_by)
  values(p_booking_id,p_payment_id,p_amount,nullif(trim(p_method),''),coalesce(p_refunded_at,now()),nullif(trim(p_note),''),p_idempotency_key,auth.uid())
  returning * into v_saved;
  return to_jsonb(v_saved);
end;
$$;

revoke all on function public.record_booking_refund_v2(text,uuid,numeric,text,timestamptz,text,uuid) from public, anon;
grant execute on function public.record_booking_refund_v2(text,uuid,numeric,text,timestamptz,text,uuid) to authenticated;

create or replace view public.booking_financial_totals
with (security_invoker = true)
as
select
  b.id as booking_id,
  b.code,
  b.total_amount,
  coalesce(p.paid_amount,0)::numeric(12,2) as paid_amount,
  coalesce(r.refunded_amount,0)::numeric(12,2) as refunded_amount,
  greatest(0,b.total_amount-coalesce(p.paid_amount,0)+coalesce(r.refunded_amount,0))::numeric(12,2) as outstanding_amount
from public.bookings b
left join (select booking_id,sum(amount) paid_amount from public.booking_payments group by booking_id) p on p.booking_id=b.id
left join (select booking_id,sum(amount) refunded_amount from public.booking_refunds group by booking_id) r on r.booking_id=b.id;

grant select on public.booking_financial_totals to authenticated;
