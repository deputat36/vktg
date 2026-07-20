\set ON_ERROR_STOP on

do $negative$
declare p jsonb; failed boolean;
begin
 p:=harness.special_mapping_plan('legal_problem');
 p:=p-'special_qualification';
 failed:=false;
 begin perform nav_v2_private.nav_v2_map_governed_intake_to_production_special_v1(p); exception when sqlstate '22023' then failed:=true; end;
 perform harness.assert_true(failed,'special rule without qualification evidence was accepted');

 p:=harness.special_mapping_plan('legal_problem');
 p:=jsonb_set(p,'{documents}',jsonb_build_array(jsonb_build_object(
  'type','unexpected','title','Unexpected','side','deal','status','requested',
  'owner_id','63000000-0000-4000-8000-000000000001','rule_ids','["legal_problem"]'::jsonb,
  'gate_impact',jsonb_build_object('blocks_deposit',true,'blocks_deal',false)
 )),true);
 failed:=false;
 begin perform nav_v2_private.nav_v2_map_governed_intake_to_production_special_v1(p); exception when sqlstate '22023' then failed:=true; end;
 perform harness.assert_true(failed,'legal_problem unexpected document was accepted');

 p:=harness.special_mapping_plan('partner_agency');
 p:=jsonb_set(p,'{risks,0,level}','"red"'::jsonb,true);
 failed:=false;
 begin perform nav_v2_private.nav_v2_map_governed_intake_to_production_special_v1(p); exception when sqlstate '22023' then failed:=true; end;
 perform harness.assert_true(failed,'tampered partner risk was accepted');

 p:=harness.special_mapping_plan('flat_ground');
 p:=jsonb_set(p,'{documents,0,side}','"buyer"'::jsonb,true);
 failed:=false;
 begin perform nav_v2_private.nav_v2_map_governed_intake_to_production_special_v1(p); exception when sqlstate '22023' then failed:=true; end;
 perform harness.assert_true(failed,'tampered flat document side was accepted');

 p:=harness.special_mapping_plan('house_land');
 p:=jsonb_set(p,'{participants,0,user_id}','"63000000-0000-4000-8000-999999999999"'::jsonb,true);
 failed:=false;
 begin perform harness.write_mapping_special('dddddddd-dddd-4ddd-8ddd-dddddddddddd',p); exception when foreign_key_violation then failed:=true; end;
 perform harness.assert_true(failed,'invalid special participant did not hit production FK');
 perform harness.assert_true(not exists(select 1 from public.nav_deals_v2 where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'),'failed special write was not atomic');
end;
$negative$;

select 'Navigator v2 final special semantics exact-schema negative assertions passed' as result;
