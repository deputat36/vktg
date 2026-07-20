\set ON_ERROR_STOP on

create or replace function harness.wave1_base_intake()
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'deal',jsonb_build_object(
      'intake_contract_version',1,
      'intake_catalog_version','2026-07-17.1',
      'intake_action','lawyer',
      'intake_draft',jsonb_build_object(
        'requestType','capture_situation',
        'representation','seller',
        'stage','object_chosen',
        'objectType','flat_mkd',
        'objectAddress','нейтральный ориентир',
        'cadastralNumberKnown','unknown',
        'urgency','normal',
        'targetDate','2026-07-25',
        'dateUnknown',false,
        'leadSpnConfirmed',true,
        'nextAction','Передать структурированный запрос юристу.',
        'lawyerRequestType','',
        'requestedDecision','',
        'lawyerRequestConfirmed',true,
        'lawyerQuestion','',
        'documentsReviewed',true,
        'facts','{}'::jsonb,
        'documents','[]'::jsonb
      )
    )
  );
$function$;

create or replace function harness.wave1_with_fact(p_payload jsonb,p_rule_id text,p_source text)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $function$
  select jsonb_set(
    p_payload,
    array['deal','intake_draft','facts',p_rule_id],
    jsonb_build_object('value','yes','source',p_source),
    true
  );
$function$;

create or replace function harness.wave1_with_document(p_payload jsonb,p_type text,p_status text)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $function$
  select jsonb_set(
    p_payload,
    '{deal,intake_draft,documents}',
    coalesce(p_payload #> '{deal,intake_draft,documents}','[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('type',p_type,'status',p_status)),
    true
  );
$function$;

create or replace function harness.wave1_owner_context(p_lawyer_id text default '74000000-0000-4000-8000-000000000001')
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $function$
  select jsonb_build_object('lawyer_id',p_lawyer_id);
$function$;

do $contract$
begin
  perform harness.assert_true(
    jsonb_array_length(nav_v2_private.nav_v2_intake_semantics_wave1_spec_v1())=4,
    'wave1 spec must contain four rules'
  );
  perform harness.assert_true(
    not has_function_privilege('authenticated','nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(jsonb,jsonb)','EXECUTE')
    and not has_function_privilege('anon','nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(jsonb,jsonb)','EXECUTE')
    and has_function_privilege('service_role','nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(jsonb,jsonb)','EXECUTE'),
    'qualification grants escaped service boundary'
  );
end;
$contract$;

do $positive_scenarios$
declare
  p jsonb;
  a jsonb;
  q jsonb;
  before_deals integer;
  before_documents integer;
  before_tasks integer;
begin
  select count(*) into before_deals from public.nav_deals_v2;
  select count(*) into before_documents from public.nav_deal_documents_v2;
  select count(*) into before_tasks from public.nav_deal_tasks_v2;

  -- spouse
  p := harness.wave1_with_fact(harness.wave1_base_intake(),'spouse','client');
  p := harness.wave1_with_document(p,'spouse_consent_status','requested');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(a,harness.wave1_owner_context());
  perform harness.assert_true((q->'qualified_rule_ids') @> '["spouse"]'::jsonb,'spouse did not qualify');
  perform harness.assert_true((q->>'candidate_unsupported_after_future_integration')::integer=11,'spouse candidate count is wrong');

  -- seller absent
  p := harness.wave1_with_fact(harness.wave1_base_intake(),'seller_absent','client');
  p := harness.wave1_with_document(p,'participation_plan','requested');
  p := harness.wave1_with_document(p,'power_of_attorney','available');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(a,harness.wave1_owner_context());
  perform harness.assert_true((q->'qualified_rule_ids') @> '["seller_absent"]'::jsonb,'seller_absent did not qualify');
  perform harness.assert_true(
    exists(select 1 from jsonb_array_elements(q->'rule_results') r where r->>'rule_id'='seller_absent' and (r->>'blocks_deposit')::boolean and (r->>'blocks_deal')::boolean),
    'seller_absent block flags changed'
  );

  -- encumbrance
  p := harness.wave1_with_fact(harness.wave1_base_intake(),'encumbrance','document');
  p := harness.wave1_with_document(p,'encumbrance_extract','available');
  p := harness.wave1_with_document(p,'release_terms','requested');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(a,harness.wave1_owner_context());
  perform harness.assert_true((q->'qualified_rule_ids') @> '["encumbrance"]'::jsonb,'encumbrance did not qualify');
  perform harness.assert_true(
    exists(select 1 from jsonb_array_elements(q->'rule_results') r where r->>'rule_id'='encumbrance' and r->>'risk_level'='red'),
    'encumbrance risk level changed'
  );

  -- inheritance
  p := harness.wave1_with_fact(harness.wave1_base_intake(),'inheritance','document');
  p := harness.wave1_with_document(p,'inheritance_certificate','available');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(a,harness.wave1_owner_context());
  perform harness.assert_true((q->'qualified_rule_ids') @> '["inheritance"]'::jsonb,'inheritance did not qualify');
  perform harness.assert_true(
    exists(select 1 from jsonb_array_elements(q->'rule_results') r where r->>'rule_id'='inheritance' and (r->>'blocks_deposit')::boolean and not (r->>'blocks_deal')::boolean),
    'inheritance gate flags changed'
  );

  -- all four together
  p := harness.wave1_base_intake();
  p := harness.wave1_with_fact(p,'spouse','client');
  p := harness.wave1_with_fact(p,'seller_absent','client');
  p := harness.wave1_with_fact(p,'encumbrance','document');
  p := harness.wave1_with_fact(p,'inheritance','document');
  p := harness.wave1_with_document(p,'spouse_consent_status','requested');
  p := harness.wave1_with_document(p,'participation_plan','requested');
  p := harness.wave1_with_document(p,'power_of_attorney','available');
  p := harness.wave1_with_document(p,'encumbrance_extract','available');
  p := harness.wave1_with_document(p,'release_terms','requested');
  p := harness.wave1_with_document(p,'inheritance_certificate','available');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(a,harness.wave1_owner_context());
  perform harness.assert_true(jsonb_array_length(q->'qualified_rule_ids')=4,'combined wave1 did not qualify all four rules');
  perform harness.assert_true((q->>'candidate_unsupported_after_future_integration')::integer=8,'combined future unsupported count differs from eight');
  perform harness.assert_true((q->>'changes_supported_inventory')::boolean is false,'qualification changed supported inventory');
  perform harness.assert_true((q->>'production_ready')::boolean is false,'qualification claims production readiness');
  perform harness.assert_true((q->>'writes_performed')::boolean is false,'qualification claims writes');
  perform harness.assert_true(
    not exists(select 1 from jsonb_array_elements(a #> '{work_plan,task_candidates}') t where t->>'rule_id' in ('spouse','seller_absent','encumbrance','inheritance') and t->>'owner_role'<>'lawyer'),
    'wave1 task escaped lawyer ownership'
  );
  perform harness.assert_true(
    not exists(select 1 from jsonb_array_elements(a #> '{work_plan,task_candidates}') t where t->>'rule_id' in ('spouse','seller_absent','encumbrance','inheritance') and t->>'owner_role'='broker'),
    'wave1 expanded broker scope'
  );

  perform harness.assert_true((select count(*) from public.nav_deals_v2)=before_deals,'qualification changed deal rows');
  perform harness.assert_true((select count(*) from public.nav_deal_documents_v2)=before_documents,'qualification changed document rows');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2)=before_tasks,'qualification changed task rows');
end;
$positive_scenarios$;

do $negative_scenarios$
declare
  p jsonb;
  a jsonb;
  q jsonb;
  failed boolean;
begin
  -- unchecked evidence source
  p := harness.wave1_with_fact(harness.wave1_base_intake(),'spouse','unchecked');
  p := harness.wave1_with_document(p,'spouse_consent_status','requested');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(a,harness.wave1_owner_context());
  perform harness.assert_true(not (q->'qualified_rule_ids' @> '["spouse"]'::jsonb),'unchecked spouse evidence qualified');
  perform harness.assert_true(
    exists(select 1 from jsonb_array_elements(q->'rule_results') r cross join lateral jsonb_array_elements_text(r->'gaps') g where r->>'rule_id'='spouse' and g='fact_evidence_source_missing'),
    'unchecked evidence gap is missing'
  );

  -- missing document status
  p := harness.wave1_with_fact(harness.wave1_base_intake(),'inheritance','client');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(a,harness.wave1_owner_context());
  perform harness.assert_true(not (q->'qualified_rule_ids' @> '["inheritance"]'::jsonb),'inheritance without document qualified');

  -- unresolved lawyer owner
  p := harness.wave1_with_fact(harness.wave1_base_intake(),'spouse','client');
  p := harness.wave1_with_document(p,'spouse_consent_status','requested');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(a,'{}'::jsonb);
  perform harness.assert_true(not (q->'qualified_rule_ids' @> '["spouse"]'::jsonb),'spouse without lawyer owner qualified');

  -- tampered risk level
  a := jsonb_set(a,'{legal_passport,risk_flags,0,level}','"red"'::jsonb,true);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(a,harness.wave1_owner_context());
  perform harness.assert_true(not (q->'qualified_rule_ids' @> '["spouse"]'::jsonb),'tampered spouse risk qualified');

  -- invalid lawyer UUID fails closed
  failed := false;
  begin
    perform nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(a,harness.wave1_owner_context('not-a-uuid'));
  exception when sqlstate '22023' then failed := true;
  end;
  perform harness.assert_true(failed,'invalid lawyer UUID was accepted');
end;
$negative_scenarios$;

select jsonb_build_object(
  'result','Navigator v2 intake semantics wave1 qualification PostgreSQL 17 assertions passed',
  'base_unsupported_inventory',12,
  'candidate_rules',jsonb_build_array('spouse','seller_absent','encumbrance','inheritance'),
  'writes_performed',false,
  'production_ready',false
) as evidence;
