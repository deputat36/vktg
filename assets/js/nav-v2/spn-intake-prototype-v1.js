import {
  activeFactQuestions,
  buildIntakeAssessment,
  matchedIntakeRules
} from './spn-intake-contract-v1.js?v=20260717-02';

const CATALOG_URL = './config/nav-v2-intake-contract-v1.json';
const DRAFT_KEY = 'nav_v2_intake_prototype_v1';
const FACT_VALUES = [
  ['yes', 'Да'],
  ['no', 'Нет'],
  ['unknown', 'Не знаю'],
  ['not_applicable', 'Не относится']
];
const FACT_SOURCES = [
  ['document', 'Подтверждено документом'],
  ['client', 'Со слов клиента'],
  ['unchecked', 'Пока не проверено']
];
const DOCUMENT_STATUSES = [
  ['', 'Не отмечено'],
  ['available', 'Есть'],
  ['requested', 'Запрошен'],
  ['missing', 'Отсутствует'],
  ['problem', 'Есть проблема']
];
const NEXT_ACTIONS = [
  ['', 'Выберите ближайший шаг'],
  ['Запросить ключевые документы.', 'Запросить документы'],
  ['Созвониться с клиентом и уточнить факты.', 'Уточнить факты у клиента'],
  ['Согласовать расчёты, расходы и условия.', 'Согласовать условия'],
  ['Назначить следующую встречу.', 'Назначить встречу'],
  ['Передать структурированный вопрос юристу.', 'Подготовить вопрос юристу'],
  ['Дождаться выбора объекта.', 'Дождаться выбора объекта']
];
const GROUP_TITLES = {
  seller: 'Продавец и право собственности',
  buyer: 'Покупатель и источник средств',
  object: 'Особенности объекта',
  money: 'Покупатель и источник средств',
  terms: 'Расчёты, расходы и задаток',
  special: 'Специальные обстоятельства'
};
const SIDE_TITLES = { seller: 'продавец', buyer: 'покупатель', object: 'объект', deal: 'сделка' };
const OWNER_TITLES = { lawyer: 'Юрист', broker: 'Ипотечный брокер', spn: 'Ведущий СПН', seller_spn: 'СПН продавца', buyer_spn: 'СПН покупателя', lead_spn: 'Ведущий СПН' };
const DOCUMENT_STATUS_TITLES = { available: 'получен', requested: 'запрошен', missing: 'отсутствует', problem: 'есть проблема' };

let catalog = null;
let state = loadState();
let statusMessage = '';
let statusKind = 'info';
let renderTimer = null;

function blankDraft() {
  return {
    requestType: '',
    representation: '',
    stage: '',
    objectType: '',
    objectAddress: '',
    objectNotSelectedReason: '',
    cadastralNumberKnown: 'unknown',
    urgency: '',
    targetDate: '',
    dateUnknown: false,
    leadSpnConfirmed: false,
    nextAction: '',
    lawyerRequestType: '',
    requestedDecision: '',
    lawyerRequestConfirmed: false,
    lawyerQuestion: '',
    documentsReviewed: false,
    documents: [],
    facts: {}
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (!saved || typeof saved !== 'object') throw new Error('empty');
    return {
      step: Math.max(0, Math.min(2, Number(saved.step) || 0)),
      maxStep: Math.max(0, Math.min(2, Number(saved.maxStep) || 0)),
      draft: { ...blankDraft(), ...(saved.draft || {}), facts: { ...(saved.draft?.facts || {}) }, documents: [...(saved.draft?.documents || [])] },
      outcome: saved.outcome || null,
      updatedAt: saved.updatedAt || null
    };
  } catch (_) {
    return { step: 0, maxStep: 0, draft: blankDraft(), outcome: null, updatedAt: null };
  }
}

function saveState() {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function optionTitle(items, id, fallback = 'не выбрано') {
  return items.find((item) => item.id === id)?.title || fallback;
}

function setStatus(message, kind = 'info') {
  statusMessage = message;
  statusKind = kind;
}

function preserveScrollRender() {
  const y = window.scrollY;
  render();
  requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' }));
}

function deferredRender(preserveScroll = false) {
  const y = window.scrollY;
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderTimer = null;
    render();
    if (preserveScroll) requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' }));
  }, 0);
}

function choiceButtons(field, items, current) {
  return `<div class="choice-grid">${items.map((item) => `<button type="button" class="choice-button ${current === item.id ? 'active' : ''}" data-set-field="${esc(field)}" data-set-value="${esc(item.id)}"><b>${esc(item.title)}</b>${item.text ? `<span>${esc(item.text)}</span>` : ''}</button>`).join('')}</div>`;
}

function selectField(field, label, options, value, extra = '') {
  return `<div class="field"><label for="intake-${esc(field)}">${esc(label)}</label><select id="intake-${esc(field)}" data-input-field="${esc(field)}" ${extra}>${options.map(([id, title]) => `<option value="${esc(id)}" ${value === id ? 'selected' : ''}>${esc(title)}</option>`).join('')}</select></div>`;
}

function inputField(field, label, value, type = 'text', placeholder = '') {
  return `<div class="field"><label for="intake-${esc(field)}">${esc(label)}</label><input id="intake-${esc(field)}" data-input-field="${esc(field)}" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}"></div>`;
}

function checkField(field, title, checked) {
  return `<label class="intake-check"><input type="checkbox" data-input-field="${esc(field)}" ${checked ? 'checked' : ''}><span>${esc(title)}</span></label>`;
}

function stepNavigation() {
  const steps = [
    ['Что происходит', 'Основа черновика'],
    ['Что проверить', 'Только важные факты'],
    ['Проверить', 'Итог и передача']
  ];
  return `<aside class="card intake-steps" aria-label="Этапы анкеты"><div class="intake-step-list">${steps.map(([title, hint], index) => `<button type="button" class="intake-step ${state.step === index ? 'active' : ''}" data-go-step="${index}" ${index > state.maxStep ? 'disabled' : ''}><b>${index + 1}. ${esc(title)}</b><span>${esc(hint)}</span></button>`).join('')}</div><div class="progress" aria-hidden="true"><i style="width:${((state.step + 1) / 3) * 100}%"></i></div><p class="small">Черновик сохраняется только в этом браузере. В рабочую базу ничего не отправляется.</p></aside>`;
}

function renderSituation() {
  const d = state.draft;
  const objectOptions = [['', 'Выберите тип объекта'], ...catalog.object_types.map((item) => [item.id, item.title])];
  return `<div class="section-title"><div><span class="pill blue">Этап 1 из 3</span><h2>Что происходит</h2><p class="muted">Сначала только то, чего достаточно для понятного черновика.</p></div></div>
    <section class="intake-section"><h3>Что сейчас нужно?</h3>${choiceButtons('requestType', catalog.request_types, d.requestType)}</section>
    <section class="intake-section"><h3>Кого сопровождает агентство?</h3>${choiceButtons('representation', catalog.representations, d.representation)}</section>
    <section class="intake-section"><h3>На какой стадии ситуация?</h3>${choiceButtons('stage', catalog.stages, d.stage)}</section>
    <section class="intake-section"><h3>Объект и ориентир</h3><div class="intake-inline">${selectField('objectType', 'Тип объекта', objectOptions, d.objectType)}${inputField('objectAddress', 'Адрес или рабочий ориентир', d.objectAddress, 'text', 'Без ФИО, телефонов и реквизитов')}</div>${d.objectType === 'not_selected' ? inputField('objectNotSelectedReason', 'Почему объект ещё не выбран?', d.objectNotSelectedReason, 'text', 'Например: клиент рассматривает варианты') : ''}</section>
    <section class="intake-section"><h3>Срок и следующий шаг</h3><div class="intake-inline">${selectField('urgency', 'Срочность', [['', 'Выберите срочность'], ['normal', 'Обычный срок'], ['urgent', 'Срочно'], ['critical', 'Критично, решение нужно немедленно']], d.urgency)}${inputField('targetDate', 'Ближайшая дата', d.targetDate, 'date')}</div><div class="intake-inline">${checkField('dateUnknown', 'Дата пока не определена', d.dateUnknown)}${checkField('leadSpnConfirmed', d.representation === 'both' ? 'СПН продавца и покупателя определены' : 'Ведущий СПН определён', d.leadSpnConfirmed)}</div>${selectField('nextAction', 'Ближайший шаг СПН', NEXT_ACTIONS, d.nextAction)}</section>`;
}

function groupedQuestions() {
  const groups = new Map();
  for (const question of activeFactQuestions(state.draft, catalog)) {
    const displayGroup = question.group === 'money' ? 'buyer' : question.group;
    if (!groups.has(displayGroup)) groups.set(displayGroup, []);
    groups.get(displayGroup).push(question);
  }
  return groups;
}

function renderFact(question) {
  const fact = state.draft.facts?.[question.id] || {};
  const needsSource = ['yes', 'no'].includes(fact.value) && question.source_required_when?.includes(fact.value);
  return `<div class="fact-card" data-fact-card="${esc(question.id)}"><div class="fact-title">${esc(question.title)}</div><div class="fact-options">${FACT_VALUES.map(([value, title]) => `<button type="button" class="fact-option ${fact.value === value ? 'active' : ''}" data-fact-id="${esc(question.id)}" data-fact-value="${value}">${title}</button>`).join('')}</div>${needsSource ? `<div class="fact-source" aria-label="Источник информации">${FACT_SOURCES.map(([source, title]) => `<button type="button" class="fact-option ${fact.source === source ? 'active' : ''}" data-fact-source-id="${esc(question.id)}" data-fact-source="${source}">${title}</button>`).join('')}</div>` : ''}</div>`;
}

function requiredDocuments(assessment) {
  return assessment.work_plan.document_candidates.map((item) => ({ id: item.type, title: item.title, side: item.side }));
}

function renderDocuments(assessment) {
  const documents = requiredDocuments(assessment);
  if (!documents.length) {
    return `<section class="intake-section"><h3>Ключевые документы</h3><p class="muted">По отмеченным фактам обязательный список не сформирован.</p>${checkField('documentsReviewed', 'Статус ключевых документов просмотрен', state.draft.documentsReviewed)}</section>`;
  }
  return `<section class="intake-section"><h3>Статусы документов, которые меняют решение</h3><p class="muted">Файлы загружать не нужно. Отметьте только безопасный статус.</p><div class="fact-list">${documents.map((type) => {
    const document = state.draft.documents.find((item) => item.type === type.id) || {};
    return `<div class="document-row"><div class="document-grid"><div><b>${esc(type.title)}</b><div class="document-side">Сторона: ${esc(SIDE_TITLES[type.side] || type.side)}</div></div><select aria-label="Статус: ${esc(type.title)}" data-document-type="${esc(type.id)}">${DOCUMENT_STATUSES.map(([status, title]) => `<option value="${status}" ${document.status === status ? 'selected' : ''}>${title}</option>`).join('')}</select></div></div>`;
  }).join('')}</div></section>`;
}

function renderFacts() {
  const assessment = buildIntakeAssessment(state.draft, catalog);
  const groups = groupedQuestions();
  return `<div class="section-title"><div><span class="pill blue">Этап 2 из 3</span><h2>Что важно проверить</h2><p class="muted">Отвечайте только то, что известно. «Не знаю» — нормальный и полезный ответ.</p></div></div><div class="fact-groups">${[...groups.entries()].map(([group, questions], index) => {
    const answered = questions.filter((question) => state.draft.facts?.[question.id]?.value).length;
    return `<details class="fact-group" ${index === 0 ? 'open' : ''} data-fact-group="${esc(group)}"><summary><span>${esc(GROUP_TITLES[group] || group)}</span><span class="small">${answered} из ${questions.length}</span></summary><div class="fact-list">${questions.map(renderFact).join('')}</div></details>`;
  }).join('')}</div>${renderDocuments(assessment)}`;
}

function factList(items, empty) {
  if (!items.length) return `<p class="muted">${esc(empty)}</p>`;
  return `<ul class="review-list">${items.map((item) => `<li>${esc(item.title)}</li>`).join('')}</ul>`;
}

function documentList(passport) {
  const labels = { available: 'Получены', requested: 'Запрошены', missing: 'Отсутствуют', problem: 'Есть проблема' };
  const rows = Object.entries(passport.documents).filter(([, items]) => items.length);
  if (!rows.length) return '<p class="muted">Статусы пока не отмечены.</p>';
  return rows.map(([status, items]) => `<p><b>${labels[status]}:</b> ${items.map((item) => esc(item.title)).join(', ')}</p>`).join('');
}

function workPlanDocuments(workPlan) {
  if (!workPlan.document_candidates.length) return '<p class="muted">По активным правилам документы не требуются.</p>';
  return `<ul class="review-list">${workPlan.document_candidates.map((item) => {
    const status = DOCUMENT_STATUS_TITLES[item.status] || 'статус не отмечен';
    const owner = OWNER_TITLES[item.owner.role] || item.owner.role;
    return `<li><b>${esc(item.title)}</b> · ${esc(SIDE_TITLES[item.side] || item.side)} · ${esc(status)}<div class="small">Ответственный: ${esc(owner)}${item.assignment_state === 'needs_assignment' ? ' · назначается при сохранении' : ''}; срок: ${esc(item.deadline || item.deadline_rule)}</div></li>`;
  }).join('')}</ul>`;
}

function workPlanTasks(workPlan) {
  if (!workPlan.task_candidates.length) return '<p class="muted">Автоматические задачи не нужны.</p>';
  return `<ul class="review-list">${workPlan.task_candidates.map((task) => {
    const owner = OWNER_TITLES[task.owner.role] || task.owner.role;
    return `<li><b>${esc(task.action)}</b><div class="small">Ответственный: ${esc(owner)}${task.creation_state === 'needs_owner' ? ' · назначается при сохранении' : ''}; срок: ${esc(task.deadline || task.deadline_rule)}</div><div class="small">Evidence: ${esc(task.evidence)} Ожидаемый результат: ${esc(task.expected_result)}</div></li>`;
  }).join('')}</ul><p class="small">Готовы к созданию только назначенные задачи: ${workPlan.ready_tasks.length} из ${workPlan.task_candidates.length}.</p>`;
}

function lawyerControls(assessment) {
  if (!assessment.passport.specialists.lawyer) return '<div class="status ok">По отмеченным фактам автоматическая передача юристу не требуется.</div>';
  const rules = matchedIntakeRules(state.draft, catalog).filter((rule) => rule.owner === 'lawyer');
  const request = state.draft.lawyerRequestType || assessment.passport.request_type;
  const decision = state.draft.requestedDecision || assessment.passport.requested_decision;
  const decisions = [...new Set([decision, ...rules.map((rule) => rule.expected_decision), 'Подтвердить, можно ли двигаться дальше.', 'Перечислить, каких данных или документов не хватает.'].filter(Boolean))];
  return `<div class="review-card review-wide"><h3>Что требуется от юриста</h3><div class="intake-inline">${selectField('lawyerRequestType', 'Тип запроса', catalog.lawyer_request_types.map((item) => [item.id, item.title]), request)}${selectField('requestedDecision', 'Какое решение ожидается?', decisions.map((item) => [item, item]), decision)}</div><div class="field"><label for="intake-lawyerQuestion">Дополнительный комментарий — необязательно</label><textarea id="intake-lawyerQuestion" data-input-field="lawyerQuestion" placeholder="Только рабочий контекст без персональных данных">${esc(state.draft.lawyerQuestion)}</textarea></div><label class="intake-check"><input type="checkbox" data-confirm-lawyer ${state.draft.lawyerRequestConfirmed ? 'checked' : ''}><span>Подтверждаю тип запроса и ожидаемое решение</span></label></div>`;
}

function gateRow(title, gate) {
  const allowed = gate.allowed;
  return `<div class="gate-row"><div><b>${esc(title)}</b>${gate.missing?.length ? `<div class="small">${gate.missing.map((item) => esc(item.title)).join('; ')}</div>` : ''}</div><span class="pill ${allowed ? 'green' : 'yellow'}">${allowed ? 'можно' : 'есть пробелы'}</span></div>`;
}

function renderReview() {
  const assessment = buildIntakeAssessment(state.draft, catalog);
  const p = assessment.passport;
  const riskItems = p.risk_flags.map((risk) => `${risk.level.toUpperCase()}: ${risk.id}${risk.blocks_deposit ? ' · блокирует задаток' : ''}`);
  return `<div class="section-title"><div><span class="pill blue">Этап 3 из 3</span><h2>Проверить и сохранить</h2><p class="muted">Черновик и передача специалисту — разные действия.</p></div></div><div class="review-grid">
    <div class="review-card"><h3>Что создаётся</h3><p><b>${esc(optionTitle(catalog.request_types, state.draft.requestType))}</b></p><p>${esc(optionTitle(catalog.object_types, state.draft.objectType))} · ${esc(state.draft.objectAddress || state.draft.objectNotSelectedReason || 'ориентир не указан')}</p><p class="small">${esc(optionTitle(catalog.representations, state.draft.representation))} · ${esc(optionTitle(catalog.stages, state.draft.stage))}</p></div>
    <div class="review-card"><h3>Срок и следующий шаг</h3><p><b>${esc(p.target_date || (state.draft.dateUnknown ? 'Дата не определена' : 'Дата не указана'))}</b> · ${esc(p.urgency || 'срочность не указана')}</p><p>${esc(p.spn_next_action || 'Следующий шаг не выбран')}</p></div>
    <div class="review-card"><h3>Подтверждено документом</h3>${factList(p.confirmed_facts, 'Подтверждённых фактов пока нет.')}</div>
    <div class="review-card"><h3>Известно со слов клиента</h3>${factList(p.client_reported_facts, 'Сообщённых фактов пока нет.')}</div>
    <div class="review-card"><h3>Пока неизвестно</h3>${factList(p.unknown_facts, 'Неизвестных активных фактов нет.')}</div>
    <div class="review-card"><h3>Риски и стоп-факторы</h3>${riskItems.length ? `<ul class="review-list">${riskItems.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p class="muted">Автоматические риски не найдены.</p>'}</div>
    <div class="review-card review-wide"><h3>Документы по сопровождаемой стороне</h3>${workPlanDocuments(assessment.work_plan)}</div>
    <div class="review-card review-wide"><h3>Конкретные задачи</h3>${workPlanTasks(assessment.work_plan)}</div>
    <details class="review-card review-wide"><summary><b>Отмеченные статусы документов</b></summary>${documentList(p)}</details>
    ${lawyerControls(assessment)}
    <div class="review-card review-wide"><h3>Gates</h3><div class="gate-list">${gateRow('Сохранить черновик', assessment.gates.save_draft)}${gateRow('Сформировать карточку', assessment.gates.form_card)}${gateRow(`Передать юристу · ${assessment.gates.handoff_lawyer.state}`, assessment.gates.handoff_lawyer)}</div></div>
    <details class="review-card review-wide"><summary><b>Технический preview юридического паспорта и work plan</b></summary><pre class="intake-json">${esc(JSON.stringify({ passport: p, work_plan: assessment.work_plan }, null, 2))}</pre></details>
  </div>`;
}

function primaryAction() {
  if (state.step === 0) return ['continue', 'Продолжить'];
  if (state.step === 1) return ['review', 'Проверить итог'];
  const assessment = buildIntakeAssessment(state.draft, catalog);
  if (assessment.passport.specialists.lawyer && assessment.gates.handoff_lawyer.allowed) return ['lawyer', 'Сохранить и передать юристу'];
  if (assessment.passport.specialists.broker && assessment.gates.form_card.allowed) return ['broker', 'Сохранить и передать брокеру'];
  return ['self', 'Сохранить и продолжить самостоятельно'];
}

function secondaryActions() {
  if (state.step !== 2) return '';
  const assessment = buildIntakeAssessment(state.draft, catalog);
  return `<details class="intake-secondary-actions"><summary>Другие варианты сохранения</summary><div class="actions"><button type="button" class="btn light" data-final-action="draft" ${assessment.gates.save_draft.allowed ? '' : 'disabled'}>Сохранить черновик</button><button type="button" class="btn light" data-final-action="self" ${assessment.gates.form_card.allowed ? '' : 'disabled'}>Продолжить самостоятельно</button>${assessment.passport.specialists.lawyer ? `<button type="button" class="btn light" data-final-action="lawyer" ${assessment.gates.handoff_lawyer.allowed ? '' : 'disabled'}>Передать юристу</button>` : ''}${assessment.passport.specialists.broker ? `<button type="button" class="btn light" data-final-action="broker" ${assessment.gates.form_card.allowed ? '' : 'disabled'}>Передать брокеру</button>` : ''}</div></details>`;
}

function actionBar() {
  const [action, title] = primaryAction();
  return `<div class="intake-action-bar"><span class="small">Автосохранение: ${state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'после первого ответа'}</span><div class="intake-action-main">${state.step > 0 ? '<button type="button" class="btn light" data-back>Назад</button>' : '<button type="button" class="btn light" data-save-local>Черновик</button>'}<button type="button" class="btn primary intake-primary" data-primary-action="${action}">${esc(title)}</button></div></div>`;
}

function renderOutcome() {
  if (!state.outcome) return '';
  const labels = { draft: 'Черновик сохранён локально.', self: 'Карточка подготовлена для самостоятельного продолжения.', lawyer: 'Подготовлена передача юристу.', broker: 'Подготовлена передача ипотечному брокеру.' };
  return `<div class="status ok prototype-result" role="status"><b>${esc(labels[state.outcome.action] || 'Действие подготовлено.')}</b><br>Это безопасная демонстрация: данные не отправлены в Supabase и не создали рабочую сделку.</div>`;
}

function render() {
  const app = document.getElementById('app');
  if (!catalog) return;
  const content = state.step === 0 ? renderSituation() : state.step === 1 ? renderFacts() : renderReview();
  app.innerHTML = `<main class="nav-v2-shell"><section class="hero intake-prototype-hero"><div><span class="pill">Repository-only prototype</span><h1>Новая сделка за три этапа</h1><p>Быстрый черновик отдельно от осознанной передачи юристу.</p></div><div class="intake-safety-note"><b>Безопасный режим.</b><br>Не указывайте ФИО, телефоны, паспортные данные, номера документов, реквизиты и содержание файлов. Эта страница ничего не отправляет в рабочую базу.</div></section><div class="intake-layout">${stepNavigation()}<section class="card intake-panel">${content}${secondaryActions()}<div class="status ${statusKind === 'error' ? 'error' : statusKind === 'ok' ? 'ok' : statusKind === 'warn' ? 'warn' : ''} intake-status" role="status" aria-live="polite">${esc(statusMessage)}</div>${renderOutcome()}${actionBar()}</section></div></main>`;
}

function validateSituation() {
  const assessment = buildIntakeAssessment(state.draft, catalog);
  if (assessment.gates.save_draft.allowed) return true;
  setStatus(`Для черновика осталось: ${assessment.gates.save_draft.missing.map((item) => item.title).join('; ')}`, 'warn');
  render();
  return false;
}

function goForward() {
  if (state.step === 0 && !validateSituation()) return;
  state.step = Math.min(2, state.step + 1);
  state.maxStep = Math.max(state.maxStep, state.step);
  state.outcome = null;
  setStatus('', 'info');
  saveState();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function applyFinalAction(action) {
  const assessment = buildIntakeAssessment(state.draft, catalog);
  const allowed = action === 'draft'
    ? assessment.gates.save_draft.allowed
    : action === 'lawyer'
      ? assessment.gates.handoff_lawyer.allowed
      : assessment.gates.form_card.allowed;
  if (!allowed) {
    setStatus('Действие пока недоступно. Проверьте список пробелов в gates.', 'warn');
    render();
    return;
  }
  if (action === 'broker' && !assessment.passport.specialists.broker) {
    setStatus('Брокер доступен только для ипотечного сценария.', 'warn');
    render();
    return;
  }
  state.outcome = { action, at: new Date().toISOString(), passport: assessment.passport, work_plan: assessment.work_plan };
  saveState();
  setStatus('', 'info');
  render();
  requestAnimationFrame(() => document.querySelector('.prototype-result')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
}

document.addEventListener('click', (event) => {
  const setButton = event.target.closest('[data-set-field]');
  if (setButton) {
    const field = setButton.dataset.setField;
    state.draft[field] = setButton.dataset.setValue;
    if (['requestType', 'representation', 'stage'].includes(field)) state.draft.lawyerRequestConfirmed = false;
    state.outcome = null;
    saveState();
    preserveScrollRender();
    return;
  }
  const factButton = event.target.closest('[data-fact-id]');
  if (factButton) {
    const id = factButton.dataset.factId;
    const value = factButton.dataset.factValue;
    state.draft.facts[id] = { value, source: ['yes', 'no'].includes(value) ? (state.draft.facts[id]?.source || 'unchecked') : 'unchecked' };
    state.draft.lawyerRequestConfirmed = false;
    state.outcome = null;
    saveState();
    preserveScrollRender();
    return;
  }
  const sourceButton = event.target.closest('[data-fact-source-id]');
  if (sourceButton) {
    const id = sourceButton.dataset.factSourceId;
    state.draft.facts[id] = { ...(state.draft.facts[id] || { value: 'unknown' }), source: sourceButton.dataset.factSource };
    state.outcome = null;
    saveState();
    preserveScrollRender();
    return;
  }
  const stepButton = event.target.closest('[data-go-step]');
  if (stepButton) {
    state.step = Number(stepButton.dataset.goStep);
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (event.target.closest('[data-save-local]')) {
    saveState();
    setStatus('Черновик сохранён в этом браузере. В рабочую базу ничего не отправлено.', 'ok');
    render();
    return;
  }
  if (event.target.closest('[data-back]')) {
    state.step = Math.max(0, state.step - 1);
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const primary = event.target.closest('[data-primary-action]');
  if (primary) {
    if (['continue', 'review'].includes(primary.dataset.primaryAction)) goForward();
    else applyFinalAction(primary.dataset.primaryAction);
    return;
  }
  const final = event.target.closest('[data-final-action]');
  if (final) applyFinalAction(final.dataset.finalAction);
});

document.addEventListener('input', (event) => {
  const field = event.target.closest('[data-input-field]');
  if (!field || field.type === 'checkbox' || field.tagName === 'SELECT') return;
  state.draft[field.dataset.inputField] = field.value;
  state.outcome = null;
  saveState();
});

document.addEventListener('change', (event) => {
  const field = event.target.closest('[data-input-field]');
  if (field) {
    // Text/date/textarea values are already persisted by the input handler.
    // Replacing the form DOM synchronously from their blur-driven change event
    // can remove the focused node while the browser is still finishing blur.
    if (field.type !== 'checkbox' && field.tagName !== 'SELECT') return;
    const key = field.dataset.inputField;
    state.draft[key] = field.type === 'checkbox' ? field.checked : field.value;
    if (key === 'dateUnknown' && field.checked) state.draft.targetDate = '';
    if (['lawyerRequestType', 'requestedDecision'].includes(key)) state.draft.lawyerRequestConfirmed = false;
    state.outcome = null;
    saveState();
    deferredRender();
    return;
  }
  const documentField = event.target.closest('[data-document-type]');
  if (documentField) {
    const type = documentField.dataset.documentType;
    const definition = catalog.document_types.find((item) => item.id === type) || { title: type, side: 'deal' };
    state.draft.documents = state.draft.documents.filter((item) => item.type !== type);
    if (documentField.value) state.draft.documents.push({ type, title: definition.title, side: definition.side, status: documentField.value });
    state.outcome = null;
    saveState();
    deferredRender(true);
    return;
  }
  const confirmation = event.target.closest('[data-confirm-lawyer]');
  if (confirmation) {
    const assessment = buildIntakeAssessment(state.draft, catalog);
    state.draft.lawyerRequestType = state.draft.lawyerRequestType || assessment.passport.request_type;
    state.draft.requestedDecision = state.draft.requestedDecision || assessment.passport.requested_decision;
    state.draft.lawyerRequestConfirmed = confirmation.checked;
    state.outcome = null;
    saveState();
    deferredRender();
  }
});

async function init() {
  try {
    const response = await fetch(CATALOG_URL, { method: 'GET', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    catalog = await response.json();
    window.__NAV_INTAKE_PROTOTYPE__ = {
      version: 1,
      getState: () => JSON.parse(JSON.stringify(state)),
      getAssessment: () => buildIntakeAssessment(state.draft, catalog),
      reset: () => {
        localStorage.removeItem(DRAFT_KEY);
        state = { step: 0, maxStep: 0, draft: blankDraft(), outcome: null, updatedAt: null };
        render();
      }
    };
    render();
  } catch (error) {
    document.getElementById('app').innerHTML = `<main class="nav-v2-shell"><div class="status error"><b>Не удалось открыть прототип.</b><br>${esc(error.message || error)}</div></main>`;
  }
}

init();
