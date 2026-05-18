const STEPS = [
  {
    id: 'scenario',
    title: 'Сценарий',
    icon: '⚡',
    hint: 'Выберите типовую заготовку или начните ручное заполнение.',
    match: (section) => section.textContent.includes('Быстрые сценарии')
  },
  {
    id: 'main',
    title: 'Основное',
    icon: '👤',
    hint: 'Укажите режим, этап, юриста, менеджера и ответственных СПН.',
    match: (section) => section.textContent.includes('Основное')
  },
  {
    id: 'parties',
    title: 'Стороны',
    icon: '🤝',
    hint: 'Заполните продавцов, покупателей, представителей и важные особенности сторон.',
    match: (section) => section.textContent.includes('Стороны сделки')
  },
  {
    id: 'object',
    title: 'Объект',
    icon: '🏠',
    hint: 'Проверьте тип объекта, форму права, адрес, кадастровые номера и цену.',
    match: (section) => section.textContent.includes('Объект')
  },
  {
    id: 'finance',
    title: 'Финансы',
    icon: '₽',
    hint: 'Зафиксируйте комиссии, госпошлины, оценку, СБР, нотариуса и расходы банка.',
    match: (section) => section.textContent.includes('Финансы / комиссии / расходы')
  },
  {
    id: 'conditions',
    title: 'Условия',
    icon: '📌',
    hint: 'Выберите основания, форму расчета, сертификаты, банк и особенности сделки.',
    match: (section) => section.textContent.includes('Основания, расчет, особенности')
  },
  {
    id: 'documents',
    title: 'Документы',
    icon: '📄',
    hint: 'Укажите статус ЕГРН, справки о зарегистрированных, ссылку на папку и вопросы юристу.',
    match: (section) => section.textContent.includes('Документы')
  }
];

let activeStep = localStorage.getItem('navigator_active_step_v1') || 'scenario';

function get(id) {
  return document.getElementById(id);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function leftPanel() {
  return document.querySelector('aside.panel.left');
}

function resultPanel() {
  return document.querySelector('.panel.result');
}

function sections() {
  return [...document.querySelectorAll('aside.panel.left > section')];
}

function findStepForSection(section) {
  return STEPS.find((step) => step.match(section));
}

function currentStepIndex() {
  return Math.max(0, STEPS.findIndex((step) => step.id === activeStep));
}

function setActiveStep(stepId) {
  activeStep = stepId;
  localStorage.setItem('navigator_active_step_v1', activeStep);
  renderStepState();
}

function ensureWizard() {
  const panel = leftPanel();
  if (!panel || get('stepWizard')) return;

  sections().forEach((section) => {
    const step = findStepForSection(section);
    if (step) section.dataset.step = step.id;
  });

  const wizard = document.createElement('div');
  wizard.id = 'stepWizard';
  wizard.className = 'step-wizard box blue';
  wizard.innerHTML = `
    <div class="wizard-head">
      <div>
        <h2>Навигатор заполнения</h2>
        <p id="stepHint" class="small"></p>
      </div>
      <button id="btnToggleAllSteps" class="light" type="button">Показать всё</button>
    </div>
    <div class="step-progress"><div id="stepProgressBar"></div></div>
    <div class="step-list">
      ${STEPS.map((step, index) => `
        <button type="button" class="step-btn" data-step-id="${step.id}">
          <span class="step-num">${index + 1}</span>
          <span class="step-icon">${step.icon}</span>
          <span>${esc(step.title)}</span>
        </button>
      `).join('')}
    </div>
    <div class="wizard-actions">
      <button id="btnPrevStep" class="light" type="button">Назад</button>
      <button id="btnNextStep" type="button">Дальше</button>
      <button id="btnGoResult" class="green" type="button">К результату</button>
    </div>
  `;

  panel.insertBefore(wizard, panel.firstChild);

  wizard.querySelectorAll('[data-step-id]').forEach((button) => {
    button.onclick = () => setActiveStep(button.dataset.stepId);
  });

  get('btnPrevStep').onclick = () => {
    const i = currentStepIndex();
    if (i > 0) setActiveStep(STEPS[i - 1].id);
  };

  get('btnNextStep').onclick = () => {
    const i = currentStepIndex();
    if (i < STEPS.length - 1) setActiveStep(STEPS[i + 1].id);
    else document.getElementById('btnGenerate')?.click();
  };

  get('btnGoResult').onclick = () => {
    document.getElementById('btnGenerate')?.click();
    document.querySelector('[data-tab="summary"]')?.click();
    resultPanel()?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  get('btnToggleAllSteps').onclick = () => {
    const all = document.body.dataset.allSteps === 'true';
    document.body.dataset.allSteps = all ? 'false' : 'true';
    get('btnToggleAllSteps').textContent = all ? 'Показать всё' : 'По шагам';
    renderStepState();
  };
}

function stepCompletion(step) {
  const required = {
    scenario: ['mode'],
    main: ['lawyer', 'manager', 'sellerSpn', 'buyerSpn', 'sellerPhone', 'buyerPhone'],
    parties: ['sellerCount', 'buyerCount'],
    object: ['objectType', 'rightForm', 'address', 'priceFact', 'priceContract'],
    finance: ['sellerRealtorCommission', 'registrationFeeAmount'],
    conditions: ['bankType'],
    documents: ['stEgrn', 'stRegistered', 'folderLink']
  }[step.id] || [];

  if (!required.length) return 100;
  const done = required.filter((id) => {
    const el = get(id);
    return el && String(el.value || '').trim();
  }).length;
  return Math.round(done / required.length * 100);
}

function renderStepState() {
  const allMode = document.body.dataset.allSteps === 'true';
  const current = STEPS[currentStepIndex()] || STEPS[0];

  sections().forEach((section) => {
    const stepId = section.dataset.step;
    if (!stepId) return;
    section.classList.toggle('wizard-section', true);
    section.classList.toggle('active-step-section', allMode || stepId === activeStep);
  });

  document.querySelectorAll('.step-btn').forEach((button) => {
    const step = STEPS.find((item) => item.id === button.dataset.stepId);
    const complete = stepCompletion(step);
    button.classList.toggle('active', button.dataset.stepId === activeStep);
    button.classList.toggle('complete', complete >= 80);
    button.title = step.title + ': заполнено примерно ' + complete + '%';
  });

  const hint = get('stepHint');
  if (hint) hint.textContent = current.icon + ' ' + current.hint;

  const progress = get('stepProgressBar');
  if (progress) {
    const percent = Math.round((currentStepIndex() + 1) / STEPS.length * 100);
    progress.style.width = percent + '%';
  }

  const prev = get('btnPrevStep');
  const next = get('btnNextStep');
  if (prev) prev.disabled = currentStepIndex() === 0;
  if (next) next.textContent = currentStepIndex() === STEPS.length - 1 ? 'Сформировать' : 'Дальше';
}

function ensureResultHelper() {
  const panel = resultPanel();
  if (!panel || get('roleResultHelper')) return;
  const helper = document.createElement('div');
  helper.id = 'roleResultHelper';
  helper.className = 'box grayBox result-helper';
  helper.innerHTML = `
    <div class="work-zone-title">
      <div>
        <h2>Результат и коммуникация</h2>
        <p class="small">После заполнения шагов справа появятся сводка, карточка юристу, брокеру, документы, клиентские сообщения, решения и задачи.</p>
      </div>
      <button id="btnResultGenerate" class="green" type="button">Сформировать</button>
    </div>
  `;
  panel.insertBefore(helper, panel.firstChild);
  get('btnResultGenerate').onclick = () => document.getElementById('btnGenerate')?.click();
}

function bindLiveProgress() {
  document.addEventListener('input', () => renderStepState());
  document.addEventListener('change', () => renderStepState());
}

function start() {
  ensureWizard();
  ensureResultHelper();
  bindLiveProgress();
  renderStepState();
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (leftPanel() && resultPanel() && sections().length) {
    clearInterval(timer);
    start();
  }
  if (attempts > 50) clearInterval(timer);
}, 200);
