import { getDeal } from '../ui/form.js';
import { normalizeDeal } from '../core/dealSchema.js';

let uxMode = localStorage.getItem('navigator_ux_mode_v1') || 'simple';

const DETAIL_SECTIONS = [
  ['main', 'Основное', 'Ответственные, этап и контакты'],
  ['parties', 'Стороны сделки', 'Продавцы, покупатели, представители'],
  ['object', 'Объект', 'Тип, право, адрес, цена, ключи'],
  ['finance', 'Финансы', 'Комиссии, расходы, госпошлина'],
  ['conditions', 'Основания', 'Право, деньги, расчеты, риски'],
  ['docs', 'Документы', 'ЕГРН, зарегистрированные, папка, вопрос юристу']
];

function get(id) { return document.getElementById(id); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
function loadCss() {
  if (document.querySelector('link[href="./assets/css/ux-redesign.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/css/ux-redesign.css';
  document.head.appendChild(link);
}
function leftPanel() { return document.querySelector('aside.panel.left'); }
function resultPanel() { return document.querySelector('.panel.result'); }
function sectionTitle(section) { return section?.querySelector('h2')?.textContent?.trim() || ''; }
function findSection(text) { return [...document.querySelectorAll('aside.panel.left > section')].find((section) => sectionTitle(section).includes(text)); }
function safeDeal() { try { return getDeal(); } catch (_) { return {}; } }
function safeSchema() { try { return normalizeDeal(safeDeal()); } catch (_) { return null; } }

function healthCards() {
  const schema = safeSchema();
  const risks = schema?.stopReasons?.length || 0;
  const missing = schema?.required?.length || 0;
  const children = schema?.owners?.hasChildren ? 'да' : 'нет';
  const broker = schema?.needs?.broker ? 'да' : 'нет';
  return [
    ['Риски', risks, risks ? 'red' : 'green'],
    ['Не хватает', missing, missing ? 'orange' : 'green'],
    ['Дети', children, children === 'да' ? 'red' : 'green'],
    ['Брокер', broker, broker === 'да' ? 'orange' : 'green']
  ].map(([title, value, tone]) => `<div class="ux-health-card ${tone}"><b>${esc(value)}</b><span>${esc(title)}</span></div>`).join('');
}

function ensureCommandCenter() {
  if (get('uxCommandCenter')) return;
  const main = document.querySelector('main.grid');
  if (!main) return;
  const box = document.createElement('section');
  box.id = 'uxCommandCenter';
  box.className = 'ux-command-center';
  box.innerHTML = `
    <div class="ux-hero">
      <h2>Навигатор сделки</h2>
      <p>Один понятный маршрут: заполнить сделку → проверить риски → передать юристу/брокеру → закрыть задачи → подготовить задаток или сделку.</p>
      <div class="ux-hero-actions">
        <button id="uxPrimaryGenerate" type="button">Сформировать результат</button>
        <button id="uxOpenNow" type="button">Что делать сейчас</button>
        <button id="uxOpenDeals" type="button">Очереди сделок</button>
        <button id="uxCopyLawyer" type="button">Копировать юристу</button>
      </div>
    </div>
    <div class="ux-mini-panel">
      <h3>Состояние текущей карточки</h3>
      <div id="uxHealthGrid" class="ux-health-grid"></div>
      <div class="ux-noise-note">Если видите красный или оранжевый статус — сначала закройте замечания, потом двигайтесь к задатку.</div>
    </div>
  `;
  main.insertAdjacentElement('beforebegin', box);
  get('uxPrimaryGenerate').onclick = () => get('btnGenerate')?.click();
  get('uxOpenNow').onclick = () => document.querySelector('[data-tab="now"]')?.click();
  get('uxOpenDeals').onclick = () => location.href = './deals.html';
  get('uxCopyLawyer').onclick = () => get('btnCopyLawyer')?.click();
}

function ensureRoute() {
  if (get('uxRoute')) return;
  const main = document.querySelector('main.grid');
  if (!main) return;
  const route = document.createElement('section');
  route.id = 'uxRoute';
  route.className = 'ux-route';
  route.innerHTML = `
    <div class="ux-route-step" data-ux-jump="smart"><b><span class="num">1</span>Заполнить</b><span>Мастер сделки и минимум данных</span></div>
    <div class="ux-route-step" data-ux-tab="summary"><b><span class="num">2</span>Проверить</b><span>Паспорт сделки, риски, готовность</span></div>
    <div class="ux-route-step" data-ux-tab="lawyerTab"><b><span class="num">3</span>Передать</b><span>Юристу, брокеру, менеджеру</span></div>
    <div class="ux-route-step" data-ux-tab="dealTasks"><b><span class="num">4</span>Закрыть</b><span>Задачи, решения, лента</span></div>
  `;
  main.insertAdjacentElement('beforebegin', route);
  route.querySelectorAll('[data-ux-jump]').forEach((item) => item.onclick = () => get('smartDealIntake')?.scrollIntoView({ behavior:'smooth', block:'start' }));
  route.querySelectorAll('[data-ux-tab]').forEach((item) => item.onclick = () => document.querySelector(`[data-tab="${item.dataset.uxTab}"]`)?.click());
}

function ensureModeToggle() {
  if (get('uxModeToggle')) return;
  const panel = leftPanel();
  if (!panel) return;
  const toggle = document.createElement('div');
  toggle.id = 'uxModeToggle';
  toggle.className = 'ux-mode-toggle';
  toggle.innerHTML = `
    <button type="button" data-ux-mode="simple">Простой режим</button>
    <button type="button" data-ux-mode="details">Подробные поля</button>
    <button type="button" data-ux-jump="results">К результату</button>
  `;
  panel.insertAdjacentElement('afterbegin', toggle);
  toggle.querySelectorAll('[data-ux-mode]').forEach((button) => button.onclick = () => setMode(button.dataset.uxMode));
  toggle.querySelector('[data-ux-jump="results"]').onclick = () => resultPanel()?.scrollIntoView({ behavior:'smooth', block:'start' });
}

function decorateDetailSections() {
  const map = [
    ['main', findSection('Основное')],
    ['parties', findSection('Стороны сделки')],
    ['object', findSection('Объект')],
    ['finance', findSection('Финансы')],
    ['conditions', findSection('Основания')],
    ['docs', findSection('Документы')]
  ];
  map.forEach(([key, section]) => {
    if (!section || section.dataset.uxDecorated) return;
    section.dataset.uxDecorated = '1';
    section.dataset.uxSection = key;
    section.classList.add('ux-detail-section');
    const cfg = DETAIL_SECTIONS.find(([id]) => id === key);
    const summary = document.createElement('div');
    summary.className = 'ux-detail-summary';
    summary.innerHTML = `<div><b>${esc(cfg?.[1] || sectionTitle(section))}</b><span>${esc(cfg?.[2] || '')}</span></div><button type="button" class="light" data-ux-section-open="${esc(key)}">Открыть</button>`;
    section.insertAdjacentElement('afterbegin', summary);
    summary.querySelector('button').onclick = () => {
      setMode('details');
      section.scrollIntoView({ behavior:'smooth', block:'start' });
    };
  });
}

function ensureQuickNav() {
  if (get('uxQuickNav')) return;
  const result = resultPanel();
  if (!result) return;
  const nav = document.createElement('div');
  nav.id = 'uxQuickNav';
  nav.className = 'ux-quick-nav';
  nav.innerHTML = `
    <div class="ux-quick-nav-title">Рабочие разделы</div>
    <div class="ux-quick-nav-buttons">
      <button type="button" data-tab-open="summary">Сводка</button>
      <button type="button" data-tab-open="now">СПН</button>
      <button type="button" data-tab-open="lawyerTab">Юрист</button>
      <button type="button" data-tab-open="broker">Брокер</button>
      <button type="button" data-tab-open="dealTasks">Задачи</button>
      <button type="button" data-tab-open="dealReviews">Решения</button>
      <button type="button" data-tab-open="dealEvents">Лента</button>
      <button type="button" data-tab-open="client">Клиенту</button>
    </div>
  `;
  const tabs = result.querySelector('.tabs');
  if (tabs) tabs.insertAdjacentElement('beforebegin', nav);
  nav.querySelectorAll('[data-tab-open]').forEach((button) => button.onclick = () => document.querySelector(`[data-tab="${button.dataset.tabOpen}"]`)?.click());
}

function groupTabs() {
  const groups = {
    summary: 'ux-tab-primary', now: 'ux-tab-primary', lawyerTab: 'ux-tab-primary', broker: 'ux-tab-primary',
    dealTasks: 'ux-tab-workflow', dealReviews: 'ux-tab-workflow', dealEvents: 'ux-tab-workflow', financeSummary: 'ux-tab-workflow',
    docs: 'ux-tab-helper', local: 'ux-tab-helper', testSuite: 'ux-tab-muted', client: 'ux-tab-client'
  };
  document.querySelectorAll('.tab').forEach((tab) => {
    Object.values(groups).forEach((cls) => tab.classList.remove(cls));
    const cls = groups[tab.dataset.tab];
    if (cls) tab.classList.add(cls);
  });
}

function setMode(mode) {
  uxMode = mode === 'details' ? 'details' : 'simple';
  localStorage.setItem('navigator_ux_mode_v1', uxMode);
  document.body.dataset.uxMode = uxMode;
  document.querySelectorAll('[data-ux-mode]').forEach((button) => button.classList.toggle('active', button.dataset.uxMode === uxMode));
}

function refreshHealth() {
  const grid = get('uxHealthGrid');
  if (grid) grid.innerHTML = healthCards();
  groupTabs();
}

function start() {
  loadCss();
  document.body.dataset.uxMode = uxMode;
  ensureCommandCenter();
  ensureRoute();
  ensureModeToggle();
  decorateDetailSections();
  ensureQuickNav();
  setMode(uxMode);
  refreshHealth();
  document.addEventListener('input', () => setTimeout(refreshHealth, 120));
  document.addEventListener('change', () => setTimeout(refreshHealth, 120));
  document.addEventListener('click', () => setTimeout(refreshHealth, 160));
  setInterval(refreshHealth, 1000);
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (document.querySelector('main.grid') && leftPanel() && resultPanel()) {
    clearInterval(timer);
    start();
  }
  if (attempts > 80) clearInterval(timer);
}, 200);
