\set ON_ERROR_STOP on

create or replace function harness.wave2_base_intake(
  p_representation text default 'seller',
  p_request_type text default 'capture_situation',
  p_object_type text default 'flat_mkd'
)
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
        'requestType',p_request_type,
        'representation',p_representation,
        'stage','object_chosen',
        'objectType',p_object_type,
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

create or replace function harness.wave2_with_fact(p_payload jsonb,p_rule_id text,p_source text)
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

create or replace function harness.wave2_with_document(p_payload jsonb,p_type text,p_status text)
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

create or replace function harness.wave2_owner_context(p_lawyer_id text default '75000000-0000-4000-8000-000000000001')
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
    jsonb_array_length(nav_v2_private.nav_v2_intake_semantics_wave2_spec_v1())=4,
    'wave2 spec must contain four rules'
  );
  perform harness.assert_true(
    not has_function_privilege('authenticated','nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(jsonb,jsonb)','EXECUTE')
    and not has_function_privilege('anon','nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(jsonb,jsonb)','EXECUTE')
    and has_function_privilege('service_role','nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(jsonb,jsonb)','EXECUTE'),
    'wave2 qualification grants escaped service boundary'
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
  before_risks integer;
begin
  select count(*) into before_deals from public.nav_deals_v2;
  select count(*) into before_documents from public.nav_deal_documents_v2;
  select count(*) into before_tasks from public.nav_deal_tasks_v2;
  select count(*) into before_risks from public.nav_deal_risks_v2;

  -- bankruptcy risk: seller scope
  p := harness.wave2_with_fact(harness.wave2_base_intake('seller','capture_situation','flat_mkd'),'bankruptcy_risk','client');
  p := harness.wave2_with_document(p,'bankruptcy_check','available');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(a,harness.wave2_owner_context());
  perform harness.assert_true((q->'qualified_rule_ids') @> '["bankruptcy_risk"]'::jsonb,'bankruptcy_risk did not qualify');
  perform harness.assert_true((q->>'candidate_unsupported_after_future_integration')::integer=7,'bankruptcy candidate count is wrong');
  perform harness.assert_true(
    exists(select 1 from jsonb_array_elements(a #> '{work_plan,document_candidates}') d where d->>'type'='bankruptcy_check' and d->>'side'='seller' and d->>'owner_role'='seller_spn'),
    'bankruptcy seller document scope changed'
  );

  -- redevelopment: object scope and order-insensitive required document comparison
  p := harness.wave2_with_fact(harness.wave2_base_intake('seller','capture_situation','flat_mkd'),'redevelopment','document');
  p := harness.wave2_with_document(p,'technical_plan','available');
  p := harness.wave2_with_document(p,'redevelopment_approval','requested');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  a := jsonb_set(a,'{legal_passport,risk_flags,0,required_documents}','["redevelopment_approval","technical_plan"]'::jsonb,true);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(a,harness.wave2_owner_context());
  perform harness.assert_true((q->'qualified_rule_ids') @> '["redevelopment"]'::jsonb,'redevelopment did not qualify with normalized document set');
  perform harness.assert_true(
    (select count(*) from jsonb_array_elements(a #> '{work_plan,document_candidates}') d where d->>'type' in ('technical_plan','redevelopment_approval') and d->>'side'='object' and d->>'owner_role'='lead_spn')=2,
    'redevelopment object document scope changed'
  );

  -- payment after registration: deal scope
  p := harness.wave2_with_fact(harness.wave2_base_intake('seller','prepare_deal','flat_mkd'),'after_registration','client');
  p := harness.wave2_with_document(p,'settlement_scheme','requested');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(a,harness.wave2_owner_context());
  perform harness.assert_true((q->'qualified_rule_ids') @> '["after_registration"]'::jsonb,'after_registration did not qualify');
  perform harness.assert_true(
    exists(select 1 from jsonb_array_elements(a #> '{work_plan,document_candidates}') d where d->>'type'='settlement_scheme' and d->>'side'='deal' and d->>'owner_role'='lead_spn'),
    'after_registration deal document scope changed'
  );

  -- certificate: buyer scope, lawyer only
  p := harness.wave2_with_fact(harness.wave2_base_intake('buyer','prepare_deal','flat_mkd'),'certificate','document');
  p := harness.wave2_with_document(p,'certificate_terms','requested');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(a,harness.wave2_owner_context());
  perform harness.assert_true((q->'qualified_rule_ids') @> '["certificate"]'::jsonb,'certificate did not qualify');
  perform harness.assert_true(
    exists(select 1 from jsonb_array_elements(a #> '{work_plan,document_candidates}') d where d->>'type'='certificate_terms' and d->>'side'='buyer' and d->>'owner_role'='buyer_spn'),
    'certificate buyer document scope changed'
  );

  -- all four together, both sides accompanied
  p := harness.wave2_base_intake('both','prepare_deal','flat_mkd');
  p := harness.wave2_with_fact(p,'bankruptcy_risk','client');
  p := harness.wave2_with_fact(p,'redevelopment','document');
  p := harness.wave2_with_fact(p,'after_registration','client');
  p := harness.wave2_with_fact(p,'certificate','document');
  p := harness.wave2_with_document(p,'bankruptcy_check','available');
  p := harness.wave2_with_document(p,'technical_plan','available');
  p := harness.wave2_with_document(p,'redevelopment_approval','requested');
  p := harness.wave2_with_document(p,'settlement_scheme','requested');
  p := harness.wave2_with_document(p,'certificate_terms','requested');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(a,harness.wave2_owner_context());
  perform harness.assert_true(jsonb_array_length(q->'qualified_rule_ids')=4,'combined wave2 did not qualify all four rules');
  perform harness.assert_true((q->>'candidate_unsupported_after_future_integration')::integer=4,'combined future unsupported count differs from four');
  perform harness.assert_true((q->>'base_effective_supported_count')::integer=17,'wave2 changed effective supported baseline');
  perform harness.assert_true((q->>'base_effective_unsupported_inventory')::integer=8,'wave2 changed effective unsupported baseline');
  perform harness.assert_true((q->>'changes_supported_inventory')::boolean is false,'qualification changed supported inventory');
  perform harness.assert_true((q->>'production_ready')::boolean is false,'qualification claims production readiness');
  perform harness.assert_true((q->>'writes_performed')::boolean is false,'qualification claims writes');
  perform harness.assert_true(
    not exists(select 1 from jsonb_array_elements(a #> '{work_plan,task_candidates}') t where t->>'rule_id' in ('bankruptcy_risk','redevelopment','after_registration','certificate') and t->>'owner_role'<>'lawyer'),
    'wave2 task escaped lawyer ownership'
  );
  perform harness.assert_true(
    not exists(select 1 from jsonb_array_elements(a #> '{work_plan,task_candidates}') t where t->>'rule_id' in ('bankruptcy_risk','redevelopment','after_registration','certificate') and t->>'owner_role'='broker'),
    'wave2 expanded broker scope'
  );

  perform harness.assert_true((select count(*) from public.nav_deals_v2)=before_deals,'qualification changed deal rows');
  perform harness.assert_true((select count(*) from public.nav_deal_documents_v2)=before_documents,'qualification changed document rows');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2)=before_tasks,'qualification changed task rows');
  perform harness.assert_true((select count(*) from public.nav_deal_risks_v2)=before_risks,'qualification changed risk rows');
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
  p := harness.wave2_with_fact(harness.wave2_base_intake(),'bankruptcy_risk','unchecked');
  p := harness.wave2_with_document(p,'bankruptcy_check','available');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(a,harness.wave2_owner_context());
  perform harness.assert_true(not (q->'qualified_rule_ids' @> '["bankruptcy_risk"]'::jsonb),'unchecked bankruptcy evidence qualified');
  perform harness.assert_true(
    exists(select 1 from jsonb_array_elements(q->'rule_results') r cross join lateral jsonb_array_elements_text(r->'gaps') g where r->>'rule_id'='bankruptcy_risk' and g='fact_evidence_source_missing'),
    'unchecked evidence gap is missing'
  );

  -- missing document status
  p := harness.wave2_with_fact(harness.wave2_base_intake(),'redevelopment','client');
  p := harness.wave2_with_document(p,'technical_plan','available');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(a,harness.wave2_owner_context());
  perform harness.assert_true(not (q->'qualified_rule_ids' @> '["redevelopment"]'::jsonb),'redevelopment without approval status qualified');

  -- unresolved lawyer owner
  p := harness.wave2_with_fact(harness.wave2_base_intake('buyer','prepare_deal','flat_mkd'),'certificate','client');
  p := harness.wave2_with_document(p,'certificate_terms','requested');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(a,'{}'::jsonb);
  perform harness.assert_true(not (q->'qualified_rule_ids' @> '["certificate"]'::jsonb),'certificate without lawyer owner qualified');

  -- tampered document side
  p := harness.wave2_with_fact(harness.wave2_base_intake('seller','prepare_deal','flat_mkd'),'after_registration','client');
  p := harness.wave2_with_document(p,'settlement_scheme','requested');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  a := jsonb_set(a,'{work_plan,document_candidates,0,side}','"buyer"'::jsonb,true);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(a,harness.wave2_owner_context());
  perform harness.assert_true(not (q->'qualified_rule_ids' @> '["after_registration"]'::jsonb),'tampered settlement document side qualified');

  -- tampered risk level
  p := harness.wave2_with_fact(harness.wave2_base_intake('buyer','prepare_deal','flat_mkd'),'certificate','client');
  p := harness.wave2_with_document(p,'certificate_terms','requested');
  a := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  a := jsonb_set(a,'{legal_passport,risk_flags,0,level}','"red"'::jsonb,true);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(a,harness.wave2_owner_context());
  perform harness.assert_true(not (q->'qualified_rule_ids' @> '["certificate"]'::jsonb),'tampered certificate risk qualified');

  -- broker leakage
  a := jsonb_set(
    a,
    '{work_plan,task_candidates}',
    coalesce(a #> '{work_plan,task_candidates}','[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('rule_id','certificate','owner_role','broker')),
    true
  );
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(a,harness.wave2_owner_context());
  perform harness.assert_true(not (q->'qualified_rule_ids' @> '["certificate"]'::jsonb),'certificate with broker leakage qualified');

  -- blocked handoff
  a := jsonb_set(a,'{legal_passport,handoff_completeness,state}','"blocked"'::jsonb,true);
  q := nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(a,harness.wave2_owner_context());
  perform harness.assert_true(not (q->'qualified_rule_ids' @> '["certificate"]'::jsonb),'blocked handoff qualified');

  -- invalid lawyer UUID fails closed
  failed := false;
  begin
    perform nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(a,harness.wave2_owner_context('not-a-uuid'));
  exception when sqlstate '22023' then failed := true;
  end;
  perform harness.assert_true(failed,'invalid lawyer UUID was accepted');
end;
$negative_scenarios$;

select jsonb_build_object(
  'result','Navigator v2 intake semantics wave2 qualification PostgreSQL 17 assertions passed',
  'base_effective_supported_count',17,
  'base_effective_unsupported_inventory',8,
  'candidate_rules',jsonb_build_array('bankruptcy_risk','redevelopment','after_registration','certificate'),
  'writes_performed',false,
  'production_ready',false
) as evidence;
