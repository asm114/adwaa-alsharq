-- Staging-only additive follow-up for the V2 feedback security foundation.
--
-- 1. Replace boundary-burst-prone fixed windows with serialized rolling
--    event windows before any rate rule leaves Shadow Mode.
-- 2. Add an atomic cleanup claim that shares the feedback-row lock used by
--    finalization before any Storage deletion is enabled.
--
-- Legacy RPC grants and legacy Storage policies remain unchanged.

create table private.customer_portal_feedback_rate_limit_events (
  id bigint generated always as identity primary key,
  rule_key text not null
    references private.customer_portal_feedback_rate_limit_rules(rule_key)
    on delete cascade,
  subject_hash text not null
    check (subject_hash ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default statement_timestamp()
);

create index customer_portal_feedback_rate_events_lookup_idx
  on private.customer_portal_feedback_rate_limit_events(
    rule_key,
    subject_hash,
    occurred_at desc
  );

alter table private.customer_portal_feedback_rate_limit_events
  enable row level security;

revoke all on table private.customer_portal_feedback_rate_limit_events
  from public, anon, authenticated;
revoke all on sequence private.customer_portal_feedback_rate_limit_events_id_seq
  from public, anon, authenticated;

comment on table private.customer_portal_feedback_rate_limit_windows is
  'Historical V2 foundation table. Retained additively but no longer used after rolling-event hardening.';

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

    -- Serialize count-plus-insert per rule and subject so parallel requests
    -- cannot undercount the same rolling window.
    perform pg_advisory_xact_lock(
      hashtextextended(v_rule.rule_key || ':' || v_subject_hash, 0)
    );

    insert into private.customer_portal_feedback_rate_limit_events (
      rule_key,
      subject_hash,
      occurred_at
    ) values (
      v_rule.rule_key,
      v_subject_hash,
      statement_timestamp()
    );

    select count(*) into v_count
    from private.customer_portal_feedback_rate_limit_events event
    where event.rule_key = v_rule.rule_key
      and event.subject_hash = v_subject_hash
      and event.occurred_at > statement_timestamp()
        - make_interval(secs => v_rule.window_seconds);

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

revoke all on function private.consume_customer_portal_feedback_rate_limits_v2(text, text)
  from public, anon, authenticated;

create table private.customer_portal_feedback_cleanup_claims (
  object_path text primary key,
  feedback_id uuid
    references public.customer_portal_feedback(id) on delete set null,
  reason text not null check (
    reason in (
      'unreserved_older_than_24h',
      'submitted_unreferenced_older_than_24h',
      'pending_ticket_expired_older_than_2h'
    )
  ),
  claimed_at timestamptz not null default now()
);

create index customer_portal_feedback_cleanup_claims_feedback_idx
  on private.customer_portal_feedback_cleanup_claims(feedback_id);

alter table private.customer_portal_feedback_cleanup_claims
  enable row level security;

revoke all on table private.customer_portal_feedback_cleanup_claims
  from public, anon, authenticated;

create or replace function public.claim_customer_portal_feedback_orphans_v2(
  p_limit integer default 500
)
returns table(
  object_path text,
  reason text,
  object_age interval
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_feedback public.customer_portal_feedback%rowtype;
  v_reason text;
  v_returned integer := 0;
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 500));
begin
  for v_candidate in
    select
      object.name as object_name,
      slot.feedback_id,
      coalesce(object.created_at, object.updated_at) as object_created_at
    from storage.objects object
    left join private.customer_portal_feedback_upload_slots slot
      on slot.object_path = object.name
    where object.bucket_id = 'customer-portal-feedback'
      and coalesce(object.created_at, object.updated_at) <= now() - interval '2 hours'
    order by coalesce(object.created_at, object.updated_at)
    limit 2000
  loop
    exit when v_returned >= v_limit;
    v_reason := null;

    if v_candidate.feedback_id is null then
      if v_candidate.object_created_at > now() - interval '24 hours' then
        continue;
      end if;

      -- Close the small gap between candidate enumeration and claiming an
      -- unreserved path. V2 paths are random UUIDs, but recheck anyway.
      if exists (
        select 1
        from private.customer_portal_feedback_upload_slots slot
        where slot.object_path = v_candidate.object_name
      ) then
        continue;
      end if;
      v_reason := 'unreserved_older_than_24h';
    else
      -- Finalization locks this same feedback row. If it is already running,
      -- SKIP LOCKED defers cleanup. If cleanup locks first, the claim is
      -- committed before finalization can continue and the trigger below
      -- rejects submission of the claimed path.
      select * into v_feedback
      from public.customer_portal_feedback feedback
      where feedback.id = v_candidate.feedback_id
      for update skip locked;

      if not found then
        continue;
      end if;

      if v_feedback.submitted then
        if v_candidate.object_name = any(coalesce(v_feedback.image_paths, '{}'::text[])) then
          continue;
        end if;
        if v_candidate.object_created_at > now() - interval '24 hours' then
          continue;
        end if;
        v_reason := 'submitted_unreferenced_older_than_24h';
      else
        if v_feedback.created_at > now() - interval '2 hours' then
          continue;
        end if;
        v_reason := 'pending_ticket_expired_older_than_2h';
      end if;
    end if;

    insert into private.customer_portal_feedback_cleanup_claims (
      object_path,
      feedback_id,
      reason,
      claimed_at
    ) values (
      v_candidate.object_name,
      v_candidate.feedback_id,
      v_reason,
      now()
    )
    on conflict (object_path) do update
    set
      feedback_id = excluded.feedback_id,
      reason = excluded.reason,
      claimed_at = now();

    object_path := v_candidate.object_name;
    reason := v_reason;
    object_age := now() - v_candidate.object_created_at;
    v_returned := v_returned + 1;
    return next;
  end loop;
end;
$$;

create or replace function private.prevent_claimed_feedback_submission_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.submitted
     and exists (
       select 1
       from private.customer_portal_feedback_cleanup_claims claim
       where claim.feedback_id = new.id
         and claim.object_path = any(coalesce(new.image_paths, '{}'::text[]))
     ) then
    raise exception 'feedback upload cleanup is in progress';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_claimed_feedback_submission_v2
  on public.customer_portal_feedback;

create trigger prevent_claimed_feedback_submission_v2
before update of submitted, image_paths
on public.customer_portal_feedback
for each row
execute function private.prevent_claimed_feedback_submission_v2();

revoke all on function public.claim_customer_portal_feedback_orphans_v2(integer)
  from public, anon, authenticated;
grant execute on function public.claim_customer_portal_feedback_orphans_v2(integer)
  to service_role;

revoke all on function private.prevent_claimed_feedback_submission_v2()
  from public, anon, authenticated;

comment on function public.claim_customer_portal_feedback_orphans_v2(integer) is
  'Delete-mode-only atomic candidate claim. The Edge Function must still delete through the Storage API.';
