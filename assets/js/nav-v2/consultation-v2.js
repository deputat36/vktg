import { esc, getCachedUser, getMyProfile } from './supabase-v2.js';
import {
  CONSULTATION_ALLOWED_ROLES,
  CONSULTATION_CIRCUMSTANCE_OPTIONS,
  CONSULTATION_FUNDING_OPTIONS,
  buildConsultationHandoff,
  consultationRoleAllowed,
  consultationRouting,
  consultationToWizardDraft,
  validateConsultationInput
} from './consultation-intake-model-v2.js?v=20260716-02';

const app = document.getElementById('app');
const WIZARD_DRAFT_KEY = 'nav_deal_draft_v2';
let currentProfile = null;
let lastHandoff = null;

function checkboxGroup(name, options) {
  return options.map((item) => `<label class="consultation-check"><input type="checkbox" name="${esc(name)}" value="${esc(item.code)}"><span>${esc(item.label)}</span></label>`).join('');
}

function accessCard(title, text, actionHref = './nav-v2.html', actionLabel = 'Войти в Навигатор') {
  app.innerHTML = `<section class="card consultation-access"><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="actions"><a class="btn primary" href="${esc(actionHref)}">${esc(actionLabel)}</a><a class="btn light" href="./dashboard-v2.html">Рабочий стол</a></div></section>`;
}

function formTemplate() {
  return `<div class="consultation-grid">
    <section class="card consultation-form" aria-labelledby="consultationFormTitle">
      <div class="section-title"><div><span class="pill blue">Один экран</span><h2 id="consultationFormTitle">Минимальные факты</h2></div></div>
      <form id="consultationForm" novalidate>
        <div class="consultation-fields">
          <div class="consultation-field full"><label for="consultationQuestion">Конкретный вопрос юристу</label><textarea id="consultationQuestion" name="question" maxlength="1800" placeholder="Например: можно ли выходить на задаток при наследстве менее трёх лет и какие документы нужно запросить до встречи?" required></textarea><span class="consultation-help">Не указывайте ФИО, телефоны, паспортные данные и точный номер квартиры.</span></div>
          <div class="consultation-field"><label for="consultationSide">Кого сопровождаем</label><select id="consultationSide" name="side" required><option value="">Выберите</option><option value="seller">Продавца</option><option value="buyer">Покупателя</option><option value="both">Обе стороны</option><option value="partner">Партнёрская сделка</option><option value="unknown">Пока не определено</option></select></div>
          <div class="consultation-field"><label for="consultationStage">Текущая стадия</label><select id="consultationStage" name="stage" required><option value="">Выберите</option><option value="first_question">Первичная консультация</option><option value="before_deposit">До задатка</option><option value="deposit_planned">Задаток уже планируется</option><option value="preparing_deal">Подготовка сделки</option><option value="urgent">Срочная проверка перед встречей</option></select></div>
          <div class="consultation-field"><label for="consultationObjectType">Тип объекта</label><select id="consultationObjectType" name="object_type" required><option value="">Выберите</option><option value="flat">Квартира</option><option value="house_land">Дом с участком</option><option value="land">Земельный участок</option><option value="room_share">Комната / доля</option><option value="new_building">Новостройка / ДДУ</option><option value="commercial">Коммерческая недвижимость</option><option value="other">Другой объект</option></select></div>
          <div class="consultation-field"><label for="consultationDate">Плановая дата</label><input id="consultationDate" name="planned_date" type="date"></div>
          <div class="consultation-field full"><label for="consultationOrienter">Безопасный ориентир</label><input id="consultationOrienter" name="safe_orienter" maxlength="220" placeholder="Например: Северный микрорайон, кирпичный дом, вторичный рынок" required><span class="consultation-help">Без номера квартиры, комнаты, офиса, кадастрового номера и персональных данных.</span></div>
          <fieldset class="consultation-group full"><legend>Источник средств</legend><div class="consultation-options">${checkboxGroup('funding', CONSULTATION_FUNDING_OPTIONS)}</div></fieldset>
          <fieldset class="consultation-group full"><legend>Особые обстоятельства</legend><div class="consultation-options">${checkboxGroup('circumstances', CONSULTATION_CIRCUMSTANCE_OPTIONS)}</div></fieldset>
          <div class="consultation-field full"><label for="consultationFacts">Что уже известно</label><textarea id="consultationFacts" name="known_facts" maxlength="2400" placeholder="Только рабочие факты: основание права, количество собственников, согласованные условия, что уже запросили."></textarea></div>
          <div class="consultation-field full"><label for="consultationDocumentsUrl">Ссылка на утверждённый внешний источник документов</label><input id="consultationDocumentsUrl" name="documents_url" type="url" maxlength="600" placeholder="https://..."><span class="consultation-help">Navigator не хранит сканы. Добавляйте только рабочую ссылку, если источник уже утверждён офисом.</span></div>
        </div>
        <div id="consultationMessages" aria-live="polite"></div>
        <div class="consultation-actions"><button class="btn primary" type="submit">Сформировать передачу</button><button class="btn light" type="reset">Очистить</button></div>
      </form>
    </section>
    <aside class="card consultation-result" aria-labelledby="consultationResultTitle">
      <div class="section-title"><div><span class="pill">Без сохранения</span><h2 id="consultationResultTitle">Передача юристу</h2></div></div>
      <div id="consultationRoute" class="consultation-route"></div>
      <div id="consultationOutput" class="consultation-output" tabindex="0">Заполните минимальные факты. Здесь появится структурированный текст для передачи юристу.</div>
      <div class="consultation-actions"><button id="copyConsultation" class="btn primary" type="button" disabled>Скопировать текст</button><button id="transferConsultation" class="btn light" type="button" disabled>Перенести в полный мастер</button></div>
      <div id="consultationStatus" class="consultation-inline-status" role="status" aria-live="polite"></div>
      <div class="consultation-note">Ответ юриста в будущем должен иметь один из исходов: <b>ответ</b>, <b>нужны уточнения</b> или <b>преобразовать в подготовку задатка/сделки</b>. Этот preview пока ничего не создаёт в Supabase.</div>
    </aside>
  </div>`;
}

function readForm() {
  const form = document.getElementById('consultationForm');
  const data = new FormData(form);
  return {
    question: data.get('question'),
    side: data.get('side'),
    stage: data.get('stage'),
    object_type: data.get('object_type'),
    safe_orienter: data.get('safe_orienter'),
    planned_date: data.get('planned_date'),
    documents_url: data.get('documents_url'),
    known_facts: data.get('known_facts'),
    funding: data.getAll('funding'),
    circumstances: data.getAll('circumstances')
  };
}

function renderMessages(validation) {
  const target = document.getElementById('consultationMessages');
  const errors = validation.errors.map((item) => `<div class="consultation-message error">${esc(item)}</div>`).join('');
  const warnings = validation.warnings.map((item) => `<div class="consultation-message warning">${esc(item)}</div>`).join('');
  target.innerHTML = `${errors ? `<div class="consultation-errors">${errors}</div>` : ''}${warnings ? `<div class="consultation-warnings">${warnings}</div>` : ''}`;
}

function renderRoute(input) {
  const route = consultationRouting(input);
  document.getElementById('consultationRoute').innerHTML = `<div class="consultation-route-item"><b>Основной адресат</b><span>Юрист · ${route.lawyer_priority === 'high' ? 'повышенная срочность' : 'обычная очередь'}</span></div><div class="consultation-route-item"><b>Ипотечный брокер</b><span>${esc(route.broker_scope)}</span></div><div class="consultation-route-item"><b>Граница ответственности</b><span>${esc(route.legal_scope)}</span></div><div class="consultation-route-item"><b>Важно</b><span>${esc(route.disclaimer)}</span></div>`;
}

function setStatus(text, tone = '') {
  const target = document.getElementById('consultationStatus');
  target.textContent = text;
  target.className = `consultation-inline-status ${tone}`.trim();
}

function updatePreview(showErrors = false) {
  const input = readForm();
  const validation = validateConsultationInput(input);
  renderRoute(input);
  if (showErrors) renderMessages(validation);
  const output = document.getElementById('consultationOutput');
  const copyButton = document.getElementById('copyConsultation');
  const transferButton = document.getElementById('transferConsultation');
  const handoff = buildConsultationHandoff(input);
  lastHandoff = handoff.ok ? handoff : null;
  if (handoff.ok) {
    output.textContent = handoff.text;
    copyButton.disabled = false;
    transferButton.disabled = false;
  } else {
    output.textContent = 'Заполните минимальные факты. Здесь появится структурированный текст для передачи юристу.';
    copyButton.disabled = true;
    transferButton.disabled = true;
  }
  return validation;
}

async function copyHandoff() {
  if (!lastHandoff?.text) return;
  try {
    await navigator.clipboard.writeText(lastHandoff.text);
    setStatus('Текст передачи скопирован.', 'success');
  } catch (_) {
    const area = document.createElement('textarea');
    area.value = lastHandoff.text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    setStatus(copied ? 'Текст передачи скопирован.' : 'Не удалось скопировать автоматически. Выделите текст вручную.', copied ? 'success' : 'error');
  }
}

function transferToWizard() {
  const result = consultationToWizardDraft(readForm());
  renderMessages(result);
  if (!result.ok || !result.draft) {
    setStatus('Исправьте отмеченные поля перед переносом.', 'error');
    return;
  }
  let existing = {};
  try { existing = JSON.parse(localStorage.getItem(WIZARD_DRAFT_KEY) || '{}') || {}; } catch (_) { existing = {}; }
  const merged = { ...result.draft, ...existing };
  localStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(merged));
  setStatus('Безопасные факты перенесены. Открываю полный мастер...', 'success');
  window.location.href = './spn-v2.html';
}

function bindForm() {
  const form = document.getElementById('consultationForm');
  form.addEventListener('input', () => updatePreview(false));
  form.addEventListener('change', () => updatePreview(false));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const validation = updatePreview(true);
    if (!validation.ok) {
      setStatus('Исправьте ошибки в минимальных фактах.', 'error');
      document.getElementById('consultationMessages')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setStatus('Передача сформирована. Проверьте текст перед отправкой.', 'success');
    document.getElementById('consultationOutput')?.focus();
  });
  form.addEventListener('reset', () => {
    requestAnimationFrame(() => {
      lastHandoff = null;
      document.getElementById('consultationMessages').innerHTML = '';
      setStatus('');
      updatePreview(false);
    });
  });
  document.getElementById('copyConsultation').addEventListener('click', copyHandoff);
  document.getElementById('transferConsultation').addEventListener('click', transferToWizard);
  updatePreview(false);
}

async function init() {
  const user = getCachedUser();
  if (!user?.id) {
    accessCard('Нужна авторизация', 'Быстрая консультация доступна только участникам процесса Navigator.');
    return;
  }
  try {
    currentProfile = await getMyProfile({ refresh: false, timeout: 6000 });
  } catch (error) {
    accessCard('Не удалось проверить профиль', error?.message || 'Повторите вход в Навигатор.');
    return;
  }
  if (!consultationRoleAllowed(currentProfile?.role)) {
    accessCard('Нет доступа к консультации', `Роль «${currentProfile?.role || 'не определена'}» не участвует в юридическом consultation intake. Разрешённые роли: ${CONSULTATION_ALLOWED_ROLES.join(', ')}.`, './dashboard-v2.html', 'Вернуться на рабочий стол');
    return;
  }
  app.innerHTML = formTemplate();
  bindForm();
}

init();
