-- Staging-only additive bound for V2 rolling-rate telemetry.
--
-- Over-limit attempts must not append unbounded event rows. The global rule is
-- evaluated first; once its rolling allowance is saturated, the request is
-- still classified for Shadow Mode but no lower-dimension telemetry is added.
-- Legacy RPCs, grants, policies, and Cutover state remain unchanged.

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
  v_global_saturated boolean := false;
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
    order by
      case subject_dimension
        when 'global' then 0
        when 'ip' then 1
        else 2
      end,
      window_seconds,
      rule_key
  loop
    v_subject_hash := case v_rule.subject_dimension
      when 'browser' then p_browser_hash
      when 'ip' then p_ip_hash
      else repeat('0', 64)
    end;

    perform pg_advisory_xact_lock(
      hashtextextended(v_rule.rule_key || ':' || v_subject_hash, 0)
    );

    select count(*) into v_count
    from private.customer_portal_feedback_rate_limit_events event
    where event.rule_key = v_rule.rule_key
      and event.subject_hash = v_subject_hash
      and event.occurred_at > statement_timestamp()
        - make_interval(secs => v_rule.window_seconds);

    if v_count >= v_rule.limit_count then
      would_block_rules := array_append(would_block_rules, v_rule.rule_key);
      if v_rule.subject_dimension = 'global' then
        v_global_saturated := true;
      end if;
      if not v_rule.shadow_mode then
        allowed := false;
      end if;
      continue;
    end if;

    -- Once the global rolling allowance is full, security_events still records
    -- the would-block outcome, but new attacker-selected browser identities do
    -- not create unbounded lower-dimension rate rows.
    if not v_global_saturated then
      insert into private.customer_portal_feedback_rate_limit_events (
        rule_key,
        subject_hash,
        occurred_at
      ) values (
        v_rule.rule_key,
        v_subject_hash,
        statement_timestamp()
      );
    end if;
  end loop;

  return next;
end;
$$;

revoke all on function private.consume_customer_portal_feedback_rate_limits_v2(text, text)
  from public, anon, authenticated;

create or replace function public.prune_customer_portal_feedback_rate_limit_events_v2()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from private.customer_portal_feedback_rate_limit_events
  where occurred_at <= now() - interval '2 days';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_customer_portal_feedback_rate_limit_events_v2()
  from public, anon, authenticated;
grant execute on function public.prune_customer_portal_feedback_rate_limit_events_v2()
  to service_role;

comment on function public.prune_customer_portal_feedback_rate_limit_events_v2() is
  'Service-only telemetry retention. Keeps two days, covering the longest one-day rolling rule.';
