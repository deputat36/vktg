const STEPS = [
  { title: 'Что готовим?', help: 'Определяем цель: задаток, сделка, проверка или ипотечный сценарий.' },
  { title: 'Кого представляем?', help: 'Это определяет ответственность, доступы, задачи и кому юрист возвращает замечания.' },
  { title: 'Что продаем по документам?', help: 'Выбирайте не бытовое название, а то, что ближе к документам: квартира, доля, дом+земля, СНТ, уступка.' },
  { title: 'Кто собственники?', help: 'Самый важный шаг для риска: взрослые, супруги, несколько собственников, дети, наследство.' },
  { title: 'Документы основания', help: 'От основания права зависят риски: наследство, приватизация, суд, ДДУ, уступка, рента.' },
  { title: 'Источник денег', help: 'Откуда деньги покупателя: свои, ипотека, маткапитал, субсидия, детские средства, НИС.' },
  { title: 'Порядок расчетов', help: 'Как именно будут передаваться деньги: СБР, аккредитив, ячейка, СФР, НИС, перевод после регистрации.' },
  { title: 'Дети в сделке', help: 'Отмечайте детей как собственников, покупателей, зарегистрированных или участников маткапитала/детских средств.' },
  { title: 'Особенности', help: 'Доверенность, обременение, цена отличается, перепланировка, приватизация, банкротство и прочее.' },
  { title: 'Минимум данных', help: 'Адрес, цена и контакты — чтобы карточка была рабочей, а не абстрактной.' },
  { title: 'Нужные уточнения', help: 'Система показывает только детали, которые нужны именно по выбранному сценарию.' }
];

let current = Number(localStorage.getItem('smart_wizard_step') || '0');
let enabled = localStorage.getItem('smart_wizard_enabled') !== '0';

function get(id) { return document.getElementById(id); }
function loadCss() {
  if (document.querySelector('link[href="./assets/css/smart-wizard.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/css/smart-wizard.css';
  document.head.appendChild(link);
}
function stages() {
  const box = get('smartDealIntake');
  if (!box) return [];
  return [...box.querySelectorAll('.smart-stage'), get('smartNeededDetails')].filter(Boolean);
}
function clampStep() {
  const max = Math.max(0, stages().length - 1);
  current = Math.max(0, Math.min(current, max));
}
function progress() {
  const count = stages().length || STEPS.length;
  return Math.round(((current + 1) / count) * 100);
}
function ensureShell() {
  if (get('smartWizardShell')) return;
  const intake = get('smartDealIntake');
  if (!intake) return;
  const shell = document.createElement('div');
  shell.id = 'smartWizardShell';
  shell.className = 'smart-wizard-shell';
  shell.innerHTML = `
    <div class="smart-wizard-top">
      <div>
        <div id="smartWizardTitle" class="smart-wizard-title"></div>
        <div id="smartWizardHelp" class="smart-wizard-help"></div>
      </div>
      <div id="smartWizardCounter" class="smart-wizard-counter"></div>
    </div>
    <div class="smart-wizard-progress"><div id="smartWizardProgress" class="smart-wizard-progress-bar"></div></div>
    <div id="smartWizardDots" class="smart-wizard-dots"></div>
    <div id="smartWizardJump" class="smart-wizard-jump"></div>
    <div class="smart-wizard-controls">
      <div class="left">
        <button id="btnSmartWizardToggle" type="button" class="light">Обычный вид</button>
        <button id="btnSmartWizardStart" type="button" class="light">В начало</button>
      </div>
      <div class="right">
        <button id="btnSmartWizardPrev" type="button" class="light">Назад</button>
        <button id="btnSmartWizardNext" type="button" class="green">Далее</button>
      </div>
    </div>
    <div id="smartWizardFinalActions" class="smart-wizard-final-actions">
      <button id="btnSmartWizardGenerate" type="button" class="green">Сформировать результат</button>
      <button id="btnSmartWizardOpenDetails" type="button" class="light">Открыть все поля</button>
    </div>
  `;
  const intro = intake.querySelector('.smart-compact-row');
  if (intro) intro.insertAdjacentElement('afterend', shell);
  bindShell();
}
function bindShell() {
  get('btnSmartWizardPrev').onclick = () => go(current - 1);
  get('btnSmartWizardNext').onclick = () => go(current + 1);
  get('btnSmartWizardStart').onclick = () => go(0);
  get('btnSmartWizardToggle').onclick = () => {
    enabled = !enabled;
    localStorage.setItem('smart_wizard_enabled', enabled ? '1' : '0');
    render();
  };
  get('btnSmartWizardGenerate').onclick = () => get('btnSmartApply')?.click();
  get('btnSmartWizardOpenDetails').onclick = () => get('btnSmartDetails')?.click();
}
function go(step) {
  current = step;
  clampStep();
  localStorage.setItem('smart_wizard_step', String(current));
  render();
  get('smartDealIntake')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderJumps(count) {
  const box = get('smartWizardJump');
  if (!box) return;
  box.innerHTML = STEPS.slice(0, count).map((step, index) => `<button type="button" data-wizard-jump="${index}" class="${index === current ? 'active' : ''}">${index + 1}. ${step.title}</button>`).join('');
  box.querySelectorAll('[data-wizard-jump]').forEach((button) => button.onclick = () => go(Number(button.dataset.wizardJump)));
}
function renderDots(count) {
  const box = get('smartWizardDots');
  if (!box) return;
  box.innerHTML = Array.from({ length: count }, (_, index) => `<span class="smart-wizard-dot ${index < current ? 'done' : ''} ${index === current ? 'active' : ''}"></span>`).join('');
}
function render() {
  const list = stages();
  if (!list.length) return;
  clampStep();
  document.body.dataset.smartWizard = enabled ? '1' : '0';
  get('btnSmartWizardToggle').textContent = enabled ? 'Обычный вид' : 'Пошаговый вид';

  list.forEach((stage, index) => stage.classList.toggle('wizard-active', !enabled || index === current));
  const step = STEPS[current] || { title: 'Шаг', help: '' };
  get('smartWizardTitle').textContent = step.title;
  get('smartWizardHelp').textContent = step.help;
  get('smartWizardCounter').textContent = `Шаг ${current + 1} из ${list.length}`;
  get('smartWizardProgress').style.width = `${progress()}%`;
  renderDots(list.length);
  renderJumps(list.length);

  get('btnSmartWizardPrev').disabled = current === 0;
  get('btnSmartWizardNext').textContent = current >= list.length - 1 ? 'Готово' : 'Далее';
  get('btnSmartWizardNext').onclick = () => current >= list.length - 1 ? get('btnSmartApply')?.click() : go(current + 1);
  get('smartWizardFinalActions').classList.toggle('active', current >= list.length - 1);
}
function start() {
  loadCss();
  ensureShell();
  render();
  document.addEventListener('click', (event) => {
    if (event.target?.matches('[data-smart-key],[data-smart-list],[data-smart-feature],#btnSmartReset')) setTimeout(render, 120);
  });
  document.addEventListener('input', () => setTimeout(render, 120));
  document.addEventListener('change', () => setTimeout(render, 120));
}
let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (get('smartDealIntake') && get('smartNeededDetails')) {
    clearInterval(timer);
    start();
  }
  if (attempts > 80) clearInterval(timer);
}, 200);
