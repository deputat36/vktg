import { taskActionRoutePreview } from './task-action-router-v2.js?v=20260716-01';
import { validateTaskEdgeAction } from '../../../supabase/functions/nav-v2-deal-api/task-action-contract-v2.js';

const EDGE_ACTION_BY_RPC = Object.freeze({
  nav_v2_update_task_status: 'legacy_update_task_status',
  nav_v2_start_bounded_task: 'bounded_task_start',
  nav_v2_complete_bounded_task: 'bounded_task_complete',
  nav_v2_set_bounded_task_active_outcome: 'bounded_task_active_outcome',
  nav_v2_propose_bounded_task_terminal_outcome: 'bounded_task_terminal_proposal',
  nav_v2_decide_bounded_task_terminal_outcome: 'bounded_task_terminal_decision'
});

function failed(stage, errors, route = null, extra = {}) {
  return {
    ok: false,
    stage,
    errors: Array.isArray(errors) ? errors : [String(errors || 'Неизвестная ошибка pipeline.')],
    route,
    edge_action: null,
    edge_payload: null,
    edge_validation: null,
    rpc_preview: null,
    parity: false,
    network_called: false,
    runtime_integrated: false,
    edge_deployed: false,
    transport_enabled: false,
    ...extra
  };
}

function compact(source = {}) {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined));
}

export function taskEdgeActionFromRpcName(rpcName) {
  return EDGE_ACTION_BY_RPC[String(rpcName || '')] || null;
}

export function taskEdgePayloadFromRpcPreview(task = {}, rpcPreview = {}) {
  const name = String(rpcPreview?.name || '');
  const args = rpcPreview?.args && typeof rpcPreview.args === 'object' ? rpcPreview.args : {};
  const contractVersion = Number(task?.task_contract_version);

  if (name === 'nav_v2_update_task_status') {
    return compact({
      task_id: args.p_task_id,
      status: args.p_status,
      task_contract_version: contractVersion === 2 ? 2 : undefined
    });
  }
  if (name === 'nav_v2_start_bounded_task') {
    return {
      task_id: args.p_task_id,
      client_request_id: args.p_client_request_id,
      task_contract_version: contractVersion
    };
  }
  if (name === 'nav_v2_complete_bounded_task') {
    return {
      task_id: args.p_task_id,
      evidence_reference_id: args.p_evidence_reference_id,
      client_request_id: args.p_client_request_id,
      task_contract_version: contractVersion
    };
  }
  if (name === 'nav_v2_set_bounded_task_active_outcome') {
    return {
      task_id: args.p_task_id,
      outcome_code: args.p_outcome_code,
      reason_code: args.p_reason_code,
      review_date: args.p_review_date,
      client_request_id: args.p_client_request_id,
      task_contract_version: contractVersion
    };
  }
  if (name === 'nav_v2_propose_bounded_task_terminal_outcome') {
    return {
      task_id: args.p_task_id,
      outcome_code: args.p_outcome_code,
      reason_code: args.p_reason_code,
      replacement_task_id: args.p_replacement_task_id,
      client_request_id: args.p_client_request_id,
      task_contract_version: contractVersion
    };
  }
  if (name === 'nav_v2_decide_bounded_task_terminal_outcome') {
    return {
      task_id: args.p_task_id,
      decision: args.p_decision,
      client_request_id: args.p_client_request_id,
      task_contract_version: contractVersion
    };
  }
  return null;
}

export function taskDbArgsFromEdgeValidation(rpcName, args = {}) {
  if (rpcName === 'nav_v2_update_task_status') {
    return { p_task_id: args.task_id, p_status: args.status };
  }
  if (rpcName === 'nav_v2_start_bounded_task') {
    return { p_task_id: args.task_id, p_client_request_id: args.client_request_id };
  }
  if (rpcName === 'nav_v2_complete_bounded_task') {
    return {
      p_task_id: args.task_id,
      p_evidence_reference_id: args.evidence_reference_id,
      p_client_request_id: args.client_request_id
    };
  }
  if (rpcName === 'nav_v2_set_bounded_task_active_outcome') {
    return {
      p_task_id: args.task_id,
      p_outcome_code: args.outcome_code,
      p_reason_code: args.reason_code,
      p_review_date: args.review_date,
      p_client_request_id: args.client_request_id
    };
  }
  if (rpcName === 'nav_v2_propose_bounded_task_terminal_outcome') {
    return {
      p_task_id: args.task_id,
      p_outcome_code: args.outcome_code,
      p_reason_code: args.reason_code,
      p_replacement_task_id: args.replacement_task_id ?? null,
      p_client_request_id: args.client_request_id
    };
  }
  if (rpcName === 'nav_v2_decide_bounded_task_terminal_outcome') {
    return {
      p_task_id: args.task_id,
      p_decision: args.decision,
      p_client_request_id: args.client_request_id
    };
  }
  return null;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function taskActionEdgePipelinePreview({
  task = {},
  action,
  input = {},
  edge_action_override = null,
  edge_payload_patch = null
} = {}) {
  const route = taskActionRoutePreview({ task, action, input });
  if (!route.ok || !route.rpc_preview) {
    return failed('frontend_router', route.errors || ['Frontend router отклонил действие.'], route);
  }

  const mappedAction = taskEdgeActionFromRpcName(route.rpc_preview.name);
  if (!mappedAction) {
    return failed('edge_mapping', ['RPC не имеет canonical Edge action mapping.'], route);
  }

  const basePayload = taskEdgePayloadFromRpcPreview(task, route.rpc_preview);
  if (!basePayload) {
    return failed('edge_mapping', ['Не удалось построить canonical Edge payload.'], route);
  }

  const edgeAction = edge_action_override || mappedAction;
  const patch = edge_payload_patch && typeof edge_payload_patch === 'object' && !Array.isArray(edge_payload_patch)
    ? edge_payload_patch
    : {};
  const edgePayload = { ...basePayload, ...patch };
  const validation = validateTaskEdgeAction(edgeAction, edgePayload);

  if (!validation.ok || !validation.rpc || !validation.args) {
    return failed('edge_validation', validation.errors, route, {
      edge_action: edgeAction,
      edge_payload: edgePayload,
      edge_validation: validation
    });
  }

  const validatedDbArgs = taskDbArgsFromEdgeValidation(validation.rpc, validation.args);
  if (!validatedDbArgs) {
    return failed('rpc_mapping', ['Validated RPC не имеет database args mapping.'], route, {
      edge_action: edgeAction,
      edge_payload: edgePayload,
      edge_validation: validation
    });
  }

  const rpcPreview = { name: validation.rpc, args: validatedDbArgs };
  const parity = validation.rpc === route.rpc_preview.name
    && sameJson(validatedDbArgs, route.rpc_preview.args);

  if (!parity) {
    return failed('rpc_parity', ['Frontend и Edge RPC preview не совпадают.'], route, {
      edge_action: edgeAction,
      edge_payload: edgePayload,
      edge_validation: validation,
      rpc_preview: rpcPreview
    });
  }

  return {
    ok: true,
    stage: 'validated_rpc_preview',
    errors: [],
    route,
    edge_action: edgeAction,
    edge_payload: edgePayload,
    edge_validation: validation,
    rpc_preview: rpcPreview,
    parity: true,
    network_called: false,
    runtime_integrated: false,
    edge_deployed: false,
    transport_enabled: false
  };
}

export const TASK_ACTION_EDGE_PIPELINE_CONTRACT = Object.freeze({
  edge_action_by_rpc: EDGE_ACTION_BY_RPC,
  one_action_one_validated_rpc_preview: true,
  network_called: false,
  runtime_integrated: false,
  edge_deployed: false,
  transport_enabled: false
});
