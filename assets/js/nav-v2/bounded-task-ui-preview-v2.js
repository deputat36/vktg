import {
  boundedTaskStartRpcPreview,
  boundedTaskCompleteRpcPreview,
  boundedTaskActiveOutcomeRpcPreview,
  boundedTaskTerminalProposalRpcPreview,
  boundedTaskTerminalDecisionRpcPreview
} from './bounded-task-server-adapter-v2.js?v=20260716-01';

const ROLE_LABELS = Object.freeze({spn:'СПН',lawyer:'Юрист',broker:'Ипотечный брокер',manager:'Менеджер',owner:'Owner'});
const ACTION_LABELS = Object.freeze({
  legacy_start:'В работу',legacy_done:'Готово',legacy_reopen:'Открыта',
  start:'Начать / возобновить',complete:'Завершить с evidence',
  waiting_external:'Ожидается извне',deferred:'Отложить',
  propose_not_applicable:'Не применимо',propose_replaced:'Заменено другой задачей',propose_cancelled:'Отменить процесс',
  decision_confirm:'Подтвердить исход',decision_reject:'Отклонить исход'
});

export const BOUNDED_TASK_UI_SAMPLES = Object.freeze([
  {id:'20000000-0000-4000-8000-000000000001',reference:'Legacy · запрос документов',task_contract_version:null,status:'open',priority:'high',assigned_role:'spn',due_date:'2026-07-18',legacy_allowed_roles:['spn','manager','owner']},
  {id:'20000000-0000-4000-8000-000000000002',reference:'Bounded · юридическое решение',task_contract_version:2,task_type:'legal_decision',status:'open',priority:'urgent',assigned_role:'lawyer',due_date:'2026-07-17',evidence_kind:'review_decision',completion_criterion_code:'legal_decision_recorded',gate_scope:'deposit',subject_kind:'review'},
  {id:'20000000-0000-4000-8000-000000000003',reference:'Bounded · запрос документа',task_contract_version:2,task_type:'document_request',status:'in_progress',priority:'high',assigned_role:'spn',due_date:'2026-07-23',evidence_kind:'document_status',completion_criterion_code:'document_received',gate_scope:'deposit',subject_kind:'document',outcome_code:'waiting_external',outcome_state:'confirmed',outcome_reason_code:'awaiting_document',outcome_review_date:'2026-07-23'},
  {id:'20000000-0000-4000-8000-000000000004',reference:'Bounded · согласование условий',task_contract_version:2,task_type:'term_approval',status:'in_progress',priority:'normal',assigned_role:'spn',due_date:'2026-07-20',evidence_kind:'agreement_status',completion_criterion_code:'terms_confirmed',gate_scope:'deposit',subject_kind:'deal',outcome_code:'not_applicable',outcome_state:'proposed',outcome_reason_code:'no_longer_required'},
  {id:'20000000-0000-4000-8000-000000000005',reference:'Bounded · финансовое решение',task_contract_version:2,task_type:'financial_decision',status:'open',priority:'normal',assigned_role:'broker',due_date:'2026-07-19',evidence_kind:'review_decision',completion_criterion_code:'financial_decision_recorded',gate_scope:'deal',subject_kind:'review'},
  {id:'20000000-0000-4000-8000-000000000006',reference:'Bounded · завершённая проверка',task_contract_version:2,task_type:'document_check',status:'done',priority:'normal',assigned_role:'lawyer',due_date:'2026-07-15',evidence_kind:'document_status',completion_criterion_code:'document_checked',gate_scope:'deal',subject_kind:'document',outcome_code:'completed',outcome_state:'confirmed'}
]);

function esc(value){return String(value??'').replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
function randomUuid(){if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();return '40000000-0000-4000-8000-'+Math.random().toString(16).slice(2,14).padEnd(12,'0');}
function addDays(days){const value=new Date();value.setDate(value.getDate()+days);return value.toISOString().slice(0,10);}
function canOperate(task,role){return task.assigned_role===role||['manager','owner'].includes(role);}
function canDecide(role){return ['manager','owner'].includes(role);}

export function boundedTaskUiModel(task={},role='spn'){
  const bounded=task.task_contract_version===2;
  if(!bounded){
    const allowed=(task.legacy_allowed_roles||[]).includes(role);
    const actions=[];
    if(allowed&&task.status==='open')actions.push('legacy_start','legacy_done');
    if(allowed&&task.status==='in_progress')actions.push('legacy_done','legacy_reopen');
    if(allowed&&task.status==='done')actions.push('legacy_reopen');
    return {mode:'legacy',actions,notice:'Legacy-задача использует старый status path до индивидуального review. Evidence-контракт отсутствует.'};
  }

  const active=['open','in_progress'].includes(task.status);
  const proposal=task.outcome_state==='proposed'&&['not_applicable','replaced','cancelled'].includes(task.outcome_code);
  if(proposal){
    return {mode:'bounded',actions:canDecide(role)?['decision_confirm','decision_reject']:[],notice:canDecide(role)?'Operational-действия заблокированы. Требуется решение по terminal outcome.':'Ожидается решение manager/owner по предложенному исходу.'};
  }
  if(task.status==='done')return {mode:'bounded',actions:[],notice:'Задача завершена с evidence. Reopen запрещён; новое действие создаётся отдельной audited задачей.'};
  if(task.status==='cancelled')return {mode:'bounded',actions:[],notice:'Задача закрыта подтверждённым terminal outcome.'};
  if(!active||!canOperate(task,role))return {mode:'bounded',actions:[],notice:'Для выбранной роли operational-действия недоступны.'};

  const actions=['start','complete','waiting_external','deferred','propose_not_applicable','propose_replaced','propose_cancelled'];
  return {mode:'bounded',actions,notice:task.outcome_code==='waiting_external'||task.outcome_code==='deferred'?'Задача остаётся активной до review date. «Начать / возобновить» очищает active outcome и возвращает SLA.':'Bounded-задача требует evidence или управляемый исход.'};
}

export function boundedTaskUiRpcPreview(task,action,input={}){
  const client_request_id=input.client_request_id||randomUuid();
  if(action.startsWith('legacy_')){
    const status={legacy_start:'in_progress',legacy_done:'done',legacy_reopen:'open'}[action];
    return {ok:Boolean(status),errors:status?[]:['Неизвестное legacy-действие.'],transport_enabled:false,rpc_preview:status?{name:'nav_v2_update_task_status',args:{p_task_id:task.id,p_status:status}}:null,persistence:{legacy_status_path:true,automatic_backlog_created:false}};
  }
  if(action==='start')return boundedTaskStartRpcPreview({task_id:task.id,client_request_id});
  if(action==='complete')return boundedTaskCompleteRpcPreview({task_id:task.id,evidence_reference_id:input.evidence_reference_id,client_request_id});
  if(action==='waiting_external')return boundedTaskActiveOutcomeRpcPreview({task_id:task.id,outcome_code:'waiting_external',reason_code:input.reason_code||'awaiting_document',review_date:input.review_date||addDays(7),client_request_id});
  if(action==='deferred')return boundedTaskActiveOutcomeRpcPreview({task_id:task.id,outcome_code:'deferred',reason_code:input.reason_code||'postponed_by_client',review_date:input.review_date||addDays(14),client_request_id});
  if(action==='propose_not_applicable')return boundedTaskTerminalProposalRpcPreview({task_id:task.id,outcome_code:'not_applicable',reason_code:input.reason_code||'no_longer_required',replacement_task_id:null,client_request_id});
  if(action==='propose_replaced')return boundedTaskTerminalProposalRpcPreview({task_id:task.id,outcome_code:'replaced',reason_code:input.reason_code||'replaced_by_specific_task',replacement_task_id:input.replacement_task_id,client_request_id});
  if(action==='propose_cancelled')return boundedTaskTerminalProposalRpcPreview({task_id:task.id,outcome_code:'cancelled',reason_code:input.reason_code||'process_cancelled',replacement_task_id:null,client_request_id});
  if(action==='decision_confirm'||action==='decision_reject')return boundedTaskTerminalDecisionRpcPreview({task_id:task.id,decision:action==='decision_confirm'?'confirm':'reject',client_request_id});
  return {ok:false,errors:['Неизвестное действие.'],transport_enabled:false,rpc_preview:null};
}

export function boundedTaskUiFields(action){
  if(action==='complete')return [{name:'evidence_reference_id',label:'UUID evidence',type:'text',value:'50000000-0000-4000-8000-000000000001'}];
  if(action==='waiting_external')return [{name:'reason_code',label:'Причина ожидания',type:'select',value:'awaiting_document',options:['awaiting_document','awaiting_counterparty','awaiting_bank']},{name:'review_date',label:'Дата пересмотра',type:'date',value:addDays(7)}];
  if(action==='deferred')return [{name:'reason_code',label:'Причина отсрочки',type:'select',value:'postponed_by_client',options:['postponed_by_client','route_changed']},{name:'review_date',label:'Дата пересмотра',type:'date',value:addDays(14)}];
  if(action==='propose_replaced')return [{name:'replacement_task_id',label:'UUID замещающей задачи',type:'text',value:'20000000-0000-4000-8000-000000000099'}];
  return [];
}

function badgeClass(task){if(task.task_contract_version!==2)return 'legacy';if(task.status==='done')return 'done';if(task.outcome_code==='waiting_external'||task.outcome_code==='deferred'||task.outcome_state==='proposed')return 'wait';return 'bounded';}
function fieldHtml(field){if(field.type==='select')return `<div class="bounded-task-preview-field"><label for="preview_${esc(field.name)}">${esc(field.label)}</label><select id="preview_${esc(field.name)}" name="${esc(field.name)}">${field.options.map(option=>`<option value="${esc(option)}"${option===field.value?' selected':''}>${esc(option)}</option>`).join('')}</select></div>`;return `<div class="bounded-task-preview-field"><label for="preview_${esc(field.name)}">${esc(field.label)}</label><input id="preview_${esc(field.name)}" name="${esc(field.name)}" type="${esc(field.type)}" value="${esc(field.value)}"></div>`;}

function renderTasks(role){
  const target=document.getElementById('boundedTaskPreviewList');
  target.innerHTML=BOUNDED_TASK_UI_SAMPLES.map(task=>{
    const model=boundedTaskUiModel(task,role);
    const actions=model.actions.map(action=>`<button class="btn ${action.includes('cancelled')?'danger':action.includes('propose')||action.includes('deferred')?'warning':'secondary'}" type="button" data-task-id="${esc(task.id)}" data-action-id="${esc(action)}">${esc(ACTION_LABELS[action])}</button>`).join('');
    return `<article class="card bounded-task-preview-card" data-preview-task="${esc(task.id)}"><header><div><span class="bounded-task-preview-badge ${badgeClass(task)}">${model.mode==='legacy'?'Legacy':'Bounded v2'}</span><h2>${esc(task.reference)}</h2></div><span class="bounded-task-preview-badge">${esc(task.status)}</span></header><div class="bounded-task-preview-meta"><span class="bounded-task-preview-badge">Роль: ${esc(ROLE_LABELS[task.assigned_role]||task.assigned_role)}</span><span class="bounded-task-preview-badge">Приоритет: ${esc(task.priority)}</span>${task.outcome_code?`<span class="bounded-task-preview-badge wait">Исход: ${esc(task.outcome_code)} / ${esc(task.outcome_state)}</span>`:''}</div><div class="bounded-task-preview-facts"><div class="bounded-task-preview-fact"><b>Evidence</b>${esc(task.evidence_kind||'Не определено')}</div><div class="bounded-task-preview-fact"><b>Критерий</b>${esc(task.completion_criterion_code||'Legacy status')}</div><div class="bounded-task-preview-fact"><b>Gate / срок</b>${esc(task.gate_scope||'—')} · ${esc(task.due_date||'—')}</div></div><div class="bounded-task-preview-notice">${esc(model.notice)}</div><div class="bounded-task-preview-actions">${actions||'<span>Доступных действий нет.</span>'}</div></article>`;
  }).join('');
}

function inspector(task,action){
  const fields=boundedTaskUiFields(action);
  const target=document.getElementById('boundedTaskPreviewInspector');
  target.innerHTML=`<h2>${esc(ACTION_LABELS[action]||action)}</h2><div class="bounded-task-preview-status">${esc(task.reference)} · данные никуда не отправляются.</div><form id="boundedTaskPreviewForm" class="bounded-task-preview-form"><input type="hidden" name="client_request_id" value="${esc(randomUuid())}">${fields.map(fieldHtml).join('')}<div class="bounded-task-preview-field"><label for="preview_client_request_id">client_request_id</label><input id="preview_client_request_id" name="client_request_id_visible" type="text" value="" readonly></div></form><pre id="boundedTaskPreviewOutput" class="bounded-task-preview-output"></pre><div class="bounded-task-preview-disclaimer">Это RPC preview. Transport, Supabase mutation и изменение synthetic task отключены.</div>`;
  const form=target.querySelector('#boundedTaskPreviewForm');
  const hidden=form.elements.client_request_id;
  form.elements.client_request_id_visible.value=hidden.value;
  const update=()=>{
    const data=Object.fromEntries(new FormData(form).entries());
    data.client_request_id=hidden.value;
    const preview=boundedTaskUiRpcPreview(task,action,data);
    target.querySelector('#boundedTaskPreviewOutput').textContent=JSON.stringify(preview,null,2);
    target.querySelector('.bounded-task-preview-status').className=`bounded-task-preview-status${preview.ok?'':' error'}`;
  };
  form.addEventListener('input',update);
  form.addEventListener('change',update);
  update();
}

function init(){
  const roleSelect=document.getElementById('boundedTaskPreviewRole');
  if(!roleSelect)return;
  renderTasks(roleSelect.value);
  roleSelect.addEventListener('change',()=>{renderTasks(roleSelect.value);document.getElementById('boundedTaskPreviewInspector').innerHTML='<h2>RPC preview</h2><p>Выберите доступное действие для новой роли.</p>';});
  document.getElementById('boundedTaskPreviewList').addEventListener('click',(event)=>{
    const button=event.target.closest('[data-action-id]');
    if(!button)return;
    const task=BOUNDED_TASK_UI_SAMPLES.find(item=>item.id===button.dataset.taskId);
    if(task)inspector(task,button.dataset.actionId);
  });
}

if(typeof document!=='undefined')init();
