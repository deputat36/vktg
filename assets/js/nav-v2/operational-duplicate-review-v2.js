import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';
import {
  buildExactDuplicateOwnerDecisionPackage,
  createExactDuplicateDecisionState,
  duplicateResolutionOptions,
  summarizeExactDuplicateOwnerDecision,
  updateExactDuplicateDecisionState,
  validateExactDuplicateReviewReport
} from './operational-duplicate-review-model-v2.js';

const app = document.getElementById('app');
let report = null;
let validation = null;
let decisionState = {};
let busy = false;
let errorText = '';
let noticeText = '';
let noticeTone = 'info';

function n(value) { return Number(value || 0); }
function profile() { return report?.profile || {}; }
function pack() { return report?.exact_duplicate_review_pack || {}; }
function canView() { return ['owner', 'admin', 'manager'].includes(profile().role); }
function canDecide() { return ['owner', 'admin'].includes(profile().role); }

function fmtDateTime(value) {
  if (!value) return 'Не зафиксировано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}

function boolPill(value) {
  return `<span class="pill ${value ? 'green' : 'red'}">${value ? 'совпадает' : 'различается'}</span>`;
}

function errorList(values, emptyText) {
  const rows = Array.isArray(values) ? values.filter(Boolean) : [];
  return rows.length ? `<ul>${rows.map((value) => `<li>${esc(value)}</li>`).join('')}</ul>` : `<span class="muted">${esc(emptyText)}</span>`;
}

function currentDecision(group) {
  return decisionState?.[group.group_key] || {};
}

function decisionSummaryRow(groupKey) {
  const summary = summarizeExactDuplicateOwnerDecision(validation, decisionState, profile());
  return summary.decision_rows.find((row) => row.group_key === groupKey) || { valid: false, errors: [] };
}

function resolutionSelect(current, disabled) {
  return `<select data-duplicate-field="resolution"${disabled ? ' disabled' : ''}>
    <option value="">Выберите способ обработки</option>
    ${duplicateResolutionOptions().map((item) => `<option value="${esc(item.value)}"${current === item.value ? ' selected' : ''}>${esc(item.label)}</option>`).join('')}
  </select>`;
}

function entityComparison(group) {
  const comparison = group.entity_comparison || {};
  const labels = {
    deal: 'Карточка',
    tasks: 'Задачи',
    risks: 'Риски',
    documents: 'Документы',
    events: 'События',
    comments: 'Комментарии',
    reviews: 'Проверки',
    participants: 'Участники',
    expenses: 'Расходы'
  };
  return `<div class="task-review-facts">${Object.entries(labels).map(([key, label]) => `<div><span class="small">${esc(label)}</span>${boolPill(comparison[key] === true)}</div>`).join('')}</div>`;
}

function dealCard(deal, suggestedId) {
  const counts = deal.counts || {};
  return `<article class="list-item">
    <div class="section-title">
      <div><h4>${esc(deal.deal_title || deal.address || deal.deal_id)}</h4><p class="muted"><code>${esc(deal.deal_id)}</code></p></div>
      <span class="pill ${deal.deal_id === suggestedId ? 'blue' : 'gray'}">${deal.deal_id === suggestedId ? 'Ранняя карточка' : 'Вторая карточка'}</span>
    </div>
    <div class="task-review-facts">
      <div><span class="small">Создана</span><b>${esc(fmtDateTime(deal.created_at))}</b></div>
      <div><span class="small">Последняя активность</span><b>${esc(fmtDateTime(deal.latest_activity_at))}</b></div>
      <div><span class="small">Статус</span><b>${esc(deal.status || '—')}</b></div>
      <div><span class="small">Готовность</span><b>${n(deal.readiness_deposit)}% / ${n(deal.readiness_deal)}%</b></div>
      <div><span class="small">Задачи</span><b>${n(counts.tasks)}</b><span class="muted">выполнено ${n(counts.completed_tasks)}</span></div>
      <div><span class="small">Риски</span><b>${n(counts.risks)}</b><span class="muted">закрыто ${n(counts.resolved_risks)}</span></div>
      <div><span class="small">Документы</span><b>${n(counts.documents)}</b><span class="muted">закрыто ${n(counts.resolved_documents)}</span></div>
      <div><span class="small">События</span><b>${n(counts.events)}</b></div>
      <div><span class="small">Комментарии / проверки</span><b>${n(counts.comments)} / ${n(counts.reviews)}</b></div>
      <div><span class="small">Участники / расходы</span><b>${n(counts.participants)} / ${n(counts.expenses)}</b></div>
    </div>
    <div class="status info"><b>Следующий шаг:</b> ${esc(deal.next_action || 'Не указан')}</div>
    <div class="actions" style="justify-content:flex-start"><a class="btn light" href="${esc(deal.card_url || `./deal-card-v2.html?id=${deal.deal_id}`)}">Открыть карточку</a></div>
  </article>`;
}

function decisionBlock(group, index) {
  if (!canDecide()) return '<div class="status info"><b>Режим просмотра.</b> Решение по canonical deal доступно только owner/admin.</div>';
  const current = currentDecision(group);
  const checked = decisionSummaryRow(group.group_key);
  const disabled = false;
  return `<fieldset class="task-review-contract" style="margin-top:16px" data-duplicate-group="${esc(group.group_key)}">
    <legend><b>Решение владельца</b></legend>
    <div class="task-review-facts">
      <div>
        <label class="small" for="duplicateDecisionStatus-${index}">Статус решения</label>
        <select id="duplicateDecisionStatus-${index}" data-duplicate-field="decision_status">
          <option value="">Выберите статус</option>
          <option value="confirmed"${current.decision_status === 'confirmed' ? ' selected' : ''}>Подтверждено</option>
          <option value="needs_review"${current.decision_status === 'needs_review' ? ' selected' : ''}>Нужно дополнительное изучение</option>
        </select>
      </div>
      <div>
        <label class="small" for="duplicateCanonical-${index}">Каноническая карточка</label>
        <select id="duplicateCanonical-${index}" data-duplicate-field="canonical_deal_id">
          <option value="">Не выбрана</option>
          ${(group.deals || []).map((deal) => `<option value="${esc(deal.deal_id)}"${current.canonical_deal_id === deal.deal_id ? ' selected' : ''}>${esc(deal.deal_id)} · ${esc(deal.address || deal.deal_title || 'без адреса')}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="small">Способ обработки</label>
        ${resolutionSelect(current.resolution || '', disabled)}
      </div>
    </div>
    <label class="small" for="duplicateTransferNote-${index}" style="display:block;margin-top:12px">Что переносить или почему перенос не нужен</label>
    <textarea id="duplicateTransferNote-${index}" data-duplicate-field="transfer_note" rows="3" maxlength="1500" placeholder="Уникальные комментарии, задачи, документы, evidence или подтверждение полного совпадения">${esc(current.transfer_note || '')}</textarea>
    <label class="small" for="duplicateDecisionReason-${index}" style="display:block;margin-top:12px">Основание решения</label>
    <textarea id="duplicateDecisionReason-${index}" data-duplicate-field="decision_reason" rows="3" maxlength="1500" placeholder="Почему выбрана именно эта карточка и способ обработки">${esc(current.decision_reason || '')}</textarea>
    <div class="status ${checked.valid ? 'ok' : 'warn'}" style="margin-top:12px"><b>${checked.valid ? 'Решение заполнено.' : 'Решение не готово.'}</b> Даже подтверждённый пакет не разрешает cleanup.</div>
    ${checked.errors?.length ? `<details open><summary>Что исправить</summary>${errorList(checked.errors, 'Ошибок нет.')}</details>` : ''}
  </fieldset>`;
}

function groupCard(group, index) {
  return `<section class="card">
    <div class="section-title">
      <div><span class="role-home-eyebrow">Группа ${index + 1}</span><h2>${esc(group.deals?.[0]?.address || group.deals?.[0]?.deal_title || group.group_key)}</h2><p class="muted">Создатель: ${esc(group.created_by_name || group.created_by || 'не указан')} · интервал ${Math.round(n(group.interval_seconds))} сек.</p></div>
      <span class="pill ${group.all_semantic_equal ? 'green' : 'red'}">${group.all_semantic_equal ? 'Семантически совпадают' : 'Есть расхождения'}</span>
    </div>
    <div class="status warn"><b>Рекомендация не является выбором.</b> Ранняя карточка <code>${esc(group.suggested_canonical_deal_id || '—')}</code> предложена только как отправная точка.</div>
    ${entityComparison(group)}
    <details class="task-review-contract" open><summary>Причины ручной проверки</summary>${errorList(group.manual_review_reasons, 'Причины не сформированы.')}</details>
    <div class="list">${(group.deals || []).map((deal) => dealCard(deal, group.suggested_canonical_deal_id)).join('')}</div>
    ${decisionBlock(group, index)}
  </section>`;
}

function decisionSummaryBlock() {
  if (!validation?.valid) return '';
  const summary = summarizeExactDuplicateOwnerDecision(validation, decisionState, profile());
  return `<section class="card">
    <div class="section-title"><div><h2>Owner decision package</h2><p class="muted">Решение формируется только локально и не выполняет очистку.</p></div><span class="pill ${summary.decision_package_ready ? 'green' : 'yellow'}">${summary.decision_package_ready ? 'Пакет готов' : 'Нужно заполнение'}</span></div>
    <div class="kpi-row task-review-metrics">
      ${metric('Групп', summary.groups, 'blue')}
      ${metric('Подтверждено', summary.confirmed, summary.confirmed ? 'green' : 'yellow')}
      ${metric('Нужно изучить', summary.needs_review, summary.needs_review ? 'yellow' : 'green')}
      ${metric('Ошибок', summary.invalid, summary.invalid ? 'red' : 'green')}
      ${metric('Cleanup-кандидатов', summary.cleanup_candidate_groups, 'gray')}
    </div>
    <div class="status warn"><b>Граница.</b> <code>cleanup_authorized=false</code>. После этого файла всё равно нужны fresh server revalidation, pre/post snapshot, audit event и выполнение одной группы за раз.</div>
    ${canDecide() ? `<div class="actions" style="justify-content:flex-start"><button class="btn primary" type="button" id="downloadDuplicateDecision">Скачать decision JSON</button></div>` : ''}
  </section>`;
}

function draw() {
  const summary = pack().summary || {};
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero task-review-hero"><span class="role-home-eyebrow">Исторические дубли</span><h1>Сравнение карточек перед ручным решением</h1><p>Система сравнивает текущую карточку и дочерние сущности. Автоматический выбор, перенос, архивирование и удаление запрещены.</p></section>
    ${errorText ? `<div class="status error" role="alert">${esc(errorText)}</div>` : ''}
    ${noticeText ? `<div class="status ${noticeTone}" role="status">${esc(noticeText)}</div>` : ''}
    ${report ? `<section class="card"><div class="kpi-row task-review-metrics">
      ${metric('Групп', n(summary.groups), 'blue')}
      ${metric('Карточек', n(summary.deals), 'blue')}
      ${metric('Полностью совпадают', n(summary.exact_semantic_groups), 'green')}
      ${metric('Разошлись', n(summary.diverged_groups), n(summary.diverged_groups) ? 'red' : 'green')}
      ${metric('С комментариями/проверками', n(summary.groups_with_comments_or_reviews), n(summary.groups_with_comments_or_reviews) ? 'yellow' : 'green')}
    </div><div class="status ok"><b>Read-only источник загружен.</b> Report v${n(report.report_version)}, review v${n(pack().review_version)}, сформирован ${esc(fmtDateTime(pack().generated_at))}.</div></section>
    ${decisionSummaryBlock()}
    ${(validation?.groups || []).map(groupCard).join('')}
    <section class="card"><div class="actions" style="justify-content:flex-start"><a class="btn light" href="./operational-adoption-v2.html">Вернуться к отчёту</a></div></section>` : `<section class="card"><p role="status" aria-live="polite">${busy ? 'Загружаю read-only сравнение…' : 'Сравнение не загружено.'}</p></section>`}
  </main>`;

  document.querySelectorAll('[data-duplicate-group]').forEach((fieldset) => {
    const groupKey = fieldset.dataset.duplicateGroup;
    fieldset.querySelectorAll('[data-duplicate-field]').forEach((field) => {
      field.addEventListener('change', () => {
        decisionState = updateExactDuplicateDecisionState(decisionState, groupKey, { [field.dataset.duplicateField]: field.value });
        noticeText = '';
        draw();
      });
    });
  });

  document.getElementById('downloadDuplicateDecision')?.addEventListener('click', () => {
    const payload = buildExactDuplicateOwnerDecisionPackage(validation, decisionState, profile(), {
      reviewGeneratedAt: pack().generated_at
    });
    downloadJson(payload, `navigator-v2-exact-duplicate-owner-decision-${dateStamp()}.json`);
    noticeTone = payload.summary.decision_package_ready ? 'ok' : 'warn';
    noticeText = payload.summary.decision_package_ready
      ? 'Decision package скачан. Он не разрешает cleanup и не меняет Supabase.'
      : 'Скачан черновой пакет с decision_package_ready=false.';
    draw();
  });
}

function dateStamp() { return new Date().toISOString().slice(0, 10); }
function downloadJson(payload, filename) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function loadReport() {
  if (busy) return;
  busy = true;
  errorText = '';
  draw();
  try {
    report = await rpc('nav_v2_get_operational_adoption_report', { p_days: 30, p_limit: 500 }, 30000);
    if (!canView()) throw new Error('Разбор дублей доступен владельцу, администратору и менеджеру.');
    validation = validateExactDuplicateReviewReport(report);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    decisionState = canDecide() ? createExactDuplicateDecisionState(validation) : {};
  } catch (error) {
    report = null;
    validation = null;
    decisionState = {};
    errorText = error.message || String(error);
  } finally {
    busy = false;
    draw();
  }
}

const user = getCachedUser();
setupTop({ user, title: 'Разбор дублей', subtitle: 'Read-only comparison · owner decision без mutation' });
if (!user) {
  renderAuthBox(app, { title: 'Нужен вход', text: 'Войдите под владельцем, администратором или менеджером.' });
} else {
  void loadReport();
}
