const LOCAL_REVIEWS_KEY = 'navigator_local_reviews_v1';
const LOCAL_TASKS_KEY = 'navigator_local_tasks_v1';

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { return []; }
}
function write(key, items) {
  localStorage.setItem(key, JSON.stringify(items || []));
}
function id(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(16).slice(2);
}
function now() {
  return new Date().toISOString();
}

export function listLocalReviews() {
  return read(LOCAL_REVIEWS_KEY).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export function addLocalReview(role, decision, comment) {
  const item = {
    id: id('review'),
    deal_id: 'local',
    reviewer_role: role || 'lawyer',
    decision: decision || 'needs_documents',
    comment: comment || '',
    created_at: now()
  };
  write(LOCAL_REVIEWS_KEY, [item, ...read(LOCAL_REVIEWS_KEY)]);
  return item;
}

export function clearLocalReviews() {
  write(LOCAL_REVIEWS_KEY, []);
}

export function listLocalTasks() {
  return read(LOCAL_TASKS_KEY).sort((a, b) => {
    const status = String(a.status || '').localeCompare(String(b.status || ''));
    if (status !== 0) return status;
    return String(a.due_date || '9999-99-99').localeCompare(String(b.due_date || '9999-99-99'));
  });
}

export function addLocalTask(task) {
  const item = {
    id: id('task'),
    deal_id: 'local',
    title: task.title,
    description: task.description || '',
    priority: task.priority || 'normal',
    status: task.status || 'open',
    due_date: task.due_date || '',
    created_at: now(),
    updated_at: now()
  };
  write(LOCAL_TASKS_KEY, [item, ...read(LOCAL_TASKS_KEY)]);
  return item;
}

export function addLocalTasks(tasks = []) {
  const existing = read(LOCAL_TASKS_KEY);
  const titles = new Set(existing.map((task) => String(task.title || '').trim().toLowerCase()));
  const created = [];
  for (const task of tasks) {
    const key = String(task.title || '').trim().toLowerCase();
    if (!key || titles.has(key)) continue;
    titles.add(key);
    created.push({
      id: id('task'),
      deal_id: 'local',
      title: task.title,
      description: task.description || '',
      priority: task.priority || 'normal',
      status: task.status || 'open',
      due_date: task.due_date || '',
      created_at: now(),
      updated_at: now()
    });
  }
  if (created.length) write(LOCAL_TASKS_KEY, [...created, ...existing]);
  return created;
}

export function updateLocalTaskStatus(taskId, status) {
  const items = read(LOCAL_TASKS_KEY).map((task) => task.id === taskId ? { ...task, status, updated_at: now() } : task);
  write(LOCAL_TASKS_KEY, items);
}

export function clearLocalTasks() {
  write(LOCAL_TASKS_KEY, []);
}

export function hasLocalWorkflow() {
  return read(LOCAL_REVIEWS_KEY).length > 0 || read(LOCAL_TASKS_KEY).length > 0;
}
