import { getSupabaseClient, getCurrentUser, ensureNavigatorProfile } from './supabase.js';
import { addTaskEvent, addDealEvent } from './dealEvents.js';

const TASKS_TABLE = 'nav_deal_tasks';

export const TASK_STATUSES = [
  ['open', 'Открыта'],
  ['in_progress', 'В работе'],
  ['done', 'Выполнена'],
  ['cancelled', 'Отменена']
];

export const TASK_PRIORITIES = [
  ['low', 'Низкая'],
  ['normal', 'Обычная'],
  ['high', 'Высокая'],
  ['urgent', 'Срочно']
];

export async function listDealTasks(dealId) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  await ensureNavigatorProfile();

  const { data, error } = await supabase
    .from(TASKS_TABLE)
    .select('id,deal_id,title,description,status,priority,due_date,assigned_to,created_by,created_at,updated_at')
    .eq('deal_id', dealId)
    .order('status', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function addDealTask(dealId, task) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');

  const user = await getCurrentUser();
  if (!user) throw new Error('Сначала войдите в Supabase');
  await ensureNavigatorProfile();

  const { data, error } = await supabase
    .from(TASKS_TABLE)
    .insert({
      deal_id: dealId,
      title: task.title,
      description: task.description || null,
      priority: task.priority || 'normal',
      status: task.status || 'open',
      due_date: task.due_date || null,
      created_by: user.id,
      assigned_to: task.assigned_to || null
    })
    .select('id,deal_id,title,description,status,priority,due_date,created_at,updated_at')
    .single();

  if (error) throw error;

  try { await addTaskEvent(dealId, data, 'task_created'); } catch (_) {}
  return data;
}

export async function updateDealTaskStatus(taskId, status) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  await ensureNavigatorProfile();

  const { data: before } = await supabase
    .from(TASKS_TABLE)
    .select('id,deal_id,title,status')
    .eq('id', taskId)
    .maybeSingle();

  const { data, error } = await supabase
    .from(TASKS_TABLE)
    .update({ status })
    .eq('id', taskId)
    .select('id,deal_id,title,status,updated_at')
    .single();

  if (error) throw error;

  try {
    await addDealEvent(data.deal_id, {
      event_type: status === 'done' ? 'task_completed' : 'task_status_changed',
      title: status === 'done' ? 'Задача закрыта' : 'Статус задачи изменен',
      body: data.title || before?.title || 'Задача',
      old_value: before?.status || null,
      new_value: status,
      metadata: { task_id: taskId, title: data.title || before?.title || '' }
    });
  } catch (_) {}

  return data;
}

export function getTaskStatusLabel(value) {
  return (TASK_STATUSES.find((item) => item[0] === value) || [value, value])[1];
}

export function getTaskPriorityLabel(value) {
  return (TASK_PRIORITIES.find((item) => item[0] === value) || [value, value])[1];
}
