\set ON_ERROR_STOP on

create or replace function harness.special_owner_context(p_lawyer_id text default '77000000-0000-4000-8000-000000000001')
returns jsonb
language sql
immutable
set search_path=pg_catalog
as $function$
 select jsonb_build_object('lawyer_id',p_lawyer_id);
$function$;

create or replace function harness.special_legal_problem()
returns jsonb
language sql
immutable
set search_path=pg_catalog,harness
as $function$
 select jsonb_set(
  jsonb_set(
   jsonb_set(
    jsonb_set(harness.base_intake(),'{deal,intake_action}','"lawyer"'::jsonb,true),
    '{deal,intake_draft,stage}','"legal_problem"'::jsonb,true
   ),
   '{deal,intake_draft,urgency}','"critical"'::jsonb,true
  ),
  '{deal,intake_draft,lawyerRequestConfirmed}','true'::jsonb,true
 );
$function$;

create or replace function harness.special_partner_agency()
returns jsonb
language plpgsql
immutable
set search_path=pg_catalog,harness
as $function$
declare p jsonb;
begin
 p:=jsonb_set(harness.base_intake(),'{deal,intake_action}','"lawyer"'::jsonb,true);
 p:=jsonb_set(p,'{deal,intake_draft,representation}','"partner_agency"'::jsonb,true);
 p:=jsonb_set(p,'{deal,intake_draft,partnerSide}','"both"'::jsonb,true);
 p:=jsonb_set(p,'{deal,intake_draft,lawyerRequestConfirmed}','true'::jsonb,true);
 p:=harness.with_fact(p,'partner_responsibility_clear','yes','document');
 p:=harness.with_document(p,'partner_responsibility_note','available');
 return p;
end;
$function$;

create or replace function harness.special_flat_ground()
returns jsonb
language plpgsql
immutable
set search_path=pg_catalog,harness
as $function$
declare p jsonb;
begin
 p:=jsonb_set(harness.base_intake(),'{deal,intake_action}','"lawyer"'::jsonb,true);
 p:=jsonb_set(p,'{deal,intake_draft,objectType}','"flat_ground"'::jsonb,true);
 p:=jsonb_set(p,'{deal,intake_draft,lawyerRequestConfirmed}','true'::jsonb,true);
 p:=harness.with_fact(p,'minor_registered','no','document');
 p:=harness.with_document(p,'land_status','available');
 p:=harness.with_document(p,'object_title_basis','requested');
 return p;
end;
$function$;

create or replace function harness.special_house_land()
returns jsonb
language plpgsql
immutable
set search_path=pg_catalog,harness
as $function$
declare p jsonb;
begin
 p:=jsonb_set(harness.base_intake(),'{deal,intake_action}','"lawyer"'::jsonb,true);
 p:=jsonb_set(p,'{deal,intake_draft,objectType}','"house_land"'::jsonb,true);
 p:=jsonb_set(p,'{deal,intake_draft,lawyerRequestConfirmed}','true'::jsonb,true);
 p:=harness.with_fact(p,'minor_registered','no','document');
 p:=harness.with_document(p,'house_title_basis','available');
 p:=harness.with_document(p,'land_title_basis','available');
 p:=harness.with_document(p,'boundary_status','requested');
 return p;
end;
$function$;

create or replace function harness.special_composite(p_object_type text)
returns jsonb
language plpgsql
immutable
set search_path=pg_catalog,harness
as $function$
declare p jsonb;
begin
 if p_object_type not in ('flat_ground','house_land') then raise exception 'unsupported special composite object'; end if;
 p:=harness.special_partner_agency();
 p:=jsonb_set(p,'{deal,intake_draft,stage}','"legal_problem"'::jsonb,true);
 p:=jsonb_set(p,'{deal,intake_draft,urgency}','"critical"'::jsonb,true);
 p:=jsonb_set(p,'{deal,intake_draft,objectType}',to_jsonb(p_object_type),true);
 if p_object_type='flat_ground' then
  p:=harness.with_document(p,'land_status','available');
  p:=harness.with_document(p,'object_title_basis','requested');
 else
  p:=harness.with_document(p,'house_title_basis','available');
  p:=harness.with_document(p,'land_title_basis','available');
  p:=harness.with_document(p,'boundary_status','requested');
 end if;
 return p;
end;
$function$;

do $contract$
begin
 perform harness.assert_true(jsonb_array_length(nav_v2_private.nav_v2_intake_special_semantics_spec_v1())=4,'special spec must contain four rules');
 perform harness.assert_true(
  not has_function_privilege('authenticated','nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(jsonb,jsonb)','EXECUTE')
  and not has_function_privilege('anon','nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(jsonb,jsonb)','EXECUTE')
  and has_function_privilege('service_role','nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(jsonb,jsonb)','EXECUTE'),
  'special qualification grants escaped service boundary'
 );
end;
$contract$;

do $positive$
declare p jsonb; a jsonb; q jsonb; q_flat jsonb; q_house jsonb; before_deals integer; before_documents integer; before_tasks integer; before_risks integer;
begin
 select count(*) into before_deals from public.nav_deals_v2;
 select count(*) into before_documents from public.nav_deal_documents_v2;
 select count(*) into before_tasks from public.nav_deal_tasks_v2;
 select count(*) into before_risks from public.nav_deal_risks_v2;

 p:=harness.special_legal_problem();
 a:=nav_v2_private.nav_v2_prepare_intake_save_v1(p);
 q:=nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(a,harness.special_owner_context());
 perform harness.assert_true((q->'qualified_rule_ids') @> '["legal_problem"]'::jsonb,'legal_problem did not qualify');
 perform harness.assert_true(a#>>'{legal_passport,handoff_completeness,state}'='urgent_incomplete','legal_problem did not preserve urgent incomplete handoff');
 perform harness.assert_true(exists(select 1 from jsonb_array_elements(a#>'{work_plan,task_candidates}') t where t->>'rule_id'='legal_problem' and t->>'evidence'='structured_legal_decision'),'legal_problem task evidence changed');
 perform harness.assert_true(not exists(select 1 from jsonb_array_elements(a#>'{work_plan,document_candidates}') d where coalesce(d->'rule_ids','[]'::jsonb) @> '["legal_problem"]'::jsonb),'legal_problem created a required document');

 p:=harness.special_partner_agency();
 a:=nav_v2_private.nav_v2_prepare_intake_save_v1(p);
 q:=nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(a,harness.special_owner_context());
 perform harness.assert_true((q->'qualified_rule_ids') @> '["partner_agency"]'::jsonb,'partner_agency did not qualify');
 perform harness.assert_true(exists(select 1 from jsonb_array_elements(a#>'{work_plan,document_candidates}') d where d->>'type'='partner_responsibility_note' and d->>'side'='deal' and d->>'owner_role'='lead_spn'),'partner responsibility document scope changed');

 p:=harness.special_flat_ground();
 a:=nav_v2_private.nav_v2_prepare_intake_save_v1(p);
 q:=nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(a,harness.special_owner_context());
 perform harness.assert_true((q->'qualified_rule_ids') @> '["flat_ground"]'::jsonb,'flat_ground did not qualify');
 perform harness.assert_true((select count(*) from jsonb_array_elements(a#>'{work_plan,document_candidates}') d where d->>'type' in ('land_status','object_title_basis') and d->>'side'='object' and d->>'owner_role'='lead_spn')=2,'flat_ground object document scope changed');

 p:=harness.special_house_land();
 a:=nav_v2_private.nav_v2_prepare_intake_save_v1(p);
 q:=nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(a,harness.special_owner_context());
 perform harness.assert_true((q->'qualified_rule_ids') @> '["house_land"]'::jsonb,'house_land did not qualify');
 perform harness.assert_true((select count(*) from jsonb_array_elements(a#>'{work_plan,document_candidates}') d where d->>'type' in ('house_title_basis','land_title_basis','boundary_status') and d->>'side'='object' and d->>'owner_role'='lead_spn')=3,'house_land object document scope changed');

 a:=nav_v2_private.nav_v2_prepare_intake_save_v1(harness.special_composite('flat_ground'));
 q_flat:=nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(a,harness.special_owner_context());
 perform harness.assert_true(jsonb_array_length(q_flat->'qualified_rule_ids')=3,'flat composite did not qualify three compatible rules');
 perform harness.assert_true((q_flat->'qualified_rule_ids') @> '["legal_problem","partner_agency","flat_ground"]'::jsonb,'flat composite coverage changed');

 a:=nav_v2_private.nav_v2_prepare_intake_save_v1(harness.special_composite('house_land'));
 q_house:=nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(a,harness.special_owner_context());
 perform harness.assert_true(jsonb_array_length(q_house->'qualified_rule_ids')=3,'house composite did not qualify three compatible rules');
 perform harness.assert_true((q_house->'qualified_rule_ids') @> '["legal_problem","partner_agency","house_land"]'::jsonb,'house composite coverage changed');
 perform harness.assert_true(((q_flat->'qualified_rule_ids') || (q_house->'qualified_rule_ids')) @> '["legal_problem","partner_agency","flat_ground","house_land"]'::jsonb,'composite union does not cover all special rules');

 perform harness.assert_true((q->>'base_effective_supported_count')::integer=21,'special qualification changed supported baseline');
 perform harness.assert_true((q->>'base_effective_unsupported_inventory')::integer=4,'special qualification changed unsupported baseline');
 perform harness.assert_true((q->>'changes_supported_inventory')::boolean is false,'special qualification promoted support');
 perform harness.assert_true((q->>'production_ready')::boolean is false,'special qualification claims production readiness');
 perform harness.assert_true((q->>'writes_performed')::boolean is false,'special qualification claims writes');
 perform harness.assert_true((select count(*) from public.nav_deals_v2)=before_deals,'special qualification changed deal rows');
 perform harness.assert_true((select count(*) from public.nav_deal_documents_v2)=before_documents,'special qualification changed document rows');
 perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2)=before_tasks,'special qualification changed task rows');
 perform harness.assert_true((select count(*) from public.nav_deal_risks_v2)=before_risks,'special qualification changed risk rows');
end;
$positive$;

do $negative$
declare p jsonb; a jsonb; q jsonb; failed boolean;
begin
 p:=harness.special_legal_problem(); a:=nav_v2_private.nav_v2_prepare_intake_save_v1(p);
 a:=jsonb_set(a,'{prepared_payload,deal,intake_draft,stage}','"object_chosen"'::jsonb,true);
 q:=nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(a,harness.special_owner_context());
 perform harness.assert_true(not (q->'qualified_rule_ids' @> '["legal_problem"]'::jsonb),'legal_problem with tampered stage qualified');

 a:=nav_v2_private.nav_v2_prepare_intake_save_v1(harness.special_legal_problem());
 a:=jsonb_set(a,'{work_plan,document_candidates}',jsonb_build_array(jsonb_build_object('type','unexpected','rule_ids','["legal_problem"]'::jsonb)),true);
 q:=nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(a,harness.special_owner_context());
 perform harness.assert_true(not (q->'qualified_rule_ids' @> '["legal_problem"]'::jsonb),'legal_problem with unexpected document qualified');

 p:=jsonb_set(harness.special_partner_agency(),'{deal,intake_draft,documents}','[]'::jsonb,true);
 a:=nav_v2_private.nav_v2_prepare_intake_save_v1(p);
 q:=nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(a,harness.special_owner_context());
 perform harness.assert_true(not (q->'qualified_rule_ids' @> '["partner_agency"]'::jsonb),'partner_agency without document status qualified');

 a:=nav_v2_private.nav_v2_prepare_intake_save_v1(harness.special_flat_ground());
 a:=jsonb_set(a,'{work_plan,document_candidates,0,side}','"buyer"'::jsonb,true);
 q:=nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(a,harness.special_owner_context());
 perform harness.assert_true(not (q->'qualified_rule_ids' @> '["flat_ground"]'::jsonb),'flat_ground with tampered document side qualified');

 p:=harness.special_house_land();
 p:=jsonb_set(p,'{deal,intake_draft,documents}',(p#>'{deal,intake_draft,documents}') - 2,true);
 a:=nav_v2_private.nav_v2_prepare_intake_save_v1(p);
 q:=nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(a,harness.special_owner_context());
 perform harness.assert_true(not (q->'qualified_rule_ids' @> '["house_land"]'::jsonb),'house_land with missing document status qualified');

 a:=nav_v2_private.nav_v2_prepare_intake_save_v1(harness.special_partner_agency());
 q:=nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(a,'{}'::jsonb);
 perform harness.assert_true(not (q->'qualified_rule_ids' @> '["partner_agency"]'::jsonb),'special rule without lawyer owner qualified');

 a:=jsonb_set(a,'{work_plan,task_candidates}',(a#>'{work_plan,task_candidates}')||jsonb_build_array(jsonb_build_object('rule_id','partner_agency','owner_role','broker')),true);
 q:=nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(a,harness.special_owner_context());
 perform harness.assert_true(not (q->'qualified_rule_ids' @> '["partner_agency"]'::jsonb),'partner rule with broker leakage qualified');

 a:=jsonb_set(a,'{legal_passport,handoff_completeness,state}','"blocked"'::jsonb,true);
 q:=nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(a,harness.special_owner_context());
 perform harness.assert_true(not (q->'qualified_rule_ids' @> '["partner_agency"]'::jsonb),'blocked special handoff qualified');

 failed:=false;
 begin perform nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(a,harness.special_owner_context('not-a-uuid'));
 exception when sqlstate '22023' then failed:=true; end;
 perform harness.assert_true(failed,'invalid special lawyer UUID was accepted');
end;
$negative$;

select jsonb_build_object(
 'result','Navigator v2 special semantics qualification PostgreSQL 17 assertions passed',
 'base_effective_supported_count',21,'base_effective_unsupported_inventory',4,
 'candidate_rules',jsonb_build_array('legal_problem','partner_agency','flat_ground','house_land'),
 'writes_performed',false,'production_ready',false
) as evidence;
