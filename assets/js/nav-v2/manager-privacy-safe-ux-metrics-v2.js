import { rpc, esc } from './supabase-v2.js';
import { readPrivacySafeUxSessionSummary } from './privacy-safe-ux-metrics-v2.js?v=20260715-01';
import { buildPrivacySafeServerUxSample, summarizePrivacySafeServerUx } from './privacy-safe-ux-server-model-v2.js?v=20260715-01';
import { buildDealCompletionEvidence } from './deal-card-completion-evidence-model-v2.js?v=20260715-01';

const PANEL_ID = 'managerPrivacySafeUxMetrics';
const MAX_CARDS = 40;
const CONCURRENCY = 4;
let serverSummary = null;
let loading = false;
let loadError = '';

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestamp(value) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function recentCandidate(item, now = Date.now()) {
  if (item?.status === 'need_info' || item?.status === 'need_lawyer') return true;
  const at = timestamp(item?.last_activity_at);
  return Boolean(at) && now - at <= 7 * 24 * 60 * 60 * 1000;
}

function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}

function hoursLabel(value) {
  if (value === null || value === undefined) return 'нет данных';
  if (value < 1) return `${Math.max(1, Math.round(value * 60))} мин`;
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ч`;
}

function clicksLabel(value) {
  return value === null || value === undefined ? 'ещё нет' : value.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

function panelBody() {
  const session = readPrivacySafeUxSessionSummary();
  if (loading) return '<div class="status">Считаю агрегаты из серверных событий за семь дней…</div>';
  if (loadError) return `<div class="status warn" role="status">${esc(loadError)}</div>`;
  if (!serverSummary) return '<div class="status">Расчёт запускается только после раскрытия блока.</div>';

  return `<div class="kpi-row manager-secondary-grid">
    ${metric('Подтверждённые результаты', serverSummary.confirmedResults, serverSummary.confirmedResults ? 'green' : 'blue')}
    ${metric('Возвраты СПН', serverSummary.reworkReturns, serverSummary.reworkReturns ? 'yellow' : 'green')}
    ${metric('Повторные отправки', serverSummary.reworkSubmissions, serverSummary.reworkSubmissions ? 'blue' : '')}
    ${metric('Проверки завершены', serverSummary.completedRechecks, serverSummary.completedRechecks ? 'green' : 'blue')}
    ${metric('Медиана повторной проверки', hoursLabel(serverSummary.medianReviewHours), serverSummary.medianReviewHours !== null ? 'blue' : '')}
    ${metric('Кликов до главного действия', clicksLabel(session.medianClicksToPrimary), session.primaryActionCount ? 'green' : 'blue')}
  </div>
  <div class="status ok"><b>Privacy-safe:</b> серверная часть использует только типы и время уже существующих audit-событий. Локальный путь хранится только в текущей вкладке и не отправляется на сервер.</div>
  <p class="muted">Проверено карточек: ${serverSummary.checkedDeals}. Период: ${serverSummary.maxAgeDays} дней. Локальных главных действий в этой вкладке: ${session.primaryActionCount}. В метриках нет UUID сделок, адресов, ФИО, телефонов, email, комментариев или содержимого документов.</p>`;
}

function panelHtml() {
  return `<details id="${PANEL_ID}" class="card manager-ux-metrics">
    <summary><b>UX-показатели</b><span class="muted">Путь до действия, результаты и цикл доработки СПН</span></summary>
    <div class="manager-ux-metrics-body">${panelBody()}</div>
  </details>`;
}

function renderPanelBody() {
  const body = document.querySelector(`#${PANEL_ID} .manager-ux-metrics-body`);
  if (body) body.innerHTML = panelBody();
}

async function mapWithConcurrency(values, limit, worker) {
  const source = Array.isArray(values) ? values : [];
  const results = new Array(source.length);
  let cursor = 0;
  async function run() {
    while (cursor < source.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { ok: true, value: await worker(source[index]) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), source.length || 1) }, () => run()));
  return results;
}

async function loadMetrics() {
  if (loading || serverSummary) return;
  loading = true;
  loadError = '';
  renderPanelBody();
  try {
    const now = new Date();
    const preview = await rpc('nav_v2_get_operational_readiness_preview', { p_limit: 100 }, 20000);
    const candidates = (Array.isArray(preview?.items) ? preview.items : [])
      .filter((item) => recentCandidate(item, now.getTime()))
      .slice(0, MAX_CARDS);
    const loaded = await mapWithConcurrency(candidates, CONCURRENCY, async (item) => {
      const cardData = await rpc('nav_v2_get_deal_card', { p_deal_id: item.deal_id }, 20000);
      return {
        sample: buildPrivacySafeServerUxSample(cardData, { now, maxAgeDays: 7 }),
        confirmed: buildDealCompletionEvidence(cardData, preview.profile, { now, maxAgeDays: 7 }).visible
      };
    });
    const successful = loaded.filter((entry) => entry?.ok).map((entry) => entry.value);
    serverSummary = summarizePrivacySafeServerUx(successful.map((entry) => entry.sample), {
      maxAgeDays: 7,
      confirmedResultsCount: successful.filter((entry) => entry.confirmed).length
    });
    const failures = loaded.filter((entry) => !entry?.ok).length;
    if (failures) loadError = `Часть карточек не удалось проверить: ${failures}. Показаны агрегаты по доступной выборке.`;
  } catch (error) {
    loadError = error?.message || String(error);
  } finally {
    loading = false;
    renderPanelBody();
  }
}

function ensurePanel() {
  if (document.getElementById(PANEL_ID)) return;
  const anchor = document.querySelector('.manager-readiness-summary') || document.querySelector('.manager-queue');
  if (!anchor) return;
  anchor.insertAdjacentHTML('beforebegin', panelHtml());
  const panel = document.getElementById(PANEL_ID);
  panel?.addEventListener('toggle', () => {
    if (panel.open) void loadMetrics();
  });
}

[0, 300, 800, 1500, 3000, 6000].forEach((delay) => setTimeout(ensurePanel, delay));
document.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('[data-filter], [data-confirmed-filter]')) {
    setTimeout(ensurePanel, 0);
  }
}, true);
