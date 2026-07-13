import { setupTop, getCachedUser, renderAuthBox, rpc, esc, statusText } from './supabase-v2.js';

const app = document.getElementById('app');
let preview = null;
let activeFilter = 'attention';
let busy = false;
let errorText = '';

function n(value) { return Number(value || 0); }
function list(value) { return Array.isArray(value) ? value : []; }
function items() { return list(preview?.items); }
function allowed() { return ['owner', 'admin', 'viewer'].includes(preview?.profile?.role); }

function fmtDate(value, includeTime = false) {
  if (!value) return 'Не указано';
  const source = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T00:00:00` : value;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return String(value);
  return includeTime ? date.toLocaleString('ru-RU') : date.toLocaleDateString('ru-RU');
}

function roleLabel(role) {
  return ({ owner: 'владелец', admin: 'администратор', manager: 'менеджер', spn: 'СПН', lawyer: 'юрист', broker: 'брокер', viewer: 'наблюдатель' })[role] || role || 'роль не указана';
}

function readinessTone(item) {
  const gaps = list(item.missing_critical_data).length + list(item.operational_blockers).length;
  if (n(item.operational_readiness_percent) >= 80 && gaps === 0) return 'green';
  if (n(item.operational_readiness_percent) >= 60) return 'yellow';
  return 'red';
}

function obstacles(item) {
  return [...new Set([...list(item.missing_critical_data), ...list(item.operational_blockers)].filter(Boolean))];
}

function hasAttention(item) { return obstacles(item).length > 0 || Boolean(item.needs_manager_attention); }

function dueDistance(item) {
  if (!item.next_action_due_date) return null;
  const date = new Date(`${item.next_action_due_date}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

function dueText(item) {
  const distance = dueDistance(item);
  if (distance === null) return 'Срок не указан';
  if (distance < 0) return `Просрочено на ${Math.abs(distance)} дн.`;
  if (distance === 0) return 'Сегодня';
  if (distance === 1) return 'Завтра';
  return `Через ${distance} дн.`;
}

function dueTone(item) {
  const distance = dueDistance(item);
  if (distance === null || distance < 0) return 'red';
  if (distance <= 3) return 'yellow';
  return 'blue';
}

function visibleItems() {
  return items().filter((item) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'stale') return n(item.stale_days) >= 7;
    if (activeFilter === 'upcoming') {
      const distance = dueDistance(item);
      return distance !== null && distance <= 7;
    }
    if (activeFilter === 'blocked') return obstacles(item).length > 0;
    return hasAttention(item);
  });
}

function countFilter(filter) {
  const previous = activeFilter;
  activeFilter = filter;
  const count = visibleItems().length;
  activeFilter = previous;
  return count;
}

function filterButton(id, label) {
  return `<button class="tab ${activeFilter === id ? 'active' : ''}" type="button" data-filter="${id}" aria-pressed="${activeFilter === id ? 'true' : 'false'}">${esc(label)} · ${countFilter(id)}</button>`;
}

function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}

function assignmentLabel(state, role) {
  if (state === 'not_needed') return `${role} не требуется`;
  if (state === 'assigned') return `${role} назначен`;
  return `${role} ожидает назначения`;
}

function nextOwner(item) {
  return item.next_action_owner_name || roleLabel(item.next_action_owner_role) || 'Не назначен';
}

function viewerCard(item) {
  const blockers = obstacles(item);
  const mainObstacle = blockers[0] || item.cannot_advance_reason || 'Операционных препятствий не найдено';
  const cardUrl = item.card_url || `./deal-card-v2.html?id=${encodeURIComponent(item.deal_id || '')}`;
  return `<article class="list-item viewer-card">
    <div class="section-title viewer-card-head">
      <div>
        <div class="viewer-labels"><span class="pill">${esc(statusText(item.status))}</span>${item.stale_days >= 7 ? `<span class="pill yellow">без активности ${n(item.stale_days)} дн.</span>` : ''}</div>
        <h3>${esc(item.title || 'Сделка без названия')}</h3>
      </div>
      <div class="viewer-readiness ${readinessTone(item)}"><span>готовность</span><b>${n(item.operational_readiness_percent)}%</b></div>
    </div>

    <section class="viewer-main-obstacle ${blockers.length ? 'blocked' : 'clear'}" aria-label="Главное препятствие">
      <span class="small">Почему нельзя двигаться дальше</span>
      <b>${esc(mainObstacle)}</b>
    </section>

    <section class="viewer-next" aria-label="Ближайшее действие">
      <div><span class="small">Следующее действие</span><b>${esc(item.next_action || 'Следующий шаг не указан')}</b></div>
      <div><span class="small">Ответственный</span><b>${esc(nextOwner(item))}</b></div>
      <div><span class="small">Ближайшая дата</span><b>${esc(fmtDate(item.next_action_due_date))}</b><span class="pill ${dueTone(item)}">${esc(dueText(item))}</span></div>
    </section>

    <div class="viewer-responsibles">
      <div><span class="small">Менеджер</span><b>${esc(item.manager_name || item.manager_exception_reason || 'Не назначен')}</b></div>
      <div><span class="small">СПН</span><b>${esc(item.responsible_spn_name || 'Не назначен')}</b></div>
      <div><span class="small">Юрист</span><b>${esc(assignmentLabel(item.lawyer_assignment_state, 'Юрист'))}</b></div>
      <div><span class="small">Брокер</span><b>${esc(assignmentLabel(item.broker_assignment_state, 'Брокер'))}</b></div>
    </div>

    <details class="viewer-details">
      <summary>Все препятствия и контроль</summary>
      ${blockers.length ? `<ul>${blockers.map((value) => `<li>${esc(value)}</li>`).join('')}</ul>` : '<p>Критичных препятствий по операционному минимуму нет.</p>'}
      <p class="muted">Последняя активность: ${esc(fmtDate(item.last_activity_at, true))}. Открытых задач: ${n(item.open_tasks_count)}; блокирующих рисков: ${n(item.blocking_risks_count)}; просроченных обязательных документов: ${n(item.overdue_required_documents_count)}.</p>
    </details>

    <div class="actions viewer-actions"><a class="btn primary" href="${esc(cardUrl)}">Открыть карточку</a><a class="btn light" href="${esc(cardUrl)}#history">История сделки</a></div>
  </article>`;
}

function draw() {
  const rows = visibleItems();
  const blocked = items().filter((item) => obstacles(item).length > 0).length;
  const stale = items().filter((item) => n(item.stale_days) >= 7).length;
  const upcoming = items().filter((item) => { const distance = dueDistance(item); return distance !== null && distance <= 7; }).length;
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero viewer-hero"><span class="role-home-eyebrow">Режим наблюдения</span><h1>Обзор сделок</h1><p>Статус, правдивая готовность, ответственные, главное препятствие и ближайшая дата — без изменения рабочих данных.</p></section>
    ${errorText ? `<div class="status error" role="alert">${esc(errorText)}</div>` : ''}
    ${preview ? `<div class="status ok" role="status"><b>Только просмотр.</b> Здесь нет назначения ответственных, смены статусов, закрытия задач или других рабочих действий.</div>
    <section class="kpi-row viewer-metrics" aria-label="Сводка обзора сделок">
      ${metric('Доступно сделок', items().length, 'blue')}
      ${metric('Есть препятствия', blocked, blocked ? 'red' : 'green')}
      ${metric('Дата в ближайшие 7 дней', upcoming, upcoming ? 'yellow' : 'green')}
      ${metric('Нет активности 7+ дней', stale, stale ? 'yellow' : 'green')}
    </section>
    <section class="card viewer-list">
      <div class="section-title"><div><h2>Сделки для наблюдения</h2><p class="muted">Порядок задаёт сервер: сначала проблемные и менее готовые сделки, затем ближайшие сроки.</p></div><span class="pill ${rows.length ? 'blue' : 'green'}">${rows.length}</span></div>
      <div class="tabs viewer-tabs">${filterButton('attention', 'Требуют внимания')}${filterButton('blocked', 'С препятствиями')}${filterButton('upcoming', 'Ближайшие даты')}${filterButton('stale', 'Без активности')}${filterButton('all', 'Все')}</div>
      <div class="list">${rows.map(viewerCard).join('') || '<div class="empty">В выбранной группе нет сделок.</div>'}</div>
    </section>` : `<section class="card"><p role="status" aria-live="polite">${busy ? 'Формирую обзор доступных сделок…' : 'Обзор ещё не загружен.'}</p></section>`}
  </main>`;

  document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.filter || 'attention';
      draw();
    });
  });
}

async function loadPreview() {
  if (busy) return;
  busy = true;
  errorText = '';
  draw();
  try {
    preview = await rpc('nav_v2_get_operational_readiness_preview', { p_limit: 200 }, 20000);
    if (!allowed()) throw new Error('Обзор доступен пользователю с ролью наблюдателя.');
  } catch (error) {
    preview = null;
    errorText = error.message || String(error);
  } finally {
    busy = false;
    draw();
  }
}

async function init() {
  setupTop('viewer');
  if (!getCachedUser()) return renderAuthBox(app, async () => location.reload());
  await loadPreview();
}

init();
