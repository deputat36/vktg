import { validateTaskEdgeAction } from './task-action-contract-v2.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_CLIENT_ACTOR_FIELDS = new Set(['actor_id', 'p_actor_id', 'user_id', 'p_user_id']);
const TOP_LEVEL_FIELDS = new Set(['action', 'payload']);

const BOUNDED_ACTIONS = new Set([
  'bounded_task_start',
  'bounded_task_complete',
  'bounded_task_active_outcome',
  'bounded_task_terminal_proposal',
  'bounded_task_terminal_decision'
]);

function failed(stage, errors, extra = {}) {
  return {
    ok: false,
    stage,
    errors: Array.isArray(errors) ? errors : [String(errors || 'Неизвестная ошибка identity gate.')],
    rpc: null,
    rpc_args: null,
    verified_actor_id: null,
    mock_rpc_called: false,
    mock_rpc_call_count: 0,
    network_called: false,
    runtime_integrated: false,
    edge_deployed: false,
    transport_enabled: false,
    target_sql_signature_ready: true,
    actor_aware_sql_prototype_ready: true,
    actor_aware_sql_deployed: false,
    ...extra
  };
}

function cleanUuid(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return UUID_RE.test(normalized) ? normalized : null;
}

function taskDbArgs(rpcName, args = {}) {
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

function containsForbiddenActorField(payload = {}) {
  return Object.keys(payload).find((key) => FORBIDDEN_CLIENT_ACTOR_FIELDS.has(key)) || null;
}

export async function rehearseTaskEdgeIdentityAction({
  request_body = {},
  verified_actor_id,
  rpc_client = null,
  mode = 'preview'
} = {}) {
  const body = request_body && typeof request_body === 'object' && !Array.isArray(request_body)
    ? request_body
    : {};
  const unknownTopLevel = Object.keys(body).filter((key) => !TOP_LEVEL_FIELDS.has(key));
  if (unknownTopLevel.length) {
    return failed('request_shape', [`Неизвестные поля запроса: ${unknownTopLevel.join(', ')}.`]);
  }

  const action = typeof body.action === 'string' ? body.action.trim() : '';
  if (!BOUNDED_ACTIONS.has(action)) {
    return failed('action_scope', ['Identity gate разрешён только для governed bounded actions.']);
  }

  const payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
    ? body.payload
    : {};
  const forbiddenActorField = containsForbiddenActorField(payload);
  if (forbiddenActorField) {
    return failed('actor_trust_boundary', [`Поле ${forbiddenActorField} запрещено в клиентском payload.`]);
  }

  const actorId = cleanUuid(verified_actor_id);
  if (!actorId) {
    return failed('verified_identity', ['verified_actor_id должен быть UUID, полученным после проверки bearer token.']);
  }

  const validation = validateTaskEdgeAction(action, payload);
  if (!validation.ok || !validation.rpc || !validation.args) {
    return failed('payload_validation', validation.errors, { validation });
  }

  const baseArgs = taskDbArgs(validation.rpc, validation.args);
  if (!baseArgs) {
    return failed('rpc_mapping', ['Governed RPC не имеет actor-aware database mapping.'], { validation });
  }

  const rpcArgs = { ...baseArgs, p_actor_id: actorId };
  const preview = {
    ok: true,
    stage: mode === 'mock_execute' ? 'mock_rpc_executed' : 'actor_aware_rpc_preview',
    errors: [],
    action,
    rpc: validation.rpc,
    rpc_args: rpcArgs,
    verified_actor_id: actorId,
    validation,
    mock_rpc_called: false,
    mock_rpc_call_count: 0,
    mock_result: null,
    network_called: false,
    runtime_integrated: false,
    edge_deployed: false,
    transport_enabled: false,
    target_sql_signature_ready: true,
    actor_aware_sql_prototype_ready: true,
    actor_aware_sql_deployed: false,
    canonical_sql_refactor_required: false
  };

  if (mode !== 'mock_execute') return preview;
  if (!rpc_client || typeof rpc_client.rpc !== 'function') {
    return failed('mock_transport', ['Для mock_execute требуется rpc_client.rpc.'], {
      action,
      verified_actor_id: actorId,
      validation,
      rpc_preview: { name: validation.rpc, args: rpcArgs }
    });
  }

  const result = await rpc_client.rpc(validation.rpc, rpcArgs);
  return {
    ...preview,
    mock_rpc_called: true,
    mock_rpc_call_count: 1,
    mock_result: result
  };
}

export const TASK_EDGE_IDENTITY_REHEARSAL_CONTRACT = Object.freeze({
  bounded_actions: BOUNDED_ACTIONS,
  forbidden_client_actor_fields: FORBIDDEN_CLIENT_ACTOR_FIELDS,
  verified_actor_source: 'successful auth user lookup from bearer token',
  database_actor_argument: 'p_actor_id',
  exact_mock_rpc_calls: 1,
  network_called: false,
  runtime_integrated: false,
  edge_deployed: false,
  transport_enabled: false,
  target_sql_signature_ready: true,
  actor_aware_sql_prototype_ready: true,
  actor_aware_sql_deployed: false
});
