import { getSupabaseClient, getCurrentUser, ensureNavigatorProfile } from './supabase.js';

const EVENTS_TABLE = 'nav_deal_events';

export const EVENT_LABELS = {
  status_changed: 'Статус изменен',
  review_added: 'Добавлено решение',
  task_created: 'Создана задача',
  task_status_changed: 'Статус задачи изменен',
  task_completed: 'Задача закрыта',
  deal_saved: 'Сделка сохранена',
  note_added: 'Добавлена заметка',
  system: 'Системное событие'
};

export function eventLabel(type) {
  return EVENT_LABELS[type] || type || 'Событие';
}

export async function listDealEvents(dealId, limit = 100) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  await ensureNavigatorProfile();

  const { data, error } = await supabase
    .from(EVENTS_TABLE)
    .select('id,deal_id,user_id,event_type,title,body,old_value,new_value,metadata,created_at')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function addDealEvent(dealId, event) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');

  const user = await getCurrentUser();
  if (!user) throw new Error('Сначала войдите в Supabase');
  await ensureNavigatorProfile();

  const { data, error } = await supabase
    .from(EVENTS_TABLE)
    .insert({
      deal_id: dealId,
      user_id: user.id,
      event_type: event.event_type || 'system',
      title: event.title || eventLabel(event.event_type),
      body: event.body || null,
      old_value: event.old_value || null,
      new_value: event.new_value || null,
      metadata: event.metadata || {}
    })
    .select('id,deal_id,user_id,event_type,title,body,old_value,new_value,metadata,created_at')
    .single();

  if (error) throw error;
  return data;
}

export async function addStatusEvent(dealId, oldStatus, newStatus, title = 'Статус сделки изменен') {
  return addDealEvent(dealId, {
    event_type: 'status_changed',
    title,
    body: `Статус изменен: ${oldStatus || '—'} → ${newStatus || '—'}`,
    old_value: oldStatus || null,
    new_value: newStatus || null
  });
}

export async function addReviewEvent(dealId, role, decision, comment = '') {
  return addDealEvent(dealId, {
    event_type: 'review_added',
    title: 'Добавлено решение по сделке',
    body: `${role || 'роль'}: ${decision || 'решение'}${comment ? '. ' + comment : ''}`,
    metadata: { role, decision }
  });
}

export async function addTaskEvent(dealId, task, type = 'task_created') {
  return addDealEvent(dealId, {
    event_type: type,
    title: type === 'task_completed' ? 'Задача закрыта' : 'Создана задача',
    body: task?.title || '',
    metadata: task || {}
  });
}
