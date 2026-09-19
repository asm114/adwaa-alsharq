-- Additive relational booking schema. Does not read or modify app_state.

create table if not exists public.bookings (
  id text primary key default gen_random_uuid()::text,
  code text not null unique check (length(trim(code)) > 0),
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
create index if not exists bookings_date_status_idx on public.bookings (booking_date,status);
create index if not exists bookings_phone_idx on public.bookings (customer_phone);
create index if not exists bookings_updated_idx on public.bookings (updated_at desc);

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
create index if not exists booking_payments_booking_idx on public.booking_payments (booking_id,paid_at);

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
create index if not exists booking_refunds_booking_idx on public.booking_refunds (booking_id,refunded_at);

create table if not exists public.booking_status_history (
  id bigint generated always as identity primary key,
  booking_id text not null references public.bookings(id) on delete restrict,
  old_status text,
  new_status text not null,
  note text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists booking_status_history_booking_idx on public.booking_status_history (booking_id,changed_at desc);

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
create index if not exists booking_audit_log_entity_idx on public.booking_audit_log (entity_type,entity_id,changed_at desc);

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
returns boolean language sql stable security invoker set search_path=''
as $$ select lower(coalesce((select auth.jwt())->>'email',''))=lower('asm114@hotmail.com') $$;
revoke all on function public.is_adwaa_booking_manager() from public,anon;
grant execute on function public.is_adwaa_booking_manager() to authenticated;

create or replace function public.booking_set_updated_at()
returns trigger language plpgsql security invoker set search_path=''
as $$ begin new.updated_at=now(); new.updated_by=auth.uid(); return new; end $$;

create or replace function public.booking_audit_trigger()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.booking_audit_log(entity_type,entity_id,action,before_data,after_data,changed_by)
  values(tg_table_name,case when tg_op='DELETE' then old.id::text else new.id::text end,tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,auth.uid());
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.booking_audit_trigger() from public,anon,authenticated;

create or replace function public.booking_status_history_trigger()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='INSERT' then
    insert into public.booking_status_history(booking_id,old_status,new_status,changed_by) values(new.id,null,new.status,auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.booking_status_history(booking_id,old_status,new_status,changed_by) values(new.id,old.status,new.status,auth.uid());
  end if;
  return new;
end $$;
revoke all on function public.booking_status_history_trigger() from public,anon,authenticated;

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at before update on public.bookings for each row execute function public.booking_set_updated_at();
drop trigger if exists bookings_status_history on public.bookings;
create trigger bookings_status_history after insert or update of status on public.bookings for each row execute function public.booking_status_history_trigger();
drop trigger if exists bookings_audit on public.bookings;
create trigger bookings_audit after insert or update or delete on public.bookings for each row execute function public.booking_audit_trigger();
drop trigger if exists booking_payments_audit on public.booking_payments;
create trigger booking_payments_audit after insert or update or delete on public.booking_payments for each row execute function public.booking_audit_trigger();
drop trigger if exists booking_refunds_audit on public.booking_refunds;
create trigger booking_refunds_audit after insert or update or delete on public.booking_refunds for each row execute function public.booking_audit_trigger();

alter table public.bookings enable row level security;
alter table public.booking_payments enable row level security;
alter table public.booking_refunds enable row level security;
alter table public.booking_status_history enable row level security;
alter table public.booking_audit_log enable row level security;
alter table public.booking_mutations enable row level security;
alter table public.booking_sync_health enable row level security;
alter table public.booking_migration_snapshots enable row level security;

do $$
declare t text; p text;
begin
  foreach t in array array['bookings','booking_payments','booking_refunds','booking_status_history','booking_audit_log','booking_mutations','booking_sync_health','booking_migration_snapshots'] loop
    p:='manager_all_'||t;
    execute format('drop policy if exists %I on public.%I',p,t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_adwaa_booking_manager()) with check (public.is_adwaa_booking_manager())',p,t);
  end loop;
end $$;

create or replace view public.booking_financial_totals with (security_invoker=true) as
select b.id booking_id,b.code,b.total_amount,
  coalesce(p.paid_amount,0)::numeric(12,2) paid_amount,
  coalesce(r.refunded_amount,0)::numeric(12,2) refunded_amount,
  greatest(0,b.total_amount-coalesce(p.paid_amount,0)+coalesce(r.refunded_amount,0))::numeric(12,2) outstanding_amount
from public.bookings b
left join (select booking_id,sum(amount) paid_amount from public.booking_payments group by booking_id) p on p.booking_id=b.id
left join (select booking_id,sum(amount) refunded_amount from public.booking_refunds group by booking_id) r on r.booking_id=b.id;
grant select on public.booking_financial_totals to authenticated;
