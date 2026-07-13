import { getCachedUser, renderAuthBox, rpc, esc, riskPill, statusText } from './supabase-v2.js';

const V = '20260713-01';
const app = document.getElementById('app');
let items = [];
let profile = {};
let queue = new URLSearchParams(location.search).get('queue') || 'all';
let focusIndex = 0;

const names = {
  all: 'Все',
  urgent: 'Стоп-факторы',
  problem_docs: 'Проблемы документов',
  overdue_docs: 'Просрочка документов',
  resubmitted: 'Повторно от СПН',
  rework: 'Доработка СПН',
  docs: 'Документы',
  deposit: 'Задатки',
  deal: 'Основной договор',
  active: 'Проверка',
  other: 'Прочее'
};

function n(v) { return Number(v || 0); }
function sid(id) { return String(id || '').slice(0, 8).toUpperCase(); }
function metric(t, v, c = '') { return `<div class="metric ${c}"><span>${esc(t)}</span><b>${esc(v)}</b></div>`; }
function list(v) { return Array.isArray(v) ? v : []; }
function cnt(q) { return q === 'all' ? items.length : items.filter((x) => x.lawyer_queue === q).length; }
function cls(q) { return (q === 'urgent' || q === 'problem_docs' || q === 'overdue_docs') ? 'red' : (q === 'resubmitted' || q === 'rework' || q === 'docs') ? 'yellow' : q === 'deposit' ? 'blue' : 'green'; }
function waitDays(v) { const d = v ? new Date(v) : null; if (!d || Number.isNaN(d.getTime())) return 0; return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000)); }
function clean(v) { return String(v || '').trim(); }
function shownItems() { return queue === 'all' ? items : items.filter((x) => x.lawyer_queue === queue); }

function reviewSummary(x) {
  const fallback = x.review_summary || {};
  return {
    reviews_count: n(x.reviews_count) || n(fallback.reviews_count),
    approved_reviews_count: n(x.approved_reviews_count) || n(fallback.approved_reviews_count),
    need_info_reviews_count: n(x.need_info_reviews_count) || n(fallback.need_info_reviews_count),
    blocked_reviews_count: n(x.blocked_reviews_count) || n(fallback.blocked_reviews_count),
    blocking_reviews_count: n(x.blocking_reviews_count) || n(fallback.blocking_reviews_count),
    latest_review_decision: x.latest_review_decision || fallback.latest_review_decision,
    latest_reviewer_role: x.latest_reviewer_role || fallback.latest_reviewer_role,
    latest_review_at: x.latest_review_at || fallback.latest_review_at,
    latest_review_body: x.latest_review_body || fallback.latest_review_body,
    latest_blocks_deposit: x.latest_blocks_deposit ?? fallback.latest_blocks_deposit,
    latest_blocks_deal: x.latest_blocks_deal ?? fallback.latest_blocks_deal
  };
}

function blockingReviewsCount(q = 'all') {
  return (q === 'all' ? items : items.filter((x) => x.lawyer_queue === q)).filter((x) => n(reviewSummary(x).blocking_reviews_count)).length;
}

function roleLabel(role) {
  return ({ owner: 'владелец', admin: 'администратор', manager: 'менеджер', spn: 'СПН', lawyer: 'юрист', broker: 'брокер', viewer: 'наблюдатель' })[role] || role || 'роль не указана';
}

function reviewMeta(decision) {
  return ({ approved: ['Одобрено', 'green'], need_info: ['Нужна информация', 'yellow'], blocked: ['Блокировано', 'red'] })[decision] || [decision || 'Решение', 'blue'];
}

function docPills(x) {
  const p = [];
  const days = waitDays(x.oldest_requested_document_at);
  if (n(x.problem_documents_count)) p.push(`<span class="pill red">проблемы: ${n(x.problem_documents_count)}</span>`);
  if (n(x.overdue_requested_documents_count)) p.push(`<span class="pill red">просрочено: ${n(x.overdue_requested_documents_count)}</span>`);
  if (n(x.not_requested_documents_count)) p.push(`<span class="pill yellow">не запрошено: ${n(x.not_requested_documents_count)}</span>`);
  if (n(x.requested_documents_count)) p.push(`<span class="pill blue">ждём клиента: ${n(x.requested_documents_count)}${days ? ` · ${days} дн.` : ''}</span>`);
  return p.length ? `<div class="lawyer-pill-row">${p.join(' ')}</div>` : '';
}

function reviewPills(x) {
  const r = reviewSummary(x);
  if (!n(r.reviews_count)) return '';
  const [label, color] = reviewMeta(r.latest_review_decision);
  const p = [
    `<span class="pill ${color}">последнее решение: ${esc(label)}</span>`,
    `<span class="pill blue">решений: ${n(r.reviews_count)}</span>`
  ];
  if (n(r.blocking_reviews_count)) p.push(`<span class="pill red">блокирующих: ${n(r.blocking_reviews_count)}</span>`);
  if (r.latest_reviewer_role) p.push(`<span class="pill">${esc(roleLabel(r.latest_reviewer_role))}</span>`);
  return `<div class="lawyer-pill-row">${p.join(' ')}</div>`;
}

function spnClientLine(x) {
  const seller = clean(x.seller_spn);
  const buyer = clean(x.buyer_spn);
  if (seller && buyer && seller === buyer) return `${seller} ведёт продавца и покупателя.`;
  if (seller && buyer) return `Продавца ведёт ${seller}. Покупателя ведёт ${buyer}.`;
  if (seller) return `Продавца ведёт ${seller}.`;
  if (buyer) return `Покупателя ведёт ${buyer}.`;
  return 'СПН по клиентам не назначен.';
}

function focusReason(x) {
  const reasons = list(x.focus_reasons).map(clean).filter(Boolean);
  if (reasons.length) return reasons[0];
  const q = x.lawyer_queue || 'other';
  if (q === 'urgent') return 'Есть юридический стоп-фактор.';
  if (q === 'problem_docs') return 'Есть документ с проблемой или отказом.';
  if (q === 'overdue_docs') return 'Обязательные документы просрочены.';
  if (q === 'resubmitted') return 'СПН повторно передал сделку после доработки.';
  if (q === 'rework') return 'СПН ожидает конкретного юридического замечания.';
  return 'Сделка следующая в серверной очереди юридической проверки.';
}

function primaryAction(x) {
  const q = x.lawyer_queue || 'other';
  const r = reviewSummary(x);
  if (n(r.blocking_reviews_count)) return { label: 'Открыть решение', anchor: 'reviews' };
  if (q === 'problem_docs') return { label: 'Разобрать проблемный документ', anchor: 'problemDocsV2' };
  if (q === 'overdue_docs' || q === 'docs') return { label: 'Проверить документы', anchor: 'docs' };
  if (q === 'resubmitted' || q === 'rework') return { label: 'Проверить доработку СПН', anchor: 'comments' };
  return { label: 'Провести юридическую проверку', anchor: 'risks' };
}

function focusCard(x, position, total) {
  if (!x) return `<section class="card lawyer-focus-empty"><h2>Следующая важная сделка</h2><p>В выбранной очереди сделок нет.</p></section>`;
  const id = encodeURIComponent(x.id || '');
  const q = x.lawyer_queue || 'other';
  const r = reviewSummary(x);
  const action = primaryAction(x);
  const nextAction = clean(x.lawyer_next_action || x.next_action) || 'Открыть карточку и проверить сделку.';
  const nextButton = total > 1 ? '<button class="btn light" type="button" data-lawyer-next>Следующая сделка</button>' : '';
  return `<section class="card lawyer-focus" aria-labelledby="lawyerFocusTitle" aria-live="polite">
    <div class="lawyer-focus-kicker">Следующая важная сделка · ${position + 1} из ${total}</div>
    <div class="lawyer-focus-head">
      <div>
        <h2 id="lawyerFocusTitle">${esc(x.title || 'Сделка без названия')}</h2>
        <p class="muted">${esc(x.address || 'Адрес не указан')} · ${esc(x.object_type || 'тип не указан')}</p>
      </div>
      <div class="lawyer-focus-badges">${riskPill(x.risk_level)} <span class="pill ${cls(q)}">${esc(names[q] || q)}</span></div>
    </div>
    <div class="lawyer-focus-reason"><span>Почему сейчас</span><strong>${esc(focusReason(x))}</strong></div>
    <div class="lawyer-focus-action"><span>Главное действие</span><strong>${esc(nextAction)}</strong></div>
    <div class="lawyer-focus-owner"><b>СПН по клиентам:</b> ${esc(spnClientLine(x))}</div>
    <div class="actions lawyer-focus-actions">
      <a class="btn primary" href="./deal-card-v2.html?id=${id}&test=${V}#${action.anchor}">${esc(action.label)}</a>
      ${nextButton}
    </div>
    <details class="lawyer-focus-details">
      <summary>Показать детали сделки</summary>
      <div class="deal-meta lawyer-focus-metrics">
        <div><span class="small">К задатку</span><b>${n(x.readiness_deposit)}%</b></div>
        <div><span class="small">К сделке</span><b>${n(x.readiness_deal)}%</b></div>
        <div><span class="small">Документы</span><b>${n(x.missing_documents_count)}</b></div>
        <div><span class="small">Просрочено</span><b>${n(x.overdue_requested_documents_count)}</b></div>
        <div><span class="small">Проблемы</span><b>${n(x.problem_documents_count)}</b></div>
        <div><span class="small">Блокирует</span><b>${n(r.blocking_reviews_count)}</b></div>
      </div>
      ${docPills(x)}
      ${reviewPills(x)}
      <p class="muted">ID ${sid(x.id)} · серверный приоритет ${n(x.priority_score)} · ${esc(statusText(x.status))}</p>
    </details>
  </section>`;
}

function card(x) {
  const id = encodeURIComponent(x.id || '');
  const q = x.lawyer_queue || 'other';
  const r = reviewSummary(x);
  const reasons = list(x.focus_reasons).map(clean).filter(Boolean).join('; ') || 'Критичных признаков не найдено.';
  const action = primaryAction(x);
  return `<article class="deal-card lawyer-queue-card">
    <div class="deal-head">
      <div>
        <div class="small">ID ${sid(x.id)} · приоритет ${n(x.priority_score)}</div>
        <div class="deal-title">${esc(x.title || 'Сделка без названия')}</div>
        <div class="small">${esc(x.address || 'Адрес не указан')} · ${esc(x.object_type || 'тип не указан')}</div>
      </div>
      ${riskPill(x.risk_level)}
    </div>
    <div class="lawyer-queue-reason"><b>Причина:</b> ${esc(reasons)}</div>
    <p><b>Следующее действие:</b><br>${esc(x.lawyer_next_action || x.next_action || 'Открыть карточку и проверить сделку.')}</p>
    <div class="actions lawyer-queue-actions">
      <a class="btn primary" href="./deal-card-v2.html?id=${id}&test=${V}#${action.anchor}">${esc(action.label)}</a>
      <a class="btn light" href="./deal-card-v2.html?id=${id}&test=${V}#docs">Документы</a>
      <a class="btn light" href="./deal-card-v2.html?id=${id}&test=${V}#comments">Комментарии</a>
    </div>
    ${n(r.blocking_reviews_count) ? `<span class="pill red">блокирующих решений: ${n(r.blocking_reviews_count)}</span>` : ''}
  </article>`;
}

function render() {
  const shown = shownItems();
  if (!shown.length) focusIndex = 0;
  else if (focusIndex >= shown.length) focusIndex = 0;
  const focused = shown[focusIndex] || null;

  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Кабинет юриста</h1><p>${esc(profile.full_name || 'Пользователь')} · сначала одна наиболее важная сделка, затем следующая.</p></section>
    <section class="card"><div class="actions lawyer-top-actions"><a class="btn primary" href="./queue-v2.html?test=${V}">Кабинет юриста</a><a class="btn light" href="./deals-v2.html?filter=lawyer">Все сделки</a><a class="btn light" href="./dashboard-v2.html?test=${V}">Рабочий стол</a><a class="btn light" href="./nav-v2.html?clean=1">Сбросить сессию</a></div></section>
    ${focusCard(focused, focusIndex, shown.length)}
    <section class="card lawyer-filter-card">
      <div class="section-title"><div><h2>Выбрать очередь</h2><p class="muted">Сервер уже расставил сделки по юридическому приоритету. Фильтр меняет только текущий фокус.</p></div><span class="pill blue">${shown.length}</span></div>
      <div class="actions lawyer-queue-filters">${Object.keys(names).map((k) => `<button class="btn ${queue === k ? 'primary' : 'light'}" data-q="${k}" type="button" aria-pressed="${queue === k}">${esc(names[k])} · ${cnt(k)}</button>`).join('')}</div>
    </section>
    <details class="card lawyer-secondary-summary">
      <summary>Показать сводные показатели</summary>
      <section class="kpi-row lawyer-kpi-row">${metric('Всего', cnt('all'))}${metric('Стоп-факторы', cnt('urgent'), cnt('urgent') ? 'red' : 'green')}${metric('Проблемы документов', cnt('problem_docs'), cnt('problem_docs') ? 'red' : 'green')}${metric('Просрочка документов', cnt('overdue_docs'), cnt('overdue_docs') ? 'red' : 'green')}${metric('Блокирующие решения', blockingReviewsCount('all'), blockingReviewsCount('all') ? 'red' : 'green')}${metric('Повторно от СПН', cnt('resubmitted'), cnt('resubmitted') ? 'yellow' : 'green')}${metric('Документы', cnt('docs'), cnt('docs') ? 'yellow' : 'green')}${metric('Задатки', cnt('deposit'), 'blue')}</section>
    </details>
    <details class="card lawyer-full-queue">
      <summary>Показать всю очередь · ${shown.length}</summary>
      <div class="section-title"><div><h2>${esc(names[queue] || 'Очередь')}</h2><p class="muted">Используйте полный список для сверки и перехода к другой сделке. Основной рабочий маршрут начинается с фокус-карточки выше.</p></div></div>
      <div class="deal-list lawyer-deal-list">${shown.map(card).join('') || '<div class="empty">В этой очереди сделок нет.</div>'}</div>
    </details>
  </main>`;

  document.querySelectorAll('[data-q]').forEach((button) => {
    button.addEventListener('click', () => {
      queue = button.dataset.q || 'all';
      focusIndex = 0;
      history.replaceState(null, '', `./queue-v2.html?test=${V}&queue=${encodeURIComponent(queue)}`);
      render();
    });
  });

  document.querySelector('[data-lawyer-next]')?.addEventListener('click', () => {
    const current = shownItems();
    if (!current.length) return;
    focusIndex = (focusIndex + 1) % current.length;
    render();
    document.getElementById('lawyerFocusTitle')?.focus?.();
  });
}

function login(msg = '') {
  app.innerHTML = '<main class="nav-v2-shell"><div id="authHost"></div></main>';
  renderAuthBox(document.getElementById('authHost'), async () => location.reload());
  const status = document.getElementById('authStatus');
  if (status && msg) { status.className = 'status warn'; status.textContent = msg; }
}

async function load() {
  if (!getCachedUser()?.id) return login('Сначала войдите в Навигатор.');
  app.innerHTML = '<main class="nav-v2-shell"><section class="hero"><h1>Кабинет юриста</h1><p>Определяю следующую важную сделку...</p></section><div class="status" role="status" aria-live="polite">Получаю юридическую очередь.</div></main>';
  try {
    const data = await rpc('nav_v2_get_lawyer_queue', { p_limit: 100 }, 45000);
    const reviewData = await rpc('nav_v2_get_lawyer_review_summary', {}, 15000).catch(() => ({ items: [] }));
    const reviewsByDeal = new Map(list(reviewData?.items).map((review) => [review.deal_id, review]));
    profile = data?.profile || {};
    items = list(data?.items).map((item) => ({ ...item, review_summary: reviewsByDeal.get(item.id) || {} }));
    render();
  } catch (error) {
    app.innerHTML = `<main class="nav-v2-shell"><section class="hero"><h1>Кабинет юриста</h1></section><div class="status error" role="alert">${esc(error.message || error)}</div></main>`;
  }
}

load();
