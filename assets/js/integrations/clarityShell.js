function get(id) { return document.getElementById(id); }

function loadCss() {
  if (document.querySelector('link[href="./assets/css/clarity-shell.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/css/clarity-shell.css';
  document.head.appendChild(link);
}

function applyShell() {
  document.body.classList.add('clarity-shell');
}

function ensureLoginToggle() {
  if (get('clarityLoginToggle')) return;
  const cloudPanel = get('cloudPanel');
  if (!cloudPanel) return;
  const actions = cloudPanel.querySelector('.actions');
  if (!actions) return;
  const btn = document.createElement('button');
  btn.id = 'clarityLoginToggle';
  btn.type = 'button';
  btn.textContent = 'Показать вход';
  actions.appendChild(btn);
  btn.onclick = () => {
    const open = document.body.classList.toggle('clarity-login-open');
    btn.textContent = open ? 'Скрыть вход' : 'Показать вход';
  };
}

function ensureSideHelp() {
  if (get('claritySideHelp')) return;
  const panel = document.querySelector('aside.panel.left');
  const intake = get('smartDealIntake');
  if (!panel) return;
  const help = document.createElement('div');
  help.id = 'claritySideHelp';
  help.className = 'clarity-side-help';
  help.innerHTML = '<b>Начните здесь</b><span>Выберите простой сценарий и идите по шагам. Подробные поля открывайте только если мастер не спросил нужную деталь.</span><div class="clarity-tech-links"><button type="button" data-clarity-action="details">Подробные поля</button><button type="button" data-clarity-action="result">К результату</button><button type="button" data-clarity-action="tech">Техническое</button></div>';
  if (intake) intake.insertAdjacentElement('beforebegin', help);
  else panel.insertAdjacentElement('afterbegin', help);
  help.querySelector('[data-clarity-action="details"]').onclick = () => document.querySelector('[data-ux-mode="details"]')?.click();
  help.querySelector('[data-clarity-action="result"]').onclick = () => document.querySelector('.panel.result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  help.querySelector('[data-clarity-action="tech"]').onclick = () => showTechTabs();
}

function showTechTabs() {
  document.body.classList.toggle('clarity-show-tech');
  const tabs = ['local', 'testSuite', 'systemAudit', 'cloudDeals'];
  tabs.forEach((id) => {
    const tab = document.querySelector(`[data-tab="${id}"]`);
    if (tab) tab.style.display = document.body.classList.contains('clarity-show-tech') ? '' : '';
  });
  alert(document.body.classList.contains('clarity-show-tech') ? 'Технические вкладки можно открыть через старые кнопки/проверку. Основной интерфейс оставлен чистым.' : 'Технический режим скрыт.');
}

function relabelTopbar() {
  const h1 = document.querySelector('.topbar h1');
  if (h1 && !h1.dataset.clarityTitle) {
    h1.dataset.clarityTitle = h1.textContent;
    h1.textContent = 'Навигатор сделки';
  }
  const generate = get('btnGenerate');
  if (generate) generate.textContent = 'Сформировать результат';
  const save = get('btnSaveCloud');
  if (save) save.textContent = 'Сохранить';
  const list = get('btnListCloud');
  if (list) list.textContent = 'Мои сделки';
}

function movePrimaryFocus() {
  const command = get('uxCommandCenter');
  const cloud = get('cloudPanel');
  if (command && cloud && cloud.nextElementSibling === command) return;
  if (command && cloud) cloud.insertAdjacentElement('afterend', command);
}

function start() {
  loadCss();
  applyShell();
  relabelTopbar();
  ensureLoginToggle();
  ensureSideHelp();
  movePrimaryFocus();
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  start();
  if (attempts > 40) clearInterval(timer);
}, 250);
