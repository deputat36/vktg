import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';
import {
  buildManagerConfirmedResult,
  managerResultCandidate,
  sortManagerConfirmedResults
} from './manager-confirmed-results-model-v2.js?v=20260715-01';
import { buildPrivacySafeUxReport } from './ux-metrics-model-v2.js?v=20260715-01';
import {
  clearPrivacySafeJourneyRecords,
  readPrivacySafeJourneyRecords
} from './ux-metrics-session-v2.js?v=20260715-01';

const app = document.getElementById('app');
const CARD_LIMIT = 40;
const CONCURRENCY = 4;
const WINDOW_DAYS = 7;
let report = null;
let busy = false;
let errorText = '';

function n(value) {
  return Number(value || 0);
}

function pct(value) {
  return `${Math.round(n(value) * 10) / 10}%`;
}

function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}

function toneForRate(value) {
  if (n(value) >= 70) return 'green';
  if (n(value) >= 40) return 'yellow';
  return 'red';
}

function localJourneySection(local) {
  const hasSample = n(local?.samples) > 0;
  return `<section class="card">
    <div class="section-title">
      <div><span class="role-home-eyebrow">Только текущая вкладка</span><h2>Путь до главного действия</h2><p class="muted">Считается порядковый номер первого клика по основной CTA. URL, текст кнопки, сделка и пользователь не сохраняются.</p></div>
      <span class="pill ${hasSample ? 'blue' : 'yellow'}">наблюдений: ${n(local?.samples)}</span>
    </div>
    <div class="kpi-row">
      ${metric('Медиана кликов', local?.medianClicks ?? '—', hasSample && n(local?.medianClicks) <= 1 ? 'green' : hasSample ? 'yellow' : '')}
      ${metric('Сразу за 1 клик', pct(local?.oneClickRatePercent), toneForRate(local?.oneClickRatePercent))}
      ${metric('Dashboard', local?.byPage?.dashboard?.samples || 0, 'blue')}
      ${metric('Список / карточка / manager', n(local?.byPage?.deals?.samples) + n(local?.byPage?.['deal-card']?.samples) + n(local?.byPage?.manager?.samples), 'blue')}
    </div>
    <div class="status ${hasSample ? 'ok' : 'warn'}">${hasSample ? 'Это локальная UX-выборка текущей вкладки браузера. Она не является командной статистикой и никуда не отправляется.' : 'Локальная выборка пока пуста. Она появится после первого клика по главному действию на dashboard, списке, карточке или manager.'}</div>
    <div class="actions" style="justify-content:flex-start"><button id="clearUxJourney" class="btn light" type="button">Очистить локальную выборку</button></div>
  </section>`;
}

function serverOutcomeSection(server, sampling) {
  const hasCards = n(server?.sampledDeals) > 0;
  return `<section class="card">
    <div class="section-title">
      <div><span class="role-home-eyebrow">Server events + текущее состояние</span><h2>Подтверждённый результат и цикл СПН</h2><p class="muted">Клик не считается результатом. Результат засчитывается только при совпадении audit-события с текущим состоянием задачи, документа, риска или сделки.</p></div>
      <span class="pill ${hasCards ? 'green' : 'yellow'}">карточек: ${n(server?.sampledDeals)} / ${n(sampling?.card_limit)}</span>
    </div>
    <div class="kpi-row">
      ${metric('С результатом', `${n(server?.confirmedResults)} · ${pct(server?.confirmedResultRatePercent)}`, toneForRate(server?.confirmedResultRatePercent))}
      ${metric('Возвраты СПН', n(server?.spnReturns), n(server?.spnReturns) ? 'yellow' : 'green')}
      ${metric('Повторно отправлено', n(server?.reworkSubmissions), 'blue')}
      ${metric('Повторная проверка', server?.medianRecheckLabel || '—', n(server?.completedRechecks) ? 'green' : 'yellow')}
    </div>
    <div class="list">
      <div class="list-item"><b>Завершённые повторные проверки</b><span>${n(server?.completedRechecks)}</span></div>
      <div class="list-item"><b>Ожидают решения после повторной отправки</b><span>${n(server?.pendingRechecks)}</span></div>
      <div class="list-item"><b>Окно наблюдения</b><span>${n(server?.windowDays)} дней</span></div>
      <div class="list-item"><b>Выборка</b><span>Только видимые сделки с недавней активностью, загруженные существующими read RPC.</span></div>
    </div>
    <div class="status warn">Показатель результата — доля загруженных карточек, где найден свежий подтверждённый результат. Это не KPI сотрудника и не рейтинг команды.</div>
  </section>`;
}

function privacySection(privacy) {
  const safe = privacy && Object.values(privacy).every((value) => value === false || value === true);
  return `<details class="card" ${safe ? '' : 'open'}>
    <summary><b>Что именно не собирается</b><span class="muted">Проверяемые ограничения privacy-контракта</span></summary>
    <div class="list" style="margin-top:14px">
      <div class="list-item"><b>Нет персональных данных</b><span>ФИО, email, телефон и роль конкретного сотрудника не попадают в отчёт.</span></div>
      <div class="list-item"><b>Нет данных сделки</b><span>Не сохраняются UUID, адрес, стороны, комментарии, документы и содержимое кнопок.</span></div>
      <div class="list-item"><b>Нет telemetry endpoint</b><span>События кликов не отправляются по сети и не записываются в Supabase.</span></div>
      <div class="list-item"><b>Только sessionStorage</b><span>Локальные наблюдения живут в текущей вкладке и содержат только экран, viewport, число кликов и временной диапазон.</span></div>
    </div>
  </details>`;
}

function draw() {
  const local = report?.local_journey || {};
  const server = report?.server_outcomes || {};
  const sampling = report?.sampling || {};
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><span class="role-home-eyebrow">Privacy-safe measurement</span><h1>UX-метрики Навигатора</h1><p>Проверяем, сокращается ли путь до действия и превращаются ли действия в подтверждённый результат — без персональных и сделочных данных.</p><div class="actions" style="justify-content:flex-start"><a class="btn light" href="./manager-v2.html">Вернуться к контролю</a>${report ? '<button id="downloadUxReport" class="btn primary" type="button">Скачать агрегированный JSON</button>' : ''}</div></section>
    ${errorText ? `<div class="status error" role="alert">${esc(errorText)}</div>` : ''}
    ${busy ? '<section class="card"><div class="status" role="status">Считаю агрегаты по существующим server events…</div></section>' : ''}
    ${report ? `${localJourneySection(local)}${serverOutcomeSection(server, sampling)}${privacySection(report.privacy)}` : ''}
  </main>`;
  document.getElementById('clearUxJourney')?.addEventListener('click', () => {
    clearPrivacySafeJourneyRecords();
    if (report) report = buildPrivacySafeUxReport({ ...report.__source, journeyRecords: readPrivacySafeJourneyRecords() });
    draw();
  });
  document.getElementById('downloadUxReport')?.addEventListener('click', downloadReport);
}

function downloadReport() {
  if (!report) return;
  const clean = { ...report };
  delete clean.__source;
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'navigator_v2_privacy_safe_ux_metrics.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), source.length) }, () => run()));
  return results;
}

async function load() {
  if (busy) return;
  busy = true;
  errorText = '';
  draw();
  try {
    const preview = await rpc('nav_v2_get_operational_readiness_preview', { p_limit: 100 }, 20000);
    if (!['owner', 'admin', 'manager'].includes(preview?.profile?.role)) throw new Error('UX-метрики доступны владельцу, администратору и менеджеру.');
    const now = new Date();
    const candidates = (Array.isArray(preview?.items) ? preview.items : [])
      .filter((item) => managerResultCandidate(item, { now, maxAgeDays: WINDOW_DAYS }))
      .slice(0, CARD_LIMIT);
    const loaded = await mapWithConcurrency(candidates, CONCURRENCY, async (item) => {
      const cardData = await rpc('nav_v2_get_deal_card', { p_deal_id: item.deal_id }, 20000);
      const result = buildManagerConfirmedResult(item, cardData, preview.profile, {
        now,
        maxAgeDays: WINDOW_DAYS,
        timeZone: 'Europe/Moscow'
      });
      return { cardData, result };
    });
    const successful = loaded.filter((entry) => entry?.ok).map((entry) => entry.value);
    const failures = loaded.length - successful.length;
    const source = {
      cardSamples: successful.map((item) => item.cardData),
      confirmedResults: sortManagerConfirmedResults(successful.map((item) => item.result)),
      now,
      windowDays: WINDOW_DAYS,
      sampleLimit: CARD_LIMIT
    };
    report = buildPrivacySafeUxReport({ ...source, journeyRecords: readPrivacySafeJourneyRecords() });
    Object.defineProperty(report, '__source', { value: source, enumerable: false, configurable: true });
    if (failures) errorText = `Не удалось прочитать карточки: ${failures}. Агрегаты построены по остальной выборке.`;
  } catch (error) {
    report = null;
    errorText = error.message || String(error);
  } finally {
    busy = false;
    draw();
  }
}

async function init() {
  setupTop('manager');
  if (!getCachedUser()) return renderAuthBox(app, async () => location.reload());
  await load();
}

init();
