\set ON_ERROR_STOP on

do $negative$
declare p jsonb; failed boolean;
begin
 p:=harness.rule_plan('legal_problem','lawyer','red',null);
 p:=jsonb_set(p,'{unsupported_rule_ids}','["legal_problem"]'::jsonb,true);
 failed:=false;
 begin perform nav_v2_private.nav_v2_map_governed_intake_to_production_wave2_v1(p); exception when sqlstate '22023' then failed:=true; end;
 perform harness.assert_true(failed,'remaining special rule did not fail closed');

 p:=harness.wave2_mapping_plan('bankruptcy_risk');
 p:=p-'wave2_qualification';
 failed:=false;
 begin perform nav_v2_private.nav_v2_map_governed_intake_to_production_wave2_v1(p); exception when sqlstate '22023' then failed:=true; end;
 perform harness.assert_true(failed,'wave2 rule without qualification evidence was accepted');

 p:=harness.wave2_mapping_plan('certificate');
 p:=jsonb_set(p,'{risks,0,level}','"red"'::jsonb,true);
 failed:=false;
 begin perform nav_v2_private.nav_v2_map_governed_intake_to_production_wave2_v1(p); exception when sqlstate '22023' then failed:=true; end;
 perform harness.assert_true(failed,'tampered certificate risk was accepted');

 p:=harness.wave2_mapping_plan('after_registration');
 p:=jsonb_set(p,'{documents,0,side}','"buyer"'::jsonb,true);
 failed:=false;
 begin perform nav_v2_private.nav_v2_map_governed_intake_to_production_wave2_v1(p); exception when sqlstate '22023' then failed:=true; end;
 perform harness.assert_true(failed,'tampered settlement document side was accepted');

 p:=harness.wave2_mapping_plan('bankruptcy_risk');
 p:=jsonb_set(p,'{participants,0,user_id}','"63000000-0000-4000-8000-999999999999"'::jsonb,true);
 failed:=false;
 begin perform harness.write_mapping_wave2('cccccccc-cccc-4ccc-8ccc-cccccccccccc',p); exception when foreign_key_violation then failed:=true; end;
 perform harness.assert_true(failed,'invalid wave2 participant did not hit production FK');
 perform harness.assert_true(not exists(select 1 from public.nav_deals_v2 where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'),'failed wave2 write was not atomic');
end;
$negative$;

select 'Navigator v2 intake semantics wave2 exact-schema negative assertions passed' as result;
