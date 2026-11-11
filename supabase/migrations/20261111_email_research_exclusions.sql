-- Additive research-quality hint only. No data migration, consent or delivery changes.
begin;

create or replace function public.email_claim_research_batch(p_workspace_limit integer default 200)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_settings public.email_research_settings; v_run public.email_research_runs;
  v_day date; v_requests integer; v_used integer; v_reserved integer; v_remaining integer;
  v_rolling_requests integer; v_rolling_inserted integer;
  v_token uuid; v_product jsonb;
  v_exclude_emails jsonb;
begin
  if p_workspace_limit is null or p_workspace_limit not between 1 and 200 then
    raise exception 'EMAIL_RESEARCH_LIMIT_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('email-research-global',0));
  update public.email_research_runs set state = 'expired',finished_at = now(),error_code = 'EMAIL_RESEARCH_EXPIRED'
    where state = 'claimed' and expires_at <= now();
  -- Every run is a permanent paid-request reservation, regardless of outcome/revision.
  -- UTC-day + rolling-24h prevents timezone edits or midnight bursts bypassing the cap.
  for v_settings in
    select s.* from public.email_research_settings s join public.products p
      on p.workspace_id = s.workspace_id and p.id = s.product_id
    where s.enabled and coalesce(p.source_facts->>'archived','false') = 'false'
      and public.email_research_admin(s.workspace_id,s.enabled_by)
      and exists (select 1 from public.workspace_openai_provider_credentials c where c.workspace_id = s.workspace_id)
      and extract(hour from now() at time zone s.timezone) >= s.start_hour
      and (select count(*) from public.email_research_runs r where r.workspace_id = s.workspace_id
        and r.claimed_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') < p_workspace_limit
      and (select count(*) from public.email_research_runs r where r.workspace_id = s.workspace_id
        and r.claimed_at > now() - interval '24 hours') < p_workspace_limit
    order by coalesce((select max(r.claim_order) from public.email_research_runs r
      where r.workspace_id = s.workspace_id and r.product_id = s.product_id),0),s.workspace_id,s.product_id
  loop
    perform pg_advisory_xact_lock(hashtextextended('email-workspace:' || v_settings.workspace_id::text,0));
    if not public.email_research_lock_scope(v_settings.workspace_id,v_settings.product_id,v_settings.enabled_by) then continue; end if;
    select s.* into v_settings from public.email_research_settings s
      where s.workspace_id = v_settings.workspace_id and s.product_id = v_settings.product_id for update;
    if not v_settings.enabled then continue; end if;
    v_day := (now() at time zone v_settings.timezone)::date;
    select count(*)::integer,coalesce(sum(r.inserted_count),0)::integer,
      coalesce(sum(case when r.state = 'claimed' and r.expires_at > now()
        and r.settings_revision = v_settings.settings_revision then r.batch_limit else 0 end),0)::integer
      into v_requests,v_used,v_reserved from public.email_research_runs r
      where r.workspace_id = v_settings.workspace_id and r.product_id = v_settings.product_id and r.scheduled_day = v_day;
    select count(*)::integer,coalesce(sum(r.inserted_count),0)::integer
      into v_rolling_requests,v_rolling_inserted from public.email_research_runs r
      where r.workspace_id = v_settings.workspace_id and r.product_id = v_settings.product_id
        and r.claimed_at > now() - interval '24 hours';
    select coalesce(sum(r.batch_limit),0)::integer into v_reserved from public.email_research_runs r
      where r.workspace_id = v_settings.workspace_id and r.product_id = v_settings.product_id
        and r.state = 'claimed' and r.expires_at > now() and r.settings_revision = v_settings.settings_revision;
    v_remaining := greatest(0,v_settings.daily_target - greatest(v_used,v_rolling_inserted) - v_reserved);
    if greatest(v_requests,v_rolling_requests) >= v_settings.daily_request_limit or v_remaining = 0 then continue; end if;
    select jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'audience',p.audience) into v_product
      from public.products p where p.workspace_id = v_settings.workspace_id and p.id = v_settings.product_id;
    v_token := gen_random_uuid();
    insert into public.email_research_runs(workspace_id,product_id,settings_revision,settings_snapshot,scheduled_day,request_number,
      claim_token_hash,batch_limit,claimed_at,expires_at)
      values(v_settings.workspace_id,v_settings.product_id,v_settings.settings_revision,to_jsonb(v_settings),v_day,v_requests + 1,
        encode(sha256(convert_to(v_token::text,'UTF8')),'hex'),least(10,v_remaining),now(),now() + interval '15 minutes')
      returning * into v_run;
    -- BEGIN EXCLUSION READ: only after a live authorized exact-app claim is reserved.
    -- Reuse the unchanged evidence gate; do not trust status, imports or bare emails.
    -- Provenance must match a completed research insertion in this same scope.
    -- JSON comparisons deliberately avoid casting arbitrary contact evidence.
    select coalesce(jsonb_agg(x.email order by x.created_at desc,x.id desc),'[]'::jsonb)
      into v_exclude_emails from (
        select c.email,c.created_at,c.id
        from public.email_contacts c
        join public.email_research_runs r
          on r.workspace_id = c.workspace_id and r.product_id = c.product_id
          and c.source_evidence->'research_run_id' = to_jsonb(r.id)
        where c.workspace_id = v_run.workspace_id and c.product_id = v_run.product_id
          and r.state = 'completed' and r.inserted_count > 0
          and c.source_evidence->'settings_revision' = to_jsonb(r.settings_revision)
          and c.source_evidence->'scheduled_day' = to_jsonb(r.scheduled_day)
          and c.source_evidence->'researched_at' = to_jsonb(r.finished_at)
          and public.email_research_candidate(jsonb_build_object(
            'email',c.email,'organization',c.organization,'source_url',c.source_url,
            'source_evidence',c.source_evidence))->>'email' = c.email
        order by c.created_at desc,c.id desc
        limit 100
      ) x;
    -- END EXCLUSION READ
    return jsonb_build_object('allowed',true,'run_id',v_run.id,'claim_token',v_token,'workspace_id',v_run.workspace_id,'product_id',v_run.product_id,
      'target_remaining',v_remaining,'batch_limit',v_run.batch_limit,'query',v_settings.query,'timezone',v_settings.timezone,
      'scheduled_day',v_day,'request_number',v_run.request_number,'product',v_product,'exclude_emails',v_exclude_emails);
  end loop;
  return null;
end $$;

-- No new RPC, helper ACL, table permission, client field or credential access.
revoke all on function public.email_claim_research_batch(integer) from public, anon, authenticated, service_role;
grant execute on function public.email_claim_research_batch(integer) to service_role;
commit;
