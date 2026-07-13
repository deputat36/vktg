import { setupTop, getCachedUser, renderAuthBox, rpc, esc, statusText } from './supabase-v2.js';

const app = document.getElementById('app');
const DRAFT_KEY_PREFIX = 'nav-v2-responsibility-confirmation-v1';
let report = null;
let busy = false;
let errorText = '';
let draft = emptyDraft();

function n(value) { return Number(value || 0); }
function remediationPlan() { return report?.manager_source_remediation_plan || {}; }
function remediationSummary() { return remediationPlan().summary || {}; }
function remediationItems() { return Array.isArray(remediationPlan().items) ? remediationPlan().items : []; }
function responsibilityEvidence() { return report?.responsibility_evidence || {}; }
function evidenceSummary() { return responsibilityEvidence().summary || {}; }
function evidenceItems() { return Array.isArray(responsibilityEvidence().items) ? responsibilityEvidence().items : []; }
function confirmationContext() { return report?.responsibility_confirmation_context || {}; }
function activeSpnOptions() { return Array.isArray(confirmationContext().active_spn_options) ? confirmationContext().active_spn_options : []; }
function managerOptions() { return Array.isArray(confirmationContext().manager_options) ? confirmationContext().manager_options : []; }
function decisionStatuses() {
  const rows = Array.isArray(confirmationContext().decision_statuses) ? confirmationContext().decision_statuses : [];
  return rows.length ? rows : [
    { code: 'not_reviewed', label: 'Не проверено' },
    { code: 'confirmed', label: 'Подтверждено владельцем' },
    { code: 'needs_clarification', label: 'Нужно уточнение' },
    { code: 'keep_current', label: 'Оставить текущее значение' }
  ];
}
function allowed() { return ['owner', 'admin', 'manager'].includes(report?.profile?.role); }

function emptyDraft() {
  return {
    schema_version: 1,
    updated_at: null,
    source_report_version: null,
    source_generated_at: null,
    deal_decisions: {},
    manager_decisions: {}
  };
}

function draftKey() {
  const uid = getCachedUser()?.id || 'unknown-user';
  return `${DRAFT_KEY_PREFIX}:${uid}`;
}

function loadDraft() {
  try {
    const value = localStorage.getItem(draftKey());
    if (!value) return emptyDraft();
    const parsed = JSON.parse(value);
    if (!parsed || parsed.schema_version !== 1) return emptyDraft();
    return {
      ...emptyDraft(),
      ...parsed,
      deal_decisions: parsed.deal_decisions && typeof parsed.deal_decisions === 'object' ? parsed.deal_decisions : {},
      manager_decisions: parsed.manager_decisions && typeof parsed.manager_decisions === 'object' ? parsed.manager_decisions : {}
    };
  } catch (error) {
    console.warn('Не удалось прочитать локальный черновик подтверждений', error);
    return emptyDraft();
  }
}

function saveDraft() {
  draft.updated_at = new Date().toISOString();
  draft.source_report_version = report?.report_version || null;
  draft.source_generated_at = report?.generated_at || null;
  try {
    localStorage.setItem(draftKey(), JSON.stringify(draft));
    setDraftStatus(`Локальный черновик сохранён ${fmtDateTime(draft.updated_at)}. В Supabase ничего не записано.`, 'ok');
  } catch (error) {
    setDraftStatus(`Не удалось сохранить локальный черновик: ${error.message || error}`, 'error');
  }
}

function fmtDateTime(value) {
  if (!value) return 'Не зафиксировано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

function metric(label, value, tone = '', id = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b${id ? ` id="${esc(id)}"` : ''}>${esc(String(value))}</b></div>`;
}

function priorityTone(priority) {
  return ({ urgent: 'red', high: 'yellow', normal: 'blue' })[priority] || 'gray';
}

function evidenceTone(state) {
  return ({
    strong_single_evidence: 'blue',
    multiple_candidates: 'red',
    weak_single_evidence: 'yellow',
    no_active_spn_evidence: 'gray'
  })[state] || 'gray';
}

function decisionTone(status) {
  return ({ confirmed: 'green', needs_clarification: 'yellow', keep_current: 'blue', not_reviewed: 'gray' })[status] || 'gray';
}

function signalLabel(code) {
  return ({
    deal_creator: 'Создал сделку',
    participant: 'Участник сделки',
    event_actor: 'Автор событий',
    task_creator: 'Создавал задачи',
    task_assignee: 'Исполнитель задач',
    task_completer: 'Завершал задачи',
    document_assignee: 'Ответственный за документы',
    document_checker: 'Проверял документы'
  })[code] || code;
}

function statusLabel(code) {
  return decisionStatuses().find((item) => item.code === code)?.label || code || 'Не проверено';
}

function selectStatusOptions(selected) {
  return decisionStatuses().map((item) => `<option value="${esc(item.code)}" ${selected === item.code ? 'selected' : ''}>${esc(item.label)}</option>`).join('');
}

function spnSelectOptions(selected) {
  return `<option value="">Не выбран</option>${activeSpnOptions().map((item) => `<option value="${esc(item.id)}" ${selected === item.id ? 'selected' : ''}>${esc(item.full_name || item.email || item.id)}</option>`).join('')}`;
}

function managerSelectOptions(selected) {
  return `<option value="">Не выбран</option>${managerOptions().map((item) => `<option value="${esc(item.id)}" ${selected === item.id ? 'selected' : ''}>${esc(item.full_name || item.email || item.id)} · ${esc(item.role || '')}</option>`).join('')}`;
}

function findSpn(id) { return activeSpnOptions().find((item) => item.id === id) || null; }
function findManager(id) { return managerOptions().find((item) => item.id === id) || null; }

function dealDecision(dealId) {
  return {
    status: 'not_reviewed',
    seller_spn_id: '',
    buyer_spn_id: '',
    note: '',
    ...(draft.deal_decisions?.[dealId] || {})
  };
}

function managerDecision(spnId) {
  return {
    status: 'not_reviewed',
    manager_id: '',
    note: '',
    ...(draft.manager_decisions?.[spnId] || {})
  };
}

function isMeaningfulDealDecision(item) {
  return item && (item.status !== 'not_reviewed' || item.seller_spn_id || item.buyer_spn_id || String(item.note || '').trim());
}

function isMeaningfulManagerDecision(item) {
  return item && (item.status !== 'not_reviewed' || item.manager_id || String(item.note || '').trim());
}

function draftCounts() {
  const dealRows = Object.values(draft.deal_decisions || {}).filter(isMeaningfulDealDecision);
  const managerRows = Object.values(draft.manager_decisions || {}).filter(isMeaningfulManagerDecision);
  return {
    deals: dealRows.length,
    confirmedDeals: dealRows.filter((item) => item.status === 'confirmed').length,
    clarificationDeals: dealRows.filter((item) => item.status === 'needs_clarification').length,
    managerProfiles: managerRows.length,
    confirmedManagers: managerRows.filter((item) => item.status === 'confirmed').length
  };
}

function setDraftStatus(text, tone = 'info') {
  const element = document.getElementById('draftStatus');
  if (!element) return;
  element.className = `status ${tone}`;
  element.textContent = text;
}

function refreshDraftSummary() {
  const counts = draftCounts();
  const values = {
    draftDealCount: counts.deals,
    draftConfirmedDealCount: counts.confirmedDeals,
    draftClarificationCount: counts.clarificationDeals,
    draftManagerCount: counts.managerProfiles,
    draftConfirmedManagerCount: counts.confirmedManagers
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  });
}

function previewDeals(item) {
  const deals = Array.isArray(item.preview_deals) ? item.preview_deals : [];
  if (!deals.length) return '<div class="empty">Примеры сделок не переданы.</div>';
  return `<div class="list">${deals.map((deal) => `<article class="list-item">
    <div class="section-title">
      <div>
        <h4>${esc(deal.deal_title || deal.address || 'Сделка')}</h4>
        <p class="muted">Поле: <code>${esc(deal.side_field || item.target_field || 'не определено')}</code></p>
      </div>
      <a class="btn" href="${esc(deal.card_url || `./deal-card-v2.html?id=${encodeURIComponent(deal.deal_id || '')}`)}">Открыть</a>
    </div>
  </article>`).join('')}</div>`;
}

function remediationCard(item) {
  return `<article class="list-item task-review-card">
    <div class="section-title task-review-head">
      <div>
        <div class="task-review-labels">
          <span class="pill ${priorityTone(item.priority)}">${esc(item.priority_label || item.priority || 'Приоритет')}</span>
          <span class="pill gray">Ручное исправление</span>
        </div>
        <h3>${esc(item.action_title || item.remediation_label || 'Исправить источник')}</h3>
        <p class="muted">${esc(item.remediation_label || 'Источник требует проверки')}</p>
      </div>
      <span class="pill ${item.mutation_available ? 'red' : 'green'}">${item.mutation_available ? 'Изменение доступно' : 'Автоисправление отключено'}</span>
    </div>
    <div class="task-review-facts">
      <div><span class="small">Целевое поле</span><b><code>${esc(item.target_field || 'не определено')}</code></b></div>
      <div><span class="small">Текущий профиль</span><b>${esc(item.current_profile_name || 'Не указан')}</b><span class="muted">Роль: ${esc(item.current_profile_role || 'нет профиля')}</span></div>
      <div><span class="small">Затронуто сделок</span><b>${n(item.affected_deals)}</b><span class="muted">Сторон сделки: ${n(item.affected_deal_sides)}</span></div>
    </div>
    <div class="status warn"><b>Безопасное действие:</b> ${esc(item.safe_action || 'Требуется ручная проверка')}</div>
    <details class="task-review-contract"><summary>Затронутые сделки</summary>${previewDeals(item)}${n(item.more_deals_count) ? `<p class="muted">Ещё сделок вне preview: ${n(item.more_deals_count)}</p>` : ''}</details>
  </article>`;
}

function signalBreakdown(candidate) {
  const breakdown = candidate?.signal_breakdown && typeof candidate.signal_breakdown === 'object'
    ? candidate.signal_breakdown
    : {};
  const rows = Object.entries(breakdown);
  if (!rows.length) return '<span class="muted">Сигналы не расшифрованы</span>';
  return `<ul>${rows.map(([code, details]) => `<li><b>${esc(signalLabel(code))}</b>: ${n(details?.count)} · последнее ${esc(fmtDateTime(details?.last_at))}</li>`).join('')}</ul>`;
}

function candidateCard(candidate, item) {
  return `<article class="list-item">
    <div class="section-title">
      <div>
        <h4>${esc(candidate.candidate_name || 'СПН без имени')}</h4>
        <p class="muted">Независимых типов сигналов: ${n(candidate.independent_signal_types)} · всего действий: ${n(candidate.total_signal_count)}</p>
      </div>
      <span class="pill ${candidate.manager_link_status === 'present' ? 'green' : 'yellow'}">${candidate.manager_link_status === 'present' ? 'Менеджер указан' : 'manager_id отсутствует'}</span>
    </div>
    <div class="task-review-facts">
      <div><span class="small">Менеджер профиля</span><b>${esc(candidate.manager_name || 'Не назначен')}</b></div>
      <div><span class="small">Последний сигнал</span><b>${esc(fmtDateTime(candidate.last_signal_at))}</b></div>
    </div>
    <details class="task-review-contract"><summary>Подтверждающие сигналы</summary>${signalBreakdown(candidate)}</details>
    <div class="actions task-review-actions" style="justify-content:flex-start">
      <button class="btn" type="button" data-use-candidate="${esc(candidate.candidate_id || '')}" data-deal-id="${esc(item.deal_id || '')}" data-side="seller">В черновик как СПН продавца</button>
      <button class="btn" type="button" data-use-candidate="${esc(candidate.candidate_id || '')}" data-deal-id="${esc(item.deal_id || '')}" data-side="buyer">В черновик как СПН покупателя</button>
    </div>
    <div class="status warn"><b>Не назначение.</b> Кнопки заполняют только локальный черновик и не определяют сторону автоматически.</div>
  </article>`;
}

function confirmationForm(item) {
  const decision = dealDecision(item.deal_id);
  return `<section class="list-item" aria-label="Локальный черновик решения по сделке">
    <div class="section-title">
      <div><h4>Локальный черновик подтверждения</h4><p class="muted">Хранится только в этом браузере. Серверная запись отсутствует.</p></div>
      <span class="pill ${decisionTone(decision.status)}">${esc(statusLabel(decision.status))}</span>
    </div>
    <div class="grid">
      <div class="field"><label>Статус проверки</label><select data-draft-scope="deal" data-draft-id="${esc(item.deal_id)}" data-draft-field="status">${selectStatusOptions(decision.status)}</select></div>
      <div class="field"><label>Подтверждённый СПН продавца</label><select data-draft-scope="deal" data-draft-id="${esc(item.deal_id)}" data-draft-field="seller_spn_id">${spnSelectOptions(decision.seller_spn_id)}</select></div>
      <div class="field"><label>Подтверждённый СПН покупателя</label><select data-draft-scope="deal" data-draft-id="${esc(item.deal_id)}" data-draft-field="buyer_spn_id">${spnSelectOptions(decision.buyer_spn_id)}</select></div>
    </div>
    <div class="field"><label>Основание или что нужно уточнить</label><textarea rows="3" data-draft-scope="deal" data-draft-id="${esc(item.deal_id)}" data-draft-field="note" placeholder="Например: подтверждено владельцем сделки по телефону; сторону СПН уточнить">${esc(decision.note || '')}</textarea></div>
  </section>`;
}

function evidenceCard(item) {
  const candidates = Array.isArray(item.candidates) ? item.candidates : [];
  return `<article class="list-item task-review-card">
    <div class="section-title task-review-head">
      <div>
        <div class="task-review-labels">
          <span class="pill ${evidenceTone(item.evidence_state)}">${esc(item.evidence_state_label || item.evidence_state || 'Состояние не определено')}</span>
          <span class="pill gray">Только доказательства</span>
        </div>
        <h3>${esc(item.deal_title || item.address || 'Сделка')}</h3>
        <p class="muted">${esc(item.address || 'Адрес не указан')} · ${esc(statusText(item.deal_status))}</p>
      </div>
      <span class="pill ${item.selection_available || item.mutation_available ? 'red' : 'green'}">Серверный выбор и запись отключены</span>
    </div>
    <div class="task-review-facts">
      <div><span class="small">Текущее поле СПН продавца</span><b>${esc(item.seller_spn_name || 'Не назначен')}</b><span class="muted">Роль: ${esc(item.seller_profile_role || 'нет профиля')}</span></div>
      <div><span class="small">Текущее поле СПН покупателя</span><b>${esc(item.buyer_spn_name || 'Не назначен')}</b><span class="muted">Роль: ${esc(item.buyer_profile_role || 'нет профиля')}</span></div>
      <div><span class="small">Активных СПН с сигналами</span><b>${n(item.candidate_count)}</b><span class="muted">Максимум независимых типов: ${n(item.strongest_signal_types)}</span></div>
    </div>
    <div class="status warn"><b>Следующее безопасное действие:</b> ${esc(item.safe_action || 'Требуется ручная проверка')}</div>
    <details class="task-review-contract" ${candidates.length ? 'open' : ''}><summary>Evidence-only candidates</summary>${candidates.map((candidate) => candidateCard(candidate, item)).join('') || '<div class="empty">Активный СПН по истории действий не найден.</div>'}</details>
    ${confirmationForm(item)}
    <div class="actions task-review-actions" style="justify-content:flex-start">
      <a class="btn primary" href="${esc(item.card_url || `./deal-card-v2.html?id=${encodeURIComponent(item.deal_id || '')}`)}">Открыть карточку</a>
    </div>
  </article>`;
}

function managerDecisionCard(spn) {
  const decision = managerDecision(spn.id);
  return `<article class="list-item">
    <div class="section-title">
      <div><h4>${esc(spn.full_name || spn.email || 'СПН')}</h4><p class="muted">${esc(spn.email || '')}</p></div>
      <span class="pill ${spn.manager_status === 'present' ? 'green' : 'yellow'}">${spn.manager_status === 'present' ? 'Текущий менеджер указан' : 'Текущий manager_id отсутствует'}</span>
    </div>
    <div class="task-review-facts">
      <div><span class="small">Текущий менеджер</span><b>${esc(spn.manager_name || 'Не назначен')}</b></div>
      <div><span class="small">Статус локальной проверки</span><b>${esc(statusLabel(decision.status))}</b></div>
    </div>
    <div class="grid">
      <div class="field"><label>Статус проверки</label><select data-draft-scope="manager" data-draft-id="${esc(spn.id)}" data-draft-field="status">${selectStatusOptions(decision.status)}</select></div>
      <div class="field"><label>Подтверждённый менеджер</label><select data-draft-scope="manager" data-draft-id="${esc(spn.id)}" data-draft-field="manager_id">${managerSelectOptions(decision.manager_id)}</select></div>
    </div>
    <div class="field"><label>Основание или комментарий</label><textarea rows="2" data-draft-scope="manager" data-draft-id="${esc(spn.id)}" data-draft-field="note" placeholder="Например: подтверждено руководителем отдела">${esc(decision.note || '')}</textarea></div>
  </article>`;
}

function confirmationDraftSection() {
  const context = confirmationContext();
  const summary = context.summary || {};
  const counts = draftCounts();
  return `<section class="card" id="confirmation-draft">
    <div class="section-title">
      <div><h2>Лист подтверждения ответственности</h2><p class="muted">Подготовьте решения по сторонам сделки и manager_id. Черновик хранится только в localStorage текущего браузера.</p></div>
      <span class="pill green">Без записи в БД</span>
    </div>
    <div class="status warn"><b>Граница безопасности.</b> ${esc(context.decision_note || 'Локальный выбор не изменяет сделки и профили.')}</div>
    <div id="draftStatus" class="status ok">${draft.updated_at ? `Черновик обновлён ${esc(fmtDateTime(draft.updated_at))}.` : 'Локальный черновик пока пуст.'} В Supabase ничего не записано.</div>
    <div class="kpi-row task-review-metrics" aria-label="Сводка локального черновика">
      ${metric('Активных СПН в каталоге', n(summary.active_spn_options), 'blue')}
      ${metric('СПН без manager_id', n(summary.spn_without_manager), n(summary.spn_without_manager) ? 'yellow' : 'green')}
      ${metric('Кандидатов в менеджеры', n(summary.manager_options), 'blue')}
      ${metric('Сделок в черновике', counts.deals, counts.deals ? 'blue' : 'gray', 'draftDealCount')}
      ${metric('Сделок подтверждено', counts.confirmedDeals, counts.confirmedDeals ? 'green' : 'gray', 'draftConfirmedDealCount')}
      ${metric('Нужно уточнение', counts.clarificationDeals, counts.clarificationDeals ? 'yellow' : 'green', 'draftClarificationCount')}
      ${metric('Профилей СПН в черновике', counts.managerProfiles, counts.managerProfiles ? 'blue' : 'gray', 'draftManagerCount')}
      ${metric('Менеджеров подтверждено', counts.confirmedManagers, counts.confirmedManagers ? 'green' : 'gray', 'draftConfirmedManagerCount')}
    </div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn primary" id="exportDraftJson" type="button">Скачать JSON</button>
      <button class="btn" id="exportDraftCsv" type="button">Скачать CSV</button>
      <button class="btn" id="copyDraftSummary" type="button">Копировать сводку</button>
      <button class="btn red" id="clearDraft" type="button">Очистить локальный черновик</button>
    </div>
    <details class="task-review-contract" open><summary>Подтверждение менеджеров активных СПН</summary><div class="list">${activeSpnOptions().map(managerDecisionCard).join('') || '<div class="empty">Активные СПН для текущей роли не найдены.</div>'}</div></details>
    <div class="status ok"><b>Экспорт.</b> ${esc(context.export_note || 'Файл предназначен для проверки и последующей отдельной аудируемой операции.')}</div>
  </section>`;
}

function buildExportPayload() {
  const exportedAt = new Date().toISOString();
  const deals = evidenceItems().map((item) => {
    const decision = dealDecision(item.deal_id);
    if (!isMeaningfulDealDecision(decision)) return null;
    const seller = findSpn(decision.seller_spn_id);
    const buyer = findSpn(decision.buyer_spn_id);
    return {
      deal_id: item.deal_id,
      deal_title: item.deal_title,
      address: item.address,
      deal_status: item.deal_status,
      decision_status: decision.status,
      decision_status_label: statusLabel(decision.status),
      current_seller_spn_id: item.seller_spn_id || null,
      current_seller_spn_name: item.seller_spn_name || null,
      current_seller_profile_role: item.seller_profile_role || null,
      proposed_seller_spn_id: seller?.id || null,
      proposed_seller_spn_name: seller?.full_name || seller?.email || null,
      current_buyer_spn_id: item.buyer_spn_id || null,
      current_buyer_spn_name: item.buyer_spn_name || null,
      current_buyer_profile_role: item.buyer_profile_role || null,
      proposed_buyer_spn_id: buyer?.id || null,
      proposed_buyer_spn_name: buyer?.full_name || buyer?.email || null,
      evidence_state: item.evidence_state,
      evidence_candidates: (Array.isArray(item.candidates) ? item.candidates : []).map((candidate) => ({
        id: candidate.candidate_id,
        name: candidate.candidate_name,
        independent_signal_types: n(candidate.independent_signal_types),
        total_signal_count: n(candidate.total_signal_count)
      })),
      note: String(decision.note || '').trim(),
      card_url: item.card_url || null
    };
  }).filter(Boolean);

  const managers = activeSpnOptions().map((spn) => {
    const decision = managerDecision(spn.id);
    if (!isMeaningfulManagerDecision(decision)) return null;
    const manager = findManager(decision.manager_id);
    return {
      spn_id: spn.id,
      spn_name: spn.full_name || spn.email,
      spn_email: spn.email || null,
      decision_status: decision.status,
      decision_status_label: statusLabel(decision.status),
      current_manager_id: spn.manager_id || null,
      current_manager_name: spn.manager_name || null,
      proposed_manager_id: manager?.id || null,
      proposed_manager_name: manager?.full_name || manager?.email || null,
      proposed_manager_role: manager?.role || null,
      note: String(decision.note || '').trim()
    };
  }).filter(Boolean);

  return {
    schema_version: 1,
    export_type: 'navigator_v2_responsibility_confirmation_draft',
    exported_at: exportedAt,
    source: {
      report_version: report?.report_version || null,
      report_generated_at: report?.generated_at || null,
      context_version: confirmationContext().context_version || null,
      draft_updated_at: draft.updated_at || null
    },
    safety: {
      local_storage_only: true,
      server_selection_available: false,
      server_mutation_available: false,
      requires_separate_audited_point_operation: true
    },
    summary: {
      deal_decisions: deals.length,
      manager_decisions: managers.length,
      confirmed_deals: deals.filter((item) => item.decision_status === 'confirmed').length,
      confirmed_managers: managers.filter((item) => item.decision_status === 'confirmed').length
    },
    deal_decisions: deals,
    manager_decisions: managers
  };
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function buildCsv(payload) {
  const header = [
    'record_type', 'decision_status', 'deal_id', 'deal_title', 'address',
    'current_seller_spn_name', 'proposed_seller_spn_id', 'proposed_seller_spn_name',
    'current_buyer_spn_name', 'proposed_buyer_spn_id', 'proposed_buyer_spn_name',
    'spn_id', 'spn_name', 'current_manager_name', 'proposed_manager_id', 'proposed_manager_name',
    'evidence_state', 'evidence_candidates', 'note', 'exported_at'
  ];
  const rows = [header];
  payload.deal_decisions.forEach((item) => rows.push([
    'deal', item.decision_status, item.deal_id, item.deal_title, item.address,
    item.current_seller_spn_name, item.proposed_seller_spn_id, item.proposed_seller_spn_name,
    item.current_buyer_spn_name, item.proposed_buyer_spn_id, item.proposed_buyer_spn_name,
    '', '', '', '', '', item.evidence_state,
    item.evidence_candidates.map((candidate) => `${candidate.name}: ${candidate.independent_signal_types}/${candidate.total_signal_count}`).join(' | '),
    item.note, payload.exported_at
  ]));
  payload.manager_decisions.forEach((item) => rows.push([
    'profile_manager', item.decision_status, '', '', '', '', '', '', '', '', '',
    item.spn_id, item.spn_name, item.current_manager_name, item.proposed_manager_id, item.proposed_manager_name,
    '', '', item.note, payload.exported_at
  ]));
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\n')}`;
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJson() {
  const payload = buildExportPayload();
  downloadText(`navigator-responsibility-confirmation-${new Date().toISOString().slice(0, 10)}.json`, `${JSON.stringify(payload, null, 2)}\n`, 'application/json;charset=utf-8');
  setDraftStatus(`JSON выгружен: ${payload.summary.deal_decisions} решений по сделкам и ${payload.summary.manager_decisions} решений по профилям.`, 'ok');
}

function exportCsv() {
  const payload = buildExportPayload();
  downloadText(`navigator-responsibility-confirmation-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(payload), 'text/csv;charset=utf-8');
  setDraftStatus(`CSV выгружен: ${payload.summary.deal_decisions + payload.summary.manager_decisions} строк решений.`, 'ok');
}

function textSummary(payload) {
  const lines = [
    'Navigator v2 — локальный лист подтверждения ответственности',
    `Экспорт: ${fmtDateTime(payload.exported_at)}`,
    `Решений по сделкам: ${payload.summary.deal_decisions}; подтверждено: ${payload.summary.confirmed_deals}`,
    `Решений по manager_id: ${payload.summary.manager_decisions}; подтверждено: ${payload.summary.confirmed_managers}`,
    'Серверные изменения не выполнялись.'
  ];
  payload.deal_decisions.forEach((item) => {
    lines.push(`- ${item.deal_title}: ${item.decision_status_label}; продавец СПН — ${item.proposed_seller_spn_name || 'не выбран'}; покупатель СПН — ${item.proposed_buyer_spn_name || 'не выбран'}${item.note ? `; ${item.note}` : ''}`);
  });
  payload.manager_decisions.forEach((item) => {
    lines.push(`- ${item.spn_name}: ${item.decision_status_label}; менеджер — ${item.proposed_manager_name || 'не выбран'}${item.note ? `; ${item.note}` : ''}`);
  });
  return lines.join('\n');
}

async function copySummary() {
  const payload = buildExportPayload();
  const text = textSummary(payload);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setDraftStatus('Сводка локального черновика скопирована. Серверные данные не изменены.', 'ok');
  } catch (error) {
    setDraftStatus(`Не удалось скопировать сводку: ${error.message || error}`, 'error');
  }
}

function clearDraft() {
  if (!window.confirm('Очистить локальный черновик подтверждений в этом браузере? Данные в Supabase не затрагиваются.')) return;
  draft = emptyDraft();
  try { localStorage.removeItem(draftKey()); } catch (error) { console.warn(error); }
  draw();
  setDraftStatus('Локальный черновик очищен. Серверные данные не изменены.', 'ok');
}

function updateDraftField(scope, id, field, value) {
  if (scope === 'deal') {
    draft.deal_decisions[id] = { ...dealDecision(id), [field]: value };
  } else if (scope === 'manager') {
    draft.manager_decisions[id] = { ...managerDecision(id), [field]: value };
  }
  saveDraft();
  refreshDraftSummary();
}

function useCandidate(dealId, candidateId, side) {
  const field = side === 'buyer' ? 'buyer_spn_id' : 'seller_spn_id';
  updateDraftField('deal', dealId, field, candidateId);
  const selector = `[data-draft-scope="deal"][data-draft-id="${CSS.escape(dealId)}"][data-draft-field="${field}"]`;
  const select = document.querySelector(selector);
  if (select) select.value = candidateId;
  setDraftStatus('Кандидат добавлен только в локальный черновик. Для подтверждения выберите статус проверки.', 'ok');
}

function bindDraftEvents() {
  document.querySelectorAll('[data-draft-field]').forEach((element) => {
    element.addEventListener('change', () => {
      updateDraftField(element.dataset.draftScope, element.dataset.draftId, element.dataset.draftField, element.value);
    });
  });
  document.querySelectorAll('[data-use-candidate]').forEach((button) => {
    button.addEventListener('click', () => useCandidate(button.dataset.dealId, button.dataset.useCandidate, button.dataset.side));
  });
  document.getElementById('exportDraftJson')?.addEventListener('click', exportJson);
  document.getElementById('exportDraftCsv')?.addEventListener('click', exportCsv);
  document.getElementById('copyDraftSummary')?.addEventListener('click', copySummary);
  document.getElementById('clearDraft')?.addEventListener('click', clearDraft);
}

function draw() {
  const plan = remediationPlan();
  const planSummary = remediationSummary();
  const evidence = responsibilityEvidence();
  const eSummary = evidenceSummary();
  const planRows = remediationItems();
  const evidenceRows = evidenceItems();

  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero task-review-hero">
      <span class="role-home-eyebrow">Ответственность и качество источников</span>
      <h1>Что исправить до назначения менеджера</h1>
      <p>Экран группирует ошибки полей СПН, показывает подтверждающие действия и помогает подготовить локальный пакет решений. Серверный выбор и запись отключены.</p>
    </section>

    ${errorText ? `<div class="status error" role="alert">${esc(errorText)}</div>` : ''}
    ${report?.preview_only ? `<div class="status ok" role="status"><b>Read-only отчёт.</b> Построен ${esc(fmtDateTime(report.generated_at))}; версия ${n(report.report_version)}.</div>` : ''}

    ${report ? `<section class="card">
      <div class="section-title"><div><h2>Группы ручного исправления</h2><p class="muted">Порядок исправления построен от ошибочных ролей к отсутствующим полям.</p></div><span class="pill red">Решение владельца</span></div>
      <div class="status warn"><b>Автоматические исправления и массовые назначения отключены.</b> Каждое изменение должно быть подтверждено по карточке сделки.</div>
      <div class="kpi-row task-review-metrics" aria-label="Сводка плана исправления">
        ${metric('Групп исправления', n(planSummary.remediation_groups), 'blue')}
        ${metric('Затронуто сделок', n(planSummary.affected_deals), n(planSummary.affected_deals) ? 'red' : 'green')}
        ${metric('Сначала', n(planSummary.urgent_groups), n(planSummary.urgent_groups) ? 'red' : 'green')}
        ${metric('Затем', n(planSummary.high_groups), n(planSummary.high_groups) ? 'yellow' : 'green')}
        ${metric('После проверки сторон', n(planSummary.normal_groups), n(planSummary.normal_groups) ? 'blue' : 'green')}
      </div>
      <details class="task-review-contract" open><summary>Порядок исправления</summary><ol>${(Array.isArray(plan.execution_order) ? plan.execution_order : []).map((step) => `<li>${esc(step)}</li>`).join('')}</ol></details>
      <div class="list">${planRows.map(remediationCard).join('') || '<div class="empty">Группы исправления не найдены.</div>'}</div>
    </section>

    ${confirmationDraftSection()}

    <section class="card">
      <div class="section-title"><div><h2>Подтверждающие действия активных СПН</h2><p class="muted">Creator, participants, events, tasks и documents учитываются как отдельные типы доказательств.</p></div><span class="pill blue">Evidence only</span></div>
      <div class="status warn"><b>История действий — не назначение.</b> Даже сильный одиночный набор сигналов требует ручного подтверждения владельца.</div>
      <div class="kpi-row task-review-metrics" aria-label="Сводка доказательств ответственности">
        ${metric('Сделок в выборке', n(eSummary.deals_in_scope), 'blue')}
        ${metric('Есть сигналы активного СПН', n(eSummary.with_any_active_spn_evidence), n(eSummary.with_any_active_spn_evidence) ? 'blue' : 'gray')}
        ${metric('Сильный одиночный набор', n(eSummary.strong_single_evidence), n(eSummary.strong_single_evidence) ? 'yellow' : 'gray')}
        ${metric('Слабый одиночный набор', n(eSummary.weak_single_evidence), n(eSummary.weak_single_evidence) ? 'yellow' : 'green')}
        ${metric('Несколько кандидатов', n(eSummary.multiple_candidates), n(eSummary.multiple_candidates) ? 'red' : 'green')}
        ${metric('Нет сигналов', n(eSummary.no_active_spn_evidence), n(eSummary.no_active_spn_evidence) ? 'red' : 'green')}
      </div>
      <div class="status ok"><b>Граница вывода.</b> ${esc(evidence.decision_note || 'Сигналы помогают подготовить ручное решение, но не заменяют его.')}</div>
      <div class="list">${evidenceRows.map(evidenceCard).join('') || '<div class="empty">Evidence-only данные не получены.</div>'}</div>
    </section>

    <section class="card">
      <div class="actions" style="justify-content:flex-start">
        <a class="btn" href="./operational-adoption-v2.html">Вернуться к движению и результату</a>
        <a class="btn" href="./manager-v2.html">Открыть контроль сделок</a>
      </div>
    </section>` : `<section class="card"><p role="status" aria-live="polite">${busy ? 'Собираю план исправления, каталог и доказательства…' : 'Данные ещё не загружены.'}</p></section>`}
  </main>`;

  if (report) bindDraftEvents();
}

async function loadReport() {
  if (busy) return;
  busy = true;
  errorText = '';
  draw();
  try {
    report = await rpc('nav_v2_get_operational_adoption_report', { p_days: 30, p_limit: 500 }, 30000);
    if (!allowed()) throw new Error('Источники ответственности доступны владельцу, администратору и менеджеру.');
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
  draft = loadDraft();
  await loadReport();
}

init();
