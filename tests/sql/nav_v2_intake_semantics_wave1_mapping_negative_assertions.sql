\set ON_ERROR_STOP on

do $negative$
declare p jsonb; failed boolean;
begin
 p:=harness.rule_plan('bankruptcy_risk','lawyer','yellow','seller');
 p:=jsonb_set(p,'{unsupported_rule_ids}','["bankruptcy_risk"]'::jsonb,true);
 failed:=false;
 begin perform nav_v2_private.nav_v2_map_governed_intake_to_production_wave1_v1(p); exception when sqlstate '22023' then failed:=true; end;
 perform harness.assert_true(failed,'remaining unsupported rule did not fail closed');

 p:=harness.wave1_mapping_plan('spouse');
 p:=p-'wave1_qualification';
 failed:=false;
 begin perform nav_v2_private.nav_v2_map_governed_intake_to_production_wave1_v1(p); exception when sqlstate '22023' then failed:=true; end;
 perform harness.assert_true(failed,'wave1 rule without qualification evidence was accepted');

 p:=harness.wave1_mapping_plan('encumbrance');
 p:=jsonb_set(p,'{risks,0,level}','"yellow"'::jsonb,true);
 failed:=false;
 begin perform nav_v2_private.nav_v2_map_governed_intake_to_production_wave1_v1(p); exception when sqlstate '22023' then failed:=true; end;
 perform harness.assert_true(failed,'tampered encumbrance risk was accepted');

 p:=harness.wave1_mapping_plan('spouse');
 p:=jsonb_set(p,'{participants,0,user_id}','"63000000-0000-4000-8000-999999999999"'::jsonb,true);
 failed:=false;
 begin perform harness.write_mapping_wave1('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',p); exception when foreign_key_violation then failed:=true; end;
 perform harness.assert_true(failed,'invalid wave1 participant did not hit production FK');
 perform harness.assert_true(not exists(select 1 from public.nav_deals_v2 where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'failed wave1 write was not atomic');
end;
$negative$;

select 'Navigator v2 intake semantics wave1 exact-schema negative assertions passed' as result;
