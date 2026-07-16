import { setupTop, getCachedUser, renderAuthBox, rpc, esc, statusText } from './supabase-v2.js';

const app = document.getElementById('app');
let preview = null;
let busy = false;
let errorText = '';
let activeFilter = 'attention';

function n(value) { return Number(value || 0); }
function items() { return Array.isArray(preview?.items) ? preview.items : []; }
function summary() { return preview?.summary || {}; }
function allowed() { return ['owner', 'admin', 'manager', 'broker'].includes(preview?.profile?.role); }

function fmtDate(value) {
  if (!value) return 'Не указано';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('ru-RU');
}

function fmtMoney(value) {
  if (value === null || value === undefined || value === '') return 'Не указано';
  const numeric = Number(String(value).replace(/[^0-9,.-]/g, '').replace(',', '.'));
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(numeric) + ' ₽';
}

function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}

function triageLabel(status) {
  return ({
    waiting_assignment: 'Ожидает назначения',
    collecting_data: 'Нужно уточнить данные',
    ready_for_review: 'Готово к проверке'
  })[status] || 'Требует проверки';
}

function triageTone(status) {
  return ({ waiting_assignment: 'red', collecting_data: 'yellow', ready_for_review: 'green' })[status] || 'gray';
}

function priorityLabel(priority) {
  return ({ urgent: 'Срочно', high: 'Высокий', normal: 'Обычный', low: 'Низкий' })[priority] || priority || 'Без приоритета';
}

function visibleItems() {
  return items().filter((item) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'waiting') return item.triage_status === 'waiting_assignment';
    if (activeFilter === 'incomplete') return Array.isArray(item.missing_finance_data) && item.missing_finance_data.length > 0;
    if (activeFilter === 'overdue') return Boolean(item.task_overdue);
    if (activeFilter === 'ready') return item.triage_status === 'ready_for_review';
    return item.triage_status !== 'ready_for_review' || Boolean(item.task_overdue);
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

function missingList(item) {
  const missing = Array.isArray(item.missing_finance_data) ? item.missing_finance_data : [];
  if (!missing.length) return '<div class="status ok"><b>Минимум для ипотечной консультации и первичной оценки заполнен.</b></div>';
  return `<div class="status warn"><b>Нужно уточнить для ипотечной консультации:</b><ul class="broker-missing">${missing.map((value) => `<li>${esc(value)}</li>`).join('')}</ul></div>`;
}

function responsibleText(item) {
  if (item.broker_name) return item.broker_name;
  return 'Брокер не назначен';
}

function dealTitle(item) {
  return item.title || item.address || 'Сделка без названия';
}

function brokerCard(item) {
  const dueTone = item.task_overdue ? 'red' : 'blue';
  return `<article class="list-item broker-card">
    <div class="section-title broker-card-head">
      <div>
        <div class="broker-labels">
          <span class="pill ${triageTone(item.triage_status)}">${esc(triageLabel(item.triage_status))}</span>
          <span class="pill blue">${esc(item.funding_scenario_label || 'Сценарий не указан')}</span>
          ${item.task_priority ? `<span class="pill ${item.task_priority === 'urgent' ? 'red' : item.task_priority === 'high' ? 'yellow' : 'gray'}">${esc(priorityLabel(item.task_priority))}</span>` : ''}
        </div>
        <h3>${esc(dealTitle(item))}</h3>
        <p class="muted">${esc(statusText(item.status))}${item.address ? ` · ${esc(item.address)}` : ''}</p>
      </div>
      <div class="broker-score"><span>приоритет</span><b>${n(item.urgency_score)}</b></div>
    </div>

    <section class="broker-next-action" aria-label="Следующее действие ипотечного брокера">
      <div><span class="small">Следующее действие</span><b>${esc(item.next_action || 'Провести ипотечную консультацию')}</b></div>
      <div><span class="small">Ответственный</span><b>${esc(responsibleText(item))}</b></div>
      <div><span class="small">Срок задачи</span><b>${esc(fmtDate(item.task_due_date))}</b><span class="pill ${dueTone}">${item.task_overdue ? 'Просрочено' : 'Контрольный срок'}</span></div>
    </section>

    <div class="broker-finance-grid">
      <div><span class="small">Цена объекта</span><b>${esc(fmtMoney(item.price_total))}</b></div>
      <div><span class="small">Требуется ипотека</span><b>${esc(fmtMoney(item.buyer_needed_amount))}</b></div>
      <div><span class="small">Первоначальный взнос</span><b>${esc(fmtMoney(item.buyer_initial_amount))}</b></div>
      <div><span class="small">Плановый срок одобрения</span><b>${esc(fmtDate(item.money_ready_date || item.buyer_ready_date))}</b></div>
    </div>

    ${(item.certificate_type || item.matcap_amount) ? `<details class="broker-support-details"><summary>Сопутствующие источники — зона СПН и юриста</summary><p class="muted">Эти сведения показаны только как контекст ипотечного сценария. Брокер не отвечает за оформление маткапитала или сертификата.</p><div class="broker-finance-grid"><div><span class="small">Сертификат</span><b>${esc(item.certificate_type || 'Не указан')}</b></div><div><span class="small">Сумма сертификата</span><b>${esc(fmtMoney(item.certificate_amount))}</b></div><div><span class="small">Срок сертификата</span><b>${esc(fmtDate(item.certificate_deadline))}</b></div><div><span class="small">Материнский капитал</span><b>${esc(fmtMoney(item.matcap_amount))}</b></div></div></details>` : ''}

    ${missingList(item)}

    <div class="broker-task-line"><div><span class="small">Ипотечная задача</span><b>${esc(item.task_title || 'Задача не создана')}</b></div><div><span class="small">Менеджер</span><b>${esc(item.manager_name || 'Не назначен')}</b></div></div>

    <div class="actions" style="justify-content:flex-start"><a class="btn primary" href="${esc(item.card_url || `./deal-card-v2.html?id=${encodeURIComponent(item.deal_id)}`)}">Открыть карточку сделки</a></div>
  </article>`;
}

function dataContract() {
  const contract = preview?.data_contract || {};
  const available = Array.isArray(contract.available) ? contract.available : [];
  const missing = Array.isArray(contract.not_yet_supported) ? contract.not_yet_supported : [];
  return `<details class="card broker-contract"><summary><b>Какие данные учитывает очередь</b><span class="muted">Границы текущей версии</span></summary><div class="broker-contract-grid"><div><h3>Уже учитывается</h3><ul>${available.map((value) => `<li>${esc(value)}</li>`).join('')}</ul></div><div><h3>Пока не ведётся</h3><ul>${missing.map((value) => `<li>${esc(value)}</li>`).join('')}</ul></div></div><p class="muted">Это очередь ипотечных консультаций и одобрений. Она не является банковской CRM. Подготовку и юридическое оформление сделки ведут СПН и юрист; маткапитал и сертификаты не входят в ответственность брокера.</p></details>`;
}

function draw() {
  const s = summary();
  const rows = visibleItems();
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero broker-hero"><span class="role-home-eyebrow">Ипотечная консультация и одобрение</span><h1>Очередь ипотечного брокера</h1><p>Только ипотечные сделки: консультация клиента и СПН, подбор программы и помощь в получении одобрения банка. Подготовку и оформление сделки ведут СПН и юрист.</p></section>
    ${errorText ? `<div class="status error" role="alert">${esc(errorText)}</div>` : ''}
    ${preview?.preview_only ? '<div class="status ok" role="status"><b>Только просмотр.</b> Очередь не меняет сделку, задачу, назначение брокера или финансовые данные.</div>' : ''}
    ${preview ? `<section class="kpi-row broker-metrics" aria-label="Сводка ипотечной очереди">
      ${metric('Ипотечных сделок', n(s.total), n(s.total) ? 'blue' : 'green')}
      ${metric('Без брокера', n(s.waiting_assignment), n(s.waiting_assignment) ? 'red' : 'green')}
      ${metric('Нужно уточнить', n(s.collecting_data), n(s.collecting_data) ? 'yellow' : 'green')}
      ${metric('Готово к консультации', n(s.ready_for_review), 'green')}
      ${metric('Просрочены задачи', n(s.overdue_tasks), n(s.overdue_tasks) ? 'red' : 'green')}
      ${metric('С доп. источниками', n(s.with_certificate) + n(s.with_matcap), 'blue')}
    </section>
    <section class="card broker-list">
      <div class="section-title"><div><h2>Очередь ипотечных консультаций</h2><p class="muted">Сортировка учитывает назначение брокера, просрочку задачи и пробелы данных, необходимых для консультации и одобрения.</p></div><span class="pill ${rows.length ? 'red' : 'green'}">${rows.length}</span></div>
      <div class="tabs broker-tabs">${filterButton('attention', 'Требует внимания')}${filterButton('waiting', 'Без брокера')}${filterButton('incomplete', 'Не хватает данных')}${filterButton('overdue', 'Просрочено')}${filterButton('ready', 'Готово к консультации')}${filterButton('all', 'Все')}</div>
      <div class="list">${rows.map(brokerCard).join('') || '<div class="empty">В выбранной группе нет ипотечных сделок.</div>'}</div>
    </section>
    ${dataContract()}` : `<section class="card"><p role="status" aria-live="polite">${busy ? 'Формирую ипотечную очередь…' : 'Очередь ещё не загружена.'}</p></section>`}
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
    preview = await rpc('nav_v2_get_broker_queue_preview', { p_limit: 300 }, 20000);
    if (!allowed()) throw new Error('Ипотечная очередь доступна брокеру, менеджеру и администратору.');
  } catch (error) {
    preview = null;
    errorText = error.message || String(error);
  } finally {
    busy = false;
    draw();
  }
}

async function init() {
  setupTop('broker');
  if (!getCachedUser()) return renderAuthBox(app, async () => location.reload());
  await loadPreview();
}

init();
