import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BOUNDED_TASK_UI_SAMPLES,
  boundedTaskUiModel,
  boundedTaskUiRpcPreview,
  boundedTaskUiFields
} from '../assets/js/nav-v2/bounded-task-ui-preview-v2.js';

const fixture=JSON.parse(fs.readFileSync(new URL('../fixtures/nav-v2-bounded-task-ui-preview-scenarios.json',import.meta.url),'utf8'));

for(const scenario of fixture.action_cases){
  const task=BOUNDED_TASK_UI_SAMPLES.find(item=>item.id===scenario.task);
  assert.ok(task,`${scenario.id}: task missing`);
  const model=boundedTaskUiModel(task,scenario.role);
  assert.deepEqual(model.actions,scenario.expected,`${scenario.id}: actions mismatch`);
}

for(const scenario of fixture.rpc_cases){
  const task=BOUNDED_TASK_UI_SAMPLES.find(item=>item.id===scenario.task);
  const preview=boundedTaskUiRpcPreview(task,scenario.action,scenario.input);
  assert.equal(preview.ok,scenario.valid,`${scenario.id}: validity mismatch`);
  assert.equal(preview.transport_enabled,false);
  if(scenario.valid)assert.equal(preview.rpc_preview.name,scenario.rpc);
  else assert.equal(preview.rpc_preview,null);
}

const complete_missing_evidence=fixture.rpc_cases.find(scenario=>scenario.id==='complete_missing_evidence');
assert.ok(complete_missing_evidence,'complete_missing_evidence scenario is required');
assert.equal(
  boundedTaskUiRpcPreview(
    BOUNDED_TASK_UI_SAMPLES.find(item=>item.id===complete_missing_evidence.task),
    complete_missing_evidence.action,
    complete_missing_evidence.input
  ).ok,
  false
);

assert.equal(boundedTaskUiFields('complete')[0].name,'evidence_reference_id');
assert.deepEqual(boundedTaskUiFields('waiting_external').map(field=>field.name),['reason_code','review_date']);
assert.equal(boundedTaskUiModel(BOUNDED_TASK_UI_SAMPLES[5],'manager').notice.includes('Reopen запрещён'),true);

console.log('Navigator v2 bounded task UI preview regression passed: role-aware actions, evidence forms, active waits, terminal decisions and transport-free RPC previews');
