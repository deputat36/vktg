import { getMyProfile } from './crmApi.js';
import { getDeal } from '../ui/form.js';
import { normalizeDeal } from '../core/dealSchema.js';

let role = 'unknown';
let enabled = false;
let activeSmartStep = Number(localStorage.getItem('spn_active_smart_step_v1') || '0');

const SMART_STEP_MAP = [
  { title: 'Суть сделки', hint: 'Что готовим, кого представляем, что продаем и кто собственники.', stages: [0, 1, 2, 3] },
  { title: 'Документы и деньги', hint: 'Документы основания, источники денег и порядок расчетов.', stages: [4, 5, 6] },
  { title: 'Дети и особенности', hint: 'Дети, маткапитал, доли, доверенности, обременения и другие риски.', stages: [7, 8] },
  { title: 'Минимум данных', hint: 'Адрес, цена, телефоны и уточнения, которые нужны для проверки.', stages: [9] },
  { title: 'Проверка', hint: 'Сформировать результат, проверить риски, сохранить и открыть задачи.', stages: [] }
];

function get(id) { return document.getElementById(id); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
function leftPanel() { return document.querySelector('aside.panel.left'); }
function resultPanel() { return document.querySelector('.panel.result'); }
function safeDeal() { try { return getDeal(); } catch (_) { return {}; } }
function safeSchema() { try { return normalizeDeal(safeDeal()); } catch (_) { return null; } }

function loadCss() {
  if (document.querySelector('link[href="./assets/css/spn-experience.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/css/spn-experience.css';
  document.head.appendChild(link);
}

async function detectRole() {
  try {
    const profile = await getMyProfile();
    role = profile?.role || 'unknown';
  } catch (_) {
    role = localStorage.getItem('navigator_role_workspace_v1') || 'unknown';
  }
  enabled = role === 'spn' || localStorage.getItem('force_spn_experience_v1') === '1';
  if (enabled) document.body.classList.add('spn-experience');
}

function dealProgress() {
  const deal = safeDeal();
  const schema = safeSchema();
  const checks = [
    Boolean(deal.objectType || deal.object_type),
    Boolean(deal.address),
    Boolean(deal.priceFact || deal.price_fact),
    Boolean((deal.payments || []).length || deal.bankType),
    Boolean((deal.basis || []).length),
    Boolean((deal.settlements || []).length),
    Boolean(deal.folderLink || deal.stEgrn === 'получено' || deal.stEgrn === 'проверено'),
    Boolean(schema && !schema.required?.length)
  ];
  const done = checks.filter(Boolean).length;
  const percent = Math.round(done / checks.length * 100);
  return { percent, done, total: checks.length, schema, deal };
}

function nextSteps() {
  const { schema, deal } = dealProgress();
  const steps = [];
  if (!deal.objectType && !deal.object_type) steps.push('Выберите, что продаем по документам: квартира, дом + земля, доля, ДДУ и т.д.');
  if (!(deal.basis || []).length) steps.push('Укажите документ-основание: купля-продажа, наследство, приватизация, ДДУ, дарение и т.д.');
  if (!(deal.payments || []).length && !deal.bankType) steps.push('Выберите источник денег: свои, ипотека, маткапитал, детские деньги, сертификаты.');
  if (!(deal.settlements || []).length) steps.push('Выберите порядок расчетов: СБР, аккредитив, ячейка, СФР, перевод после регистрации.');
  if (!deal.address) steps.push('Укажите адрес объекта. Без адреса юрист/брокер не смогут проверить сделку.');
  if (!deal.priceFact && !deal.price_fact) steps.push('Укажите фактическую цену и проверьте, совпадает ли она с ценой в договоре.');
  if (schema?.owners?.hasChildren) steps.push('Опишите участие детей: собственник, покупатель, зарегистрирован, маткапитал или детские деньги.');
  if (schema?.needs?.broker) steps.push('Заполните статус банка/Домклика: одобрение, оценка, СБР, какие документы загружены.');
  if (schema?.property?.needsNspd) steps.push('Укажите кадастровый номер земли и проверьте участок в НСПД.');
  if (schema?.required?.length) steps.push('Закройте недостающие пункты: ' + schema.required.slice(0, 4).join(', ') + (schema.required.length > 4 ? '...' : ''));
  if (!steps.length) steps.push('Сформируйте результат, проверьте сводку и сохраните карточку.');
  return steps.slice(0, 5);
}

function stepStatus(index) {
  const { deal, schema } = dealProgress();
  const done = [
    Boolean(deal.objectType || deal.object_type),
    Boolean((deal.basis || []).length && (deal.payments || []).length && (deal.settlements || []).length),
    Boolean(!schema?.owners?.hasChildren || deal.buyerSideComment || deal.questions),
    Boolean(deal.address && (deal.priceFact || deal.price_fact)),
    Boolean(!schema?.required?.length)
  ];
  const current = done.findIndex((x) => !x);
  if (done[index]) return 'done';
  if (current === index || (current === -1 && index === 4)) return 'current';
  return '';
}

function ensureSpnFlow() {
  if (!enabled || get('spnFlow')) return;
  const panel = leftPanel();
  const smart = get('smartDealIntake');
  if (!panel) return;
  const box = document.createElement('section');
  box.id = 'spnFlow';
  box.innerHTML = flowHtml();
  if (smart) smart.insertAdjacentElement('beforebegin', box);
  else panel.insertAdjacentElement('afterbegin', box);
  bindFlow();
  setupInlineSmartWizard();
}

function flowHtml() {
  const { percent } = dealProgress();
  const steps = nextSteps();
  return `
    <div class="spn-flow-head">
      <div><h2>Рабочее место СПН</h2><p>Один простой мастер. Выбранный шаг раскрывается сразу ниже, кнопки управления — под текущим шагом.</p></div>
      <span class="spn-flow-badge">${percent}% заполнено</span>
    </div>
    <div class="spn-progress"><span style="width:${percent}%"></span></div>
    <div class="spn-step-list">
      ${SMART_STEP_MAP.map((item, index) => `<button type="button" class="spn-step ${stepStatus(index)} ${activeSmartStep === index ? 'current' : ''}" data-spn-step="${index}"><span class="spn-step-num">${index + 1}</span><span><b>${esc(item.title)}</b><small>${esc(item.hint)}</small></span></button>`).join('')}
    </div>
    <div class="spn-next-box"><h3>Что важно заполнить</h3><ul>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
    <div class="spn-actions">
      <button type="button" class="primary" data-spn-action="generate">Сформировать результат</button>
      <button type="button" class="success" data-spn-action="save">Сохранить</button>
      <button type="button" class="soft" data-spn-action="tasks">Мои задачи</button>
      <button id="spnWorkflowToggle" type="button" class="soft">Показать юриста/брокера/ленту</button>
    </div>
  `;
}

function bindFlow() {
  get('spnFlow')?.querySelectorAll('[data-spn-step]').forEach((button) => {
    button.onclick = () => {
      activeSmartStep = Number(button.dataset.spnStep);
      localStorage.setItem('spn_active_smart_step_v1', String(activeSmartStep));
      refreshFlow();
      renderActiveSmartStep();
      get('smartDealIntake')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });
  get('spnFlow')?.querySelectorAll('[data-spn-action]').forEach((button) => {
    button.onclick = () => {
      const action = button.dataset.spnAction;
      if (action === 'generate') get('btnGenerate')?.click();
      if (action === 'save') get('btnSaveCloud')?.click();
      if (action === 'tasks') document.querySelector('[data-tab="dealTasks"]')?.click();
    };
  });
  get('spnWorkflowToggle')?.addEventListener('click', () => {
    document.body.classList.toggle('spn-show-workflow');
    get('spnWorkflowToggle').textContent = document.body.classList.contains('spn-show-workflow') ? 'Скрыть лишние вкладки' : 'Показать юриста/брокера/ленту';
  });
}

function setupInlineSmartWizard() {
  const intake = get('smartDealIntake');
  if (!intake || get('spnSmartShell')) return;
  const shell = document.createElement('div');
  shell.id = 'spnSmartShell';
  shell.className = 'spn-smart-shell';
  shell.innerHTML = `<div class="spn-smart-title"><div><b id="spnSmartTitle"></b><span id="spnSmartHint"></span></div><div id="spnSmartDots" class="spn-smart-dots"></div></div><div id="spnSmartNav" class="spn-smart-nav"></div>`;
  const firstStage = intake.querySelector('.smart-stage');
  if (firstStage) firstStage.insertAdjacentElement('beforebegin', shell);
  else intake.insertAdjacentElement('afterbegin', shell);
  renderActiveSmartStep();
}

function renderActiveSmartStep() {
  if (!enabled) return;
  const intake = get('smartDealIntake');
  if (!intake) return;
  const stages = [...intake.querySelectorAll('.smart-stage')];
  const cfg = SMART_STEP_MAP[activeSmartStep] || SMART_STEP_MAP[0];
  stages.forEach((stage, index) => stage.classList.toggle('spn-active-smart-stage', cfg.stages.includes(index)));
  const title = get('spnSmartTitle');
  const hint = get('spnSmartHint');
  const dots = get('spnSmartDots');
  const nav = get('spnSmartNav');
  if (title) title.textContent = `${activeSmartStep + 1}. ${cfg.title}`;
  if (hint) hint.textContent = cfg.hint;
  if (dots) dots.innerHTML = SMART_STEP_MAP.map((_, index) => `<span class="spn-smart-dot ${index === activeSmartStep ? 'active' : index < activeSmartStep ? 'done' : ''}"></span>`).join('');
  if (nav) nav.innerHTML = `
    <button type="button" class="soft" data-spn-smart-prev ${activeSmartStep === 0 ? 'disabled' : ''}>Назад</button>
    <button type="button" class="primary" data-spn-smart-next>${activeSmartStep >= SMART_STEP_MAP.length - 1 ? 'Сформировать результат' : 'Далее'}</button>
    <button type="button" class="success" data-spn-smart-save>Сохранить</button>
    <button id="spnDetailsToggle" type="button" class="soft spn-detail-toggle">${document.body.classList.contains('spn-show-details') ? 'Скрыть уточнения' : 'Показать уточнения'}</button>
  `;
  nav.querySelector('[data-spn-smart-prev]').onclick = () => {
    if (activeSmartStep > 0) {
      activeSmartStep -= 1;
      localStorage.setItem('spn_active_smart_step_v1', String(activeSmartStep));
      refreshFlow();
      renderActiveSmartStep();
    }
  };
  nav.querySelector('[data-spn-smart-next]').onclick = () => {
    if (activeSmartStep < SMART_STEP_MAP.length - 1) {
      activeSmartStep += 1;
      localStorage.setItem('spn_active_smart_step_v1', String(activeSmartStep));
      refreshFlow();
      renderActiveSmartStep();
      get('smartDealIntake')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      get('btnGenerate')?.click();
      document.querySelector('[data-tab="summary"]')?.click();
      resultPanel()?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  nav.querySelector('[data-spn-smart-save]').onclick = () => get('btnSaveCloud')?.click();
  nav.querySelector('#spnDetailsToggle').onclick = () => {
    document.body.classList.toggle('spn-show-details');
    renderActiveSmartStep();
  };
  if (activeSmartStep === SMART_STEP_MAP.length - 1) {
    get('btnGenerate')?.click();
    document.querySelector('[data-tab="summary"]')?.click();
  }
}

function refreshFlow() {
  if (!enabled) return;
  const box = get('spnFlow');
  if (!box) return;
  box.innerHTML = flowHtml();
  bindFlow();
}

function addResultNote() {
  if (!enabled || get('spnCleanResultNote')) return;
  const result = resultPanel();
  if (!result) return;
  const note = document.createElement('div');
  note.id = 'spnCleanResultNote';
  note.className = 'spn-clean-result-note';
  note.innerHTML = '<b>Правый блок — это результат вашей работы.</b><br>Сначала заполните сделку слева, затем смотрите здесь сводку, задачи и что нужно передать юристу или брокеру.';
  result.insertAdjacentElement('afterbegin', note);
}

function simplifyText() {
  if (!enabled) return;
  const hero = get('uxCommandCenter')?.querySelector('.ux-hero');
  if (hero && !hero.dataset.spnText) {
    hero.dataset.spnText = '1';
    const h2 = hero.querySelector('h2');
    const p = hero.querySelector('p');
    if (h2) h2.textContent = 'Заполнение сделки для СПН';
    if (p) p.textContent = 'Не нужно заполнять всё подряд. Идите по шагам: суть сделки, документы, деньги, расчет, проверка риска.';
  }
}

async function start() {
  loadCss();
  await detectRole();
  if (!enabled) return;
  ensureSpnFlow();
  setupInlineSmartWizard();
  renderActiveSmartStep();
  addResultNote();
  simplifyText();
  refreshFlow();
  document.addEventListener('input', () => setTimeout(() => { refreshFlow(); renderActiveSmartStep(); }, 160));
  document.addEventListener('change', () => setTimeout(() => { refreshFlow(); renderActiveSmartStep(); }, 160));
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (document.querySelector('main.grid') && leftPanel()) {
    clearInterval(timer);
    start();
  }
  if (attempts > 80) clearInterval(timer);
}, 250);
