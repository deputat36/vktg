import {
  boundedTaskStartRpcPreview,
  boundedTaskCompleteRpcPreview,
  boundedTaskActiveOutcomeRpcPreview,
  boundedTaskTerminalProposalRpcPreview,
  boundedTaskTerminalDecisionRpcPreview
} from './bounded-task-server-adapter-v2.js?v=20260716-01';

const LEGACY_STATUS = Object.freeze({
  start: 'in_progress',
  complete: 'done',
  reopen: 'open'
});

const PERMISSION_BY_ACTION = Object.freeze({
  start: 'can_start',
  complete: 'can_complete',
  waiting_external: 'can_set_active_outcome',
  deferred: 'can_set_active_outcome',
  propose_not_applicable: 'can_propose_terminal_outcome',
  propose_replaced: 'can_propose_terminal_outcome',
  propose_cancelled: 'can_propose_terminal_outcome',
  decision_confirm: 'can_decide_terminal_outcome',
  decision_reject: 'can_decide_terminal_outcome'
});

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function failed(message, mode = 'unknown') {
  return {
    ok: false,
    errors: [message],
    mode,
    rpc_preview: null,
    transport_enabled: false,
    runtime_integrated: false,
    authoritative_handler_candidate: true,
    duplicate_handler_allowed: false
  };
}

function withRouteMetadata(preview, mode, action) {
  return {
    ...preview,
    mode,
    action,
    transport_enabled: false,
    runtime_integrated: false,
    authoritative_handler_candidate: true,
    duplicate_handler_allowed: false
  };
}

export function taskActionControlModel(task = {}) {
  const bounded = Number(task.task_contract_version) === 2;
  if (!bounded) {
    return {
      mode: 'legacy',
      actions: task.can_change_status === true
        ? ['start', 'complete', 'reopen']
        : [],
      completion_requires_evidence: false,
      reopen_semantics: 'legacy_status_path',
      transport_enabled: false
    };
  }

  const actions = Object.entries(PERMISSION_BY_ACTION)
    .filter(([, permission]) => task[permission] === true)
    .map(([action]) => action);

  return {
    mode: 'bounded',
    actions,
    completion_requires_evidence: true,
    reopen_semantics: 'immutable_create_new_audited_task',
    transport_enabled: false
  };
}

export function taskActionRoutePreview({ task = {}, action, input = {} } = {}) {
  const taskId = clean(task.id);
  const selectedAction = clean(action);
  if (!taskId) return failed('У задачи отсутствует id.');

  const bounded = Number(task.task_contract_version) === 2;

  if (!bounded) {
    const status = LEGACY_STATUS[selectedAction];
    if (!status) {
      return failed('Legacy-задача поддерживает только start, complete или reopen.', 'legacy');
    }
    if (task.can_change_status !== true) {
      return failed('Нет права менять статус legacy-задачи.', 'legacy');
    }
    return withRouteMetadata({
      ok: true,
      errors: [],
      normalized: { task_id: taskId, status },
      rpc_preview: {
        name: 'nav_v2_update_task_status',
        args: { p_task_id: taskId, p_status: status }
      },
      persistence: {
        legacy_status_path: true,
        evidence_contract_applied: false,
        automatic_backlog_created: false
      }
    }, 'legacy', selectedAction);
  }

  if (selectedAction === 'reopen') {
    return failed(
      'Завершённая bounded-задача неизменяема. Создайте новую audited-задачу.',
      'bounded'
    );
  }

  const permission = PERMISSION_BY_ACTION[selectedAction];
  if (!permission) return failed('Неизвестное bounded-действие.', 'bounded');
  if (task[permission] !== true) {
    return failed(`Нет разрешения ${permission} для bounded-задачи.`, 'bounded');
  }

  const clientRequestId = input.client_request_id;
  let preview;

  if (selectedAction === 'start') {
    preview = boundedTaskStartRpcPreview({
      task_id: taskId,
      client_request_id: clientRequestId
    });
  } else if (selectedAction === 'complete') {
    preview = boundedTaskCompleteRpcPreview({
      task_id: taskId,
      evidence_reference_id: input.evidence_reference_id,
      client_request_id: clientRequestId
    });
  } else if (selectedAction === 'waiting_external' || selectedAction === 'deferred') {
    preview = boundedTaskActiveOutcomeRpcPreview({
      task_id: taskId,
      outcome_code: selectedAction,
      reason_code: input.reason_code,
      review_date: input.review_date,
      client_request_id: clientRequestId
    });
  } else if (selectedAction.startsWith('propose_')) {
    const outcomeCode = selectedAction.replace('propose_', '');
    preview = boundedTaskTerminalProposalRpcPreview({
      task_id: taskId,
      outcome_code: outcomeCode,
      reason_code: input.reason_code,
      replacement_task_id: input.replacement_task_id,
      client_request_id: clientRequestId
    });
  } else {
    preview = boundedTaskTerminalDecisionRpcPreview({
      task_id: taskId,
      decision: selectedAction === 'decision_confirm' ? 'confirm' : 'reject',
      client_request_id: clientRequestId
    });
  }

  return withRouteMetadata(preview, 'bounded', selectedAction);
}

export const TASK_ACTION_DUAL_PATH_CONTRACT = Object.freeze({
  legacy_rpc: 'nav_v2_update_task_status',
  bounded_rpcs: Object.freeze([
    'nav_v2_start_bounded_task',
    'nav_v2_complete_bounded_task',
    'nav_v2_set_bounded_task_active_outcome',
    'nav_v2_propose_bounded_task_terminal_outcome',
    'nav_v2_decide_bounded_task_terminal_outcome'
  ]),
  bounded_reopen: 'immutable_create_new_audited_task',
  runtime_integrated: false,
  transport_enabled: false
});
