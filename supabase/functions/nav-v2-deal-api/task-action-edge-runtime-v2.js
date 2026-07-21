import { rehearseTaskEdgeIdentityAction } from './task-action-edge-identity-v2.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_ROLES = new Set(['owner', 'admin', 'manager', 'spn', 'lawyer', 'broker', 'viewer']);
const SUPERVISOR_ROLES = new Set(['owner', 'admin', 'manager']);
const SPECIALIST_ROLES = new Set(['spn', 'lawyer', 'broker']);
const MORTGAGE_TASK_SOURCES = new Set(['intake_v1:mortgage', 'intake_v1:military_mortgage']);

function cleanUuid(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return UUID_RE.test(normalized) ? normalized : null;
}

function cleanRole(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return ACTIVE_ROLES.has(normalized) ? normalized : null;
}

function failed(stage, errors, extra = {}) {
  return {
    ok: false,
    stage,
    errors: Array.isArray(errors) ? errors : [String(errors || 'Неизвестная ошибка Edge runtime gate.')],
    runtime_integrated: true,
    route_enabled: false,
    edge_deployed: false,
    frontend_transport_enabled: false,
    profile_lookup_called: false,
    task_lookup_called: false,
    rpc_called: false,
    rpc_call_count: 0,
    verified_actor_id: null,
    actor_role: null,
    ...extra
  };
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
  const id = cleanUuid(profile.id);
  const role = cleanRole(profile.role);
  return {
    id,
    role,
    is_active: profile.is_active === true
  };
}

function normalizeTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) return null;
  return {
    id: cleanUuid(task.id),
    assigned_to: cleanUuid(task.assigned_to),
    assigned_role: cleanRole(task.assigned_role),
    task_type: typeof task.task_type === 'string' ? task.task_type.trim() : '',
    source: typeof task.source === 'string' ? task.source.trim() : '',
    task_contract_version: Number(task.task_contract_version)
  };
}

function roleAllowsTask(profile, task) {
  if (profile.role === 'viewer') {
    return { ok: false, stage: 'role_policy', error: 'Роль viewer не может изменять задачи.' };
  }
  if (SUPERVISOR_ROLES.has(profile.role)) return { ok: true };
  if (!SPECIALIST_ROLES.has(profile.role)) {
    return { ok: false, stage: 'role_policy', error: 'Роль не разрешена для governed task actions.' };
  }
  if (task.assigned_role !== profile.role) {
    return { ok: false, stage: 'role_mismatch', error: 'Роль профиля не совпадает с ролью исполнителя задачи.' };
  }
  if (task.assigned_to && task.assigned_to !== profile.id) {
    return { ok: false, stage: 'actor_assignment', error: 'Задача назначена другому пользователю.' };
  }
  if (profile.role === 'broker') {
    if (task.task_type !== 'broker_task' || !MORTGAGE_TASK_SOURCES.has(task.source)) {
      return { ok: false, stage: 'broker_scope', error: 'Брокер может выполнять только ипотечные задачи.' };
    }
  }
  return { ok: true };
}

export async function routeBoundedTaskEdgeActionV2({
  enabled = false,
  request_body = {},
  verified_user = null,
  profile_loader = null,
  task_loader = null,
  rpc_client = null
} = {}) {
  if (enabled !== true) {
    return failed('feature_disabled', ['Governed bounded task Edge route выключен.']);
  }

  const actorId = cleanUuid(verified_user?.id);
  if (!actorId) {
    return failed('verified_identity', ['Проверенный пользователь Auth отсутствует или имеет некорректный UUID.'], {
      route_enabled: true
    });
  }

  const preview = await rehearseTaskEdgeIdentityAction({
    request_body,
    verified_actor_id: actorId,
    mode: 'preview'
  });
  if (!preview.ok) {
    return failed(preview.stage || 'payload_validation', preview.errors || ['Governed action отклонён.'], {
      route_enabled: true,
      verified_actor_id: actorId,
      validation: preview.validation || null
    });
  }

  if (!profile_loader || typeof profile_loader !== 'function') {
    return failed('profile_transport', ['Profile loader не настроен.'], {
      route_enabled: true,
      verified_actor_id: actorId
    });
  }

  let profileRaw;
  try {
    profileRaw = await profile_loader(actorId);
  } catch (_error) {
    return failed('profile_lookup', ['Не удалось проверить профиль Navigator.'], {
      route_enabled: true,
      verified_actor_id: actorId,
      profile_lookup_called: true
    });
  }
  const profile = normalizeProfile(profileRaw);
  if (!profile || profile.id !== actorId || !profile.is_active) {
    return failed('active_profile', ['Активный профиль Navigator для пользователя не найден.'], {
      route_enabled: true,
      verified_actor_id: actorId,
      profile_lookup_called: true
    });
  }
  if (!profile.role) {
    return failed('role_profile', ['Профиль Navigator содержит неподдерживаемую роль.'], {
      route_enabled: true,
      verified_actor_id: actorId,
      profile_lookup_called: true
    });
  }

  if (!task_loader || typeof task_loader !== 'function') {
    return failed('task_transport', ['Task loader не настроен.'], {
      route_enabled: true,
      verified_actor_id: actorId,
      actor_role: profile.role,
      profile_lookup_called: true
    });
  }

  const taskId = cleanUuid(preview.rpc_args?.p_task_id);
  let taskRaw;
  try {
    taskRaw = await task_loader(taskId);
  } catch (_error) {
    return failed('task_lookup', ['Не удалось проверить контекст задачи.'], {
      route_enabled: true,
      verified_actor_id: actorId,
      actor_role: profile.role,
      profile_lookup_called: true,
      task_lookup_called: true
    });
  }
  const task = normalizeTask(taskRaw);
  if (!task || !task.id || task.id !== taskId || task.task_contract_version !== 2) {
    return failed('task_context', ['Contract-v2 задача не найдена.'], {
      route_enabled: true,
      verified_actor_id: actorId,
      actor_role: profile.role,
      profile_lookup_called: true,
      task_lookup_called: true
    });
  }

  const rolePolicy = roleAllowsTask(profile, task);
  if (!rolePolicy.ok) {
    return failed(rolePolicy.stage, [rolePolicy.error], {
      route_enabled: true,
      verified_actor_id: actorId,
      actor_role: profile.role,
      profile_lookup_called: true,
      task_lookup_called: true
    });
  }

  if (!rpc_client || typeof rpc_client.rpc !== 'function') {
    return failed('rpc_transport', ['Actor-aware RPC client не настроен.'], {
      route_enabled: true,
      verified_actor_id: actorId,
      actor_role: profile.role,
      profile_lookup_called: true,
      task_lookup_called: true
    });
  }

  try {
    const execution = await rehearseTaskEdgeIdentityAction({
      request_body,
      verified_actor_id: actorId,
      rpc_client,
      mode: 'mock_execute'
    });
    if (!execution.ok) {
      return failed(execution.stage || 'rpc_execution', execution.errors || ['Actor-aware RPC отклонён.'], {
        route_enabled: true,
        verified_actor_id: actorId,
        actor_role: profile.role,
        profile_lookup_called: true,
        task_lookup_called: true,
        rpc_called: execution.mock_rpc_called === true,
        rpc_call_count: Number(execution.mock_rpc_call_count || 0)
      });
    }
    return {
      ...execution,
      stage: 'runtime_rpc_executed',
      runtime_integrated: true,
      route_enabled: true,
      edge_deployed: false,
      frontend_transport_enabled: false,
      profile_lookup_called: true,
      task_lookup_called: true,
      rpc_called: true,
      rpc_call_count: 1,
      verified_actor_id: actorId,
      actor_role: profile.role,
      task_context: {
        id: task.id,
        assigned_role: task.assigned_role,
        task_type: task.task_type,
        source: task.source,
        task_contract_version: task.task_contract_version
      }
    };
  } catch (_error) {
    return failed('rpc_execution', ['Actor-aware RPC отклонён или завершился ошибкой.'], {
      route_enabled: true,
      verified_actor_id: actorId,
      actor_role: profile.role,
      profile_lookup_called: true,
      task_lookup_called: true,
      rpc_called: true,
      rpc_call_count: 1
    });
  }
}

export const TASK_EDGE_RUNTIME_INTEGRATION_CONTRACT = Object.freeze({
  feature_flag_default: false,
  runtime_integrated_in_source: true,
  edge_deployed: false,
  frontend_transport_enabled: false,
  verify_jwt_required: true,
  auth_identity_source: 'successful Auth user lookup from bearer token',
  profile_source: 'service-side nav_user_profiles lookup by verified user id',
  task_source: 'service-side nav_deal_tasks_v2 contract-v2 context lookup',
  actor_argument: 'p_actor_id',
  broker_scope: Object.freeze({
    assigned_role: 'broker',
    task_type: 'broker_task',
    allowed_sources: MORTGAGE_TASK_SOURCES
  })
});
