import { setupTop, getCachedUser, getMyProfile, renderAuthBox, esc } from './supabase-v2.js';
import {
  CONSULTATION_REPRESENTATIONS,
  CONSULTATION_STAGES,
  CONSULTATION_OBJECT_TYPES,
  CONSULTATION_PAYMENTS,
  CONSULTATION_FLAGS,
  buildConsultationHandoff,
  buildWizardDraftFromConsultation,
  consultationCompleteness,
  consultationResponseOptions,
  routeConsultationIntake,
  validateConsultationIntake
} from './consultation-intake-model-v2.js?v=20260716-01';

const app = document.getElementById('app');
const DRAFT_KEY = 'nav_deal_draft_v2';
const ALLOWED_ROLES = new Set(['owner', 'admin', 'manager', 'spn', 'lawyer']);
let profile = null;
let mode = 'guided';

function optionButtons(group, items, multiple = false) {
  return `<div class="consult-option-grid" data-choice-group="${esc(group)}" data-multiple="${multiple ? 'true' : 'false'}">${items.map((item) => `<button class="option" type="button" data-choice="${esc(item.value)}"><b>${esc(item.label)}</b></button>`).join('')}</div>`;
}

function selectOptions(items) {
  return items.map((item) => `<option value="${esc(item.value)}">${esc(item.label)}</option>`).join('');
}

function field(id, label, placeholder = '', type = 'text') {
  return `<div class="field"><label for="${esc(id)}">${esc(label)}</label><input id="${esc(id)}" type="${esc(type)}" placeholder="${esc(placeholder)}"></div>`;
}

function textarea(id, label, placeholder = '') {
  return `<div class="field"><label for="${esc(id)}">${esc(label)}</label><textarea id="${esc(id)}" placeholder="${esc(placeholder)}"></textarea></div>`;
}

function pageHtml() {
  const responseOptions = consultationResponseOptions();
  return `<main class="nav-v2-shell consultation-shell">
    <section class="hero consultation-hero">
      <span class="role-home-eyebrow">Без полного мастера</span>
      <h1>Быстрая консультация юриста</h1>
      <p>Зафиксируйте вопрос и минимальные факты. Navigator подготовит понятную передачу, но не создаст сделку, документы, риски или задачи до подтверждения маршрута.</p>
      <div class="actions" style="justify-content:flex-start">
        <button class="btn primary" type="button" data-mode="guided">С подсказками</button>
        <button class="btn light" type="button" data-mode="expert">Быстро</button>
        <a class="btn light" href="./spn-v2.html">Полный мастер</a>
      </div>
    </section>

    <section class="consult-layout">
      <div class="consult-form-column">
        <section class="card consult-step" data-guided-section>
          <div class="section-title"><div><span class="consult-step-number">1</span><h2>Что нужно понять</h2></div><span class="pill blue">обязательно</span></div>
          ${textarea('consultQuestion', 'Конкретный вопрос юристу', 'Например: можно ли согласовывать задаток при такой схеме расчётов и какие условия нужно зафиксировать?')}
          ${field('consultDesiredResult', 'Какой результат нужен', 'Ответ о допустимости, список условий, перечень уточнений')}
          <p class="muted guided-copy">Не пересказывайте всю историю. Один вопрос — один проверяемый результат.</p>
        </section>

        <section class="card consult-step">
          <div class="section-title"><div><span class="consult-step-number">2</span><h2>Минимальный контекст</h2></div><span class="pill">без ФИО и телефонов</span></div>
          <div class="grid">
            <div class="field"><label for="consultRepresentation">Кого сопровождаем</label><select id="consultRepresentation"><option value="">Выберите сторону</option>${selectOptions(CONSULTATION_REPRESENTATIONS)}</select></div>
            <div class="field"><label for="consultStage">Текущая стадия</label><select id="consultStage"><option value="">Выберите стадию</option>${selectOptions(CONSULTATION_STAGES)}</select></div>
          </div>
          <div class="grid">
            <div class="field"><label for="consultObjectType">Тип объекта</label><select id="consultObjectType"><option value="">Выберите тип</option>${selectOptions(CONSULTATION_OBJECT_TYPES)}</select></div>
            ${field('consultObjectReference', 'Безопасный ориентир', 'район, улица или CRM-ID — без номера квартиры')}
          </div>
          ${textarea('consultKnownFacts', 'Известные факты', '2–4 факта: кто собственник, основание права, что уже согласовано, в чём сомнение. Без идентификации клиента.')}
        </section>

        <section class="card consult-step">
          <div class="section-title"><div><span class="consult-step-number">3</span><h2>Деньги и особые обстоятельства</h2></div><span class="pill yellow">маршрут</span></div>
          <h3>Источники средств</h3>
          ${optionButtons('payments', CONSULTATION_PAYMENTS, true)}
          <h3>Что уже известно</h3>
          ${optionButtons('flags', CONSULTATION_FLAGS, true)}
          <div class="grid consult-meta-grid">
            ${field('consultPlannedDate', 'Плановая дата, если известна', '', 'date')}
            <div class="field"><label for="consultFolderStatus">Папка документов</label><select id="consultFolderStatus"><option value="">Не указано</option><option value="Папка уже создана">Папка уже создана</option><option value="Документы собираются">Документы собираются</option><option value="Папки пока нет">Папки пока нет</option></select></div>
          </div>
          <p class="muted guided-copy">Маткапитал и сертификаты относятся к СПН и юристу. Ипотечный брокер подключается только при ипотеке или военной ипотеке.</p>
        </section>

        <section class="card consult-step">
          <div class="section-title"><div><span class="consult-step-number">4</span><h2>Проверить передачу</h2></div><span class="pill green">одно действие</span></div>
          <div class="field"><label for="consultConversionTarget">Если понадобится полный мастер</label><select id="consultConversionTarget"><option value="check_docs">Проверка документов / уточнение маршрута</option><option value="deposit">Подготовка к задатку</option><option value="deal">Подготовка основной сделки</option></select></div>
          <div class="actions" style="justify-content:flex-start">
            <button class="btn primary" id="buildConsultation" type="button">Сформировать передачу</button>
            <button class="btn light" id="clearConsultation" type="button">Очистить</button>
          </div>
          <p class="small">В будущей рабочей версии ответ юриста будет одним из трёх: ${responseOptions.map((item) => esc(item.label)).join(' · ')}.</p>
        </section>
      </div>

      <aside class="consult-result-column">
        <section class="card consultation-sticky">
          <div class="section-title"><div><h2>Результат</h2><p class="muted">Предварительная маршрутизация, не юридическое заключение</p></div><span class="pill" id="consultCompleteness">0%</span></div>
          <div id="consultValidation" class="status warn"><b>Заполните обязательные поля.</b><p>Navigator проверит минимум и сформирует структурированный вопрос.</p></div>
          <div id="consultRoute" hidden></div>
          <pre id="consultHandoff" class="consult-handoff" hidden></pre>
          <div id="consultActions" class="actions consult-result-actions" hidden>
            <button class="btn primary" id="copyConsultation" type="button">Скопировать передачу</button>
            <button class="btn light" id="transferConsultation" type="button">Перенести в полный мастер</button>
          </div>
          <div id="consultStatus" class="small" role="status" aria-live="polite"></div>
        </section>
      </aside>
    </section>
  </main>`;
}

function selected(group) {
  return [...document.querySelectorAll(`[data-choice-group="${group}"] [data-choice].active`)].map((item) => item.dataset.choice).filter(Boolean);
}

function readForm() {
  return {
    mode,
    question: document.getElementById('consultQuestion')?.value,
    desiredResult: document.getElementById('consultDesiredResult')?.value,
    representation: document.getElementById('consultRepresentation')?.value,
    stage: document.getElementById('consultStage')?.value,
    objectType: document.getElementById('consultObjectType')?.value,
    safeObjectReference: document.getElementById('consultObjectReference')?.value,
    knownFacts: document.getElementById('consultKnownFacts')?.value,
    payments: selected('payments'),
    flags: selected('flags'),
    plannedDate: document.getElementById('consultPlannedDate')?.value,
    documentFolderStatus: document.getElementById('consultFolderStatus')?.value,
    conversionTarget: document.getElementById('consultConversionTarget')?.value
  };
}

function setMode(nextMode) {
  mode = nextMode === 'expert' ? 'expert' : 'guided';
  document.body.dataset.consultationMode = mode;
  document.querySelectorAll('[data-mode]').forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('primary', active);
    button.classList.toggle('light', !active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function toggleChoice(button) {
  const group = button.closest('[data-choice-group]');
  if (!group) return;
  const multiple = group.dataset.multiple === 'true';
  const value = button.dataset.choice;
  if (!multiple) group.querySelectorAll('[data-choice]').forEach((item) => item.classList.remove('active'));
  if (multiple && (value === 'unknown' || value === 'noneKnown')) {
    group.querySelectorAll('[data-choice]').forEach((item) => item.classList.remove('active'));
  } else if (multiple) {
    group.querySelectorAll('[data-choice="unknown"], [data-choice="noneKnown"]').forEach((item) => item.classList.remove('active'));
  }
  button.classList.toggle('active');
  updateCompleteness();
}

function updateCompleteness() {
  const percent = consultationCompleteness(readForm());
  const badge = document.getElementById('consultCompleteness');
  if (badge) {
    badge.textContent = `${percent}%`;
    badge.className = `pill ${percent >= 85 ? 'green' : percent >= 60 ? 'yellow' : ''}`;
  }
}

function validationHtml(validation) {
  if (validation.valid && !validation.warnings.length) return '<div class="status ok"><b>Минимум собран.</b><p>Передачу можно отправлять юристу.</p></div>';
  const errors = validation.errors.length ? `<h3>Нужно исправить</h3><ul>${validation.errors.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '';
  const warnings = validation.warnings.length ? `<h3>Можно уточнить</h3><ul>${validation.warnings.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '';
  return `<div class="status ${validation.valid ? 'warn' : 'error'}">${errors}${warnings}</div>`;
}

function routeHtml(route) {
  return `<section class="status ${route.stopBeforeDeposit ? 'error' : route.urgent ? 'warn' : 'ok'}">
    <b>${route.stopBeforeDeposit ? 'До задатка нужен ответ юриста' : 'Основной маршрут — юрист'}</b>
    <p>${esc(route.nextAction)}</p>
    ${route.brokerNeeded ? `<p><b>Ипотечный брокер параллельно:</b> ${esc(route.brokerAction)}</p>` : ''}
    <div class="actions" style="justify-content:flex-start">${route.reasons.map((item) => `<span class="pill ${item.includes('Параллельно') ? 'blue' : 'yellow'}">${esc(item)}</span>`).join('')}</div>
    <p class="small">Автоматический backlog до подтверждения маршрута не создаётся.</p>
  </section>`;
}

function buildResult() {
  const form = readForm();
  const validation = validateConsultationIntake(form);
  const handoff = buildConsultationHandoff(form);
  const validationBox = document.getElementById('consultValidation');
  const routeBox = document.getElementById('consultRoute');
  const handoffBox = document.getElementById('consultHandoff');
  const actions = document.getElementById('consultActions');
  validationBox.outerHTML = `<div id="consultValidation">${validationHtml(validation)}</div>`;
  updateCompleteness();

  if (!handoff.valid) {
    routeBox.hidden = true;
    handoffBox.hidden = true;
    actions.hidden = true;
    return;
  }

  const route = routeConsultationIntake(form);
  routeBox.innerHTML = routeHtml(route);
  routeBox.hidden = false;
  handoffBox.textContent = handoff.text;
  handoffBox.hidden = false;
  actions.hidden = false;
  document.getElementById('consultStatus').textContent = 'Передача сформирована локально. В Supabase ничего не сохранено.';
}

async function copyResult() {
  const text = document.getElementById('consultHandoff')?.textContent || '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    document.getElementById('consultStatus').textContent = 'Передача скопирована. Её можно отправить в eChat юристу.';
  } catch (_) {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('consultHandoff'));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.getElementById('consultStatus').textContent = 'Текст выделен. Нажмите Ctrl+C.';
  }
}

function transferToWizard() {
  const result = buildWizardDraftFromConsultation(readForm());
  if (!result.valid) {
    buildResult();
    return;
  }
  localStorage.setItem(DRAFT_KEY, JSON.stringify(result.draft));
  document.getElementById('consultStatus').textContent = 'Безопасные факты перенесены. Открываю полный мастер…';
  location.href = './spn-v2.html';
}

function clearForm() {
  document.querySelectorAll('.consultation-shell input, .consultation-shell textarea').forEach((item) => { item.value = ''; });
  document.querySelectorAll('.consultation-shell select').forEach((item) => { item.selectedIndex = 0; });
  document.querySelectorAll('[data-choice].active').forEach((item) => item.classList.remove('active'));
  document.getElementById('consultRoute').hidden = true;
  document.getElementById('consultHandoff').hidden = true;
  document.getElementById('consultActions').hidden = true;
  document.getElementById('consultValidation').innerHTML = '<div class="status warn"><b>Заполните обязательные поля.</b><p>Navigator проверит минимум и сформирует структурированный вопрос.</p></div>';
  document.getElementById('consultStatus').textContent = '';
  updateCompleteness();
  document.getElementById('consultQuestion')?.focus();
}

function bind() {
  document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
  document.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', () => toggleChoice(button)));
  document.querySelectorAll('.consultation-shell input, .consultation-shell textarea, .consultation-shell select').forEach((item) => item.addEventListener('input', updateCompleteness));
  document.getElementById('buildConsultation').addEventListener('click', buildResult);
  document.getElementById('copyConsultation').addEventListener('click', copyResult);
  document.getElementById('transferConsultation').addEventListener('click', transferToWizard);
  document.getElementById('clearConsultation').addEventListener('click', clearForm);
  setMode('guided');
  updateCompleteness();
}

async function init() {
  setupTop('consultation');
  if (!getCachedUser()) return renderAuthBox(app, async () => location.reload());
  try {
    profile = await getMyProfile({ timeout: 10000 });
  } catch (error) {
    app.innerHTML = `<main class="nav-v2-shell"><section class="card"><div class="status error">${esc(error.message || String(error))}</div></section></main>`;
    return;
  }
  if (!ALLOWED_ROLES.has(profile?.role)) {
    app.innerHTML = `<main class="nav-v2-shell"><section class="card"><div class="status error"><b>Экран недоступен для роли ${esc(profile?.role || 'не определена')}.</b><p>Юридическую консультацию создаёт СПН, менеджер или администратор; юрист может использовать шаблон для проверки структуры вопроса.</p></div><a class="btn light" href="./dashboard-v2.html">Рабочий стол</a></section></main>`;
    return;
  }
  app.innerHTML = pageHtml();
  bind();
}

init();
