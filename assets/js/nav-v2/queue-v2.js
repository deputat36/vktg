import { getCachedUser, renderAuthBox, rpc, esc, riskPill, statusText } from './supabase-v2.js';

const V = '20260625-1020';
const app = document.getElementById('app');
let items = [];
let profile = {};
let queue = new URLSearchParams(location.search).get('queue') || 'all';

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
  return ({ owner: 'owner', admin: 'admin', manager: 'менеджер', spn: 'СПН', lawyer: 'юрист', broker: 'брокер', viewer: 'наблюдатель' })[role] || role || 'роль не указана';
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
  if (n(x.requested_documents_count)) p.push(`<span class="pill blue">ждём клиента: ${n(x.requested_documents_count)}${days ? ' · ' + days + ' дн.' : ''}</span>`);
  return p.length ? `<div style="margin:10px 0">${p.join(' ')}</div>` : '';
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
  return `<div style="margin:10px 0">${p.join(' ')}</div>`;
}

function spnClientLine(x) {
  const seller = clean(x.seller_spn);
  const buyer = clean(x.buyer_spn);
  if (seller && buyer && seller === buyer) return `${seller} ведёт продавца и покупателя. СПН отвечает за коммуникацию и сбор данных для юриста.`;
  if (seller && buyer) return `Продавца ведёт: ${seller}. Покупателя ведёт: ${buyer}. СПН отвечают за коммуникацию и сбор данных для юриста.`;
  if (seller) return `Продавца ведёт: ${seller}. СПН отвечает за коммуникацию и сбор данных для юриста.`;
  if (buyer) return `Покупателя ведёт: ${buyer}. СПН отвечает за коммуникацию и сбор данных для юриста.`;
  return 'СПН по клиентам не назначен. Перед юридической проверкой нужно назначить ответственного за коммуникацию.';
}

function card(x) {
  const id = encodeURIComponent(x.id || '');
  const q = x.lawyer_queue || 'other';
  const r = reviewSummary(x);
  const f = list(x.focus_reasons).join('; ') || 'критичных признаков не найдено';
  const problemBtn = n(x.problem_documents_count) ? `<a class="btn light" href="./deal-card-v2.html?id=${id}&test=${V}#problemDocsV2">Проблемы</a>` : '';
  const reviewBtn = n(r.reviews_count) ? `<a class="btn light" href="./deal-card-v2.html?id=${id}&test=${V}#reviews">Решения</a>` : '';
  return `<article class="deal-card">
    <div class="deal-head">
      <div>
        <div class="small">ID ${sid(x.id)} · приоритет ${n(x.priority_score)}</div>
        <div class="deal-title">${esc(x.title || 'Сделка без названия')}</div>
        <div class="small">${esc(x.address || 'Адрес не указан')} · ${esc(x.object_type || 'тип не указан')}</div>
      </div>
      ${riskPill(x.risk_level)}
    </div>
    <div class="status" style="margin:10px 0"><b>СПН по клиентам:</b> ${esc(spnClientLine(x))}</div>
    <div class="deal-meta">
      <div><span class="small">К задатку</span><b>${n(x.readiness_deposit)}%</b></div>
      <div><span class="small">К сделке</span><b>${n(x.readiness_deal)}%</b></div>
      <div><span class="small">Документы</span><b>${n(x.missing_documents_count)}</b></div>
      <div><span class="small">Не запрошено</span><b>${n(x.not_requested_documents_count)}</b></div>
      <div><span class="small">Запрошено</span><b>${n(x.requested_documents_count)}</b></div>
      <div><span class="small">Просрочено</span><b>${n(x.overdue_requested_documents_count)}</b></div>
      <div><span class="small">Проблемы</span><b>${n(x.problem_documents_count)}</b></div>
      <div><span class="small">Блокирует</span><b>${n(r.blocking_reviews_count)}</b></div>
    </div>
    <div style="margin:10px 0"><span class="pill ${cls(q)}">${esc(names[q] || q)}</span> <span class="pill">${esc(statusText(x.status))}</span></div>
    ${docPills(x)}
    ${reviewPills(x)}
    <div class="status ${q === 'urgent' || q === 'problem_docs' || q === 'overdue_docs' || n(r.blocking_reviews_count) ? 'error' : f ? 'warn' : 'ok'}"><b>Фокус:</b> ${esc(f)}</div>
    <p><b>Что сделать:</b><br>${esc(x.lawyer_next_action || x.next_action || 'Открыть карточку и проверить сделку.')}</p>
    <div class="actions" style="justify-content:flex-start">
      <a class="btn primary" href="./deal-card-v2.html?id=${id}&test=${V}#risks">Проверка</a>
      ${problemBtn}
      ${reviewBtn}
      <a class="btn light" href="./deal-card-v2.html?id=${id}&test=${V}#docs">Документы</a>
      <a class="btn light" href="./deal-card-v2.html?id=${id}&test=${V}#comments">Комментарии</a>
    </div>
  </article>`;
}

function render() {
  const shown = queue === 'all' ? items : items.filter((x) => x.lawyer_queue === queue);
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Кабинет юриста</h1><p>${esc(profile.full_name || 'Пользователь')} · ${esc(profile.email || '')}</p></section>
    <section class="card"><div class="actions" style="justify-content:flex-start"><a class="btn primary" href="./queue-v2.html?test=${V}">Кабинет юриста</a><a class="btn light" href="./deals-v2.html?filter=lawyer">Сделки</a><a class="btn light" href="./dashboard-v2.html?test=${V}">Рабочий стол</a><a class="btn light" href="./nav-v2.html?clean=1">Чистый вход</a></div></section>
    <section class="kpi-row">${metric('Всего', cnt('all'))}${metric('Стоп-факторы', cnt('urgent'), cnt('urgent') ? 'red' : 'green')}${metric('Проблемы документов', cnt('problem_docs'), cnt('problem_docs') ? 'red' : 'green')}${metric('Просрочка документов', cnt('overdue_docs'), cnt('overdue_docs') ? 'red' : 'green')}${metric('Блокирующие решения', blockingReviewsCount('all'), blockingReviewsCount('all') ? 'red' : 'green')}${metric('Повторно от СПН', cnt('resubmitted'), cnt('resubmitted') ? 'yellow' : 'green')}${metric('Документы', cnt('docs'), cnt('docs') ? 'yellow' : 'green')}${metric('Задатки', cnt('deposit'), 'blue')}</section>
    <section class="card"><h2>Очереди</h2><div class="actions" style="justify-content:flex-start">${Object.keys(names).map((k) => `<button class="btn ${queue === k ? 'primary' : 'light'}" data-q="${k}" type="button">${esc(names[k])} · ${cnt(k)}</button>`).join('')}</div><div class="status ok" style="margin-top:12px">Приоритет: стоп-факторы → блокирующие решения → проблемы документов → просрочка документов → повторно от СПН → документы → задатки → возвраты СПН → основной договор.</div></section>
    <section class="card"><div class="section-title"><div><h2>${esc(names[queue] || 'Очередь')}</h2><p class="muted">Сделки распределены сервером по юридическому фокусу и приоритету. Решения учитываются в серверной очереди; fallback summary нужен только для совместимости.</p></div><span class="pill blue">${shown.length}</span></div><div class="deal-list">${shown.map(card).join('') || '<div class="empty">В этой очереди сделок нет.</div>'}</div></section>
  </main>`;
  document.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => {
    queue = b.dataset.q || 'all';
    history.replaceState(null, '', `./queue-v2.html?test=${V}&queue=${queue}`);
    render();
  });
}

function login(msg = '') {
  app.innerHTML = '<main class="nav-v2-shell"><div id="authHost"></div></main>';
  renderAuthBox(document.getElementById('authHost'), async () => location.reload());
  const s = document.getElementById('authStatus');
  if (s && msg) { s.className = 'status warn'; s.textContent = msg; }
}

async function load() {
  if (!getCachedUser()?.id) return login('Сначала войдите в Навигатор.');
  app.innerHTML = '<main class="nav-v2-shell"><section class="hero"><h1>Кабинет юриста</h1><p>Загружаю очередь...</p></section><div class="status">Получаю данные.</div></main>';
  try {
    const d = await rpc('nav_v2_get_lawyer_queue', { p_limit: 100 }, 45000);
    const reviewData = await rpc('nav_v2_get_lawyer_review_summary', {}, 15000).catch(() => ({ items: [] }));
    const reviewsByDeal = new Map(list(reviewData?.items).map((r) => [r.deal_id, r]));
    profile = d?.profile || {};
    items = list(d?.items).map((x) => ({ ...x, review_summary: reviewsByDeal.get(x.id) || {} }));
    render();
  } catch (e) {
    app.innerHTML = `<main class="nav-v2-shell"><section class="hero"><h1>Кабинет юриста</h1></section><div class="status error">${esc(e.message || e)}</div></main>`;
  }
}

load();
