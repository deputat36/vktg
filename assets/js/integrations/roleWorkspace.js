import { getCurrentUser } from './supabase.js';
import { getMyProfile } from './crmApi.js';
import { getDeal } from '../ui/form.js';
import { normalizeDeal } from '../core/dealSchema.js';

const ROLE_CONFIG = {
  admin: {
    icon: '⚙️', title: 'Рабочее место руководителя / администратора', tone: 'Полный контроль системы, сделок, ролей, рисков, аналитики и качества заполнения.',
    primary: ['summary', 'financeSummary', 'dealTasks', 'dealReviews', 'testSuite'],
    route: [
      ['Проверить картину', 'Сводка, паспорт сделки, готовность и стоп-факторы.'],
      ['Посмотреть деньги', 'Комиссии, расходы, распределение, стоимость подготовки.'],
      ['Проконтролировать команду', 'Кто СПН продавца, кто СПН покупателя, кому возвращать замечания.'],
      ['Проверить стабильность', 'Открыть тесты после обновлений и убедиться, что сценарии не сломались.']
    ],
    checklist: ['Сделки со стоп-факторами не должны уходить в задаток без решения.', 'Дети, детские деньги, доли, неизвестные основания и рискованные расчеты — всегда на контроле.', 'Финансы и комиссии должны быть понятны до задатка.', 'Тесты запускать после крупных изменений.'],
    actions: [['Сделки / CRM', './deals.html'], ['Сотрудники / роли', './admin.html']]
  },
  manager: {
    icon: '📊', title: 'Рабочее место менеджера', tone: 'Контроль подготовки сделки, рисков, задач, двух СПН и качества работы.',
    primary: ['summary', 'now', 'financeSummary', 'dealTasks', 'dealReviews'],
    route: [
      ['Оценить риск', 'Сначала сводка и паспорт сделки.'],
      ['Проверить ответственных', 'Кто отвечает за продавца, покупателя, документы и связь с юристом.'],
      ['Закрыть тормоза', 'Что мешает задатку: документы, деньги, дети, банк, стороны.'],
      ['Дать решение', 'Разрешить продолжать, поставить паузу или подключить юриста/брокера.']
    ],
    checklist: ['Если два СПН — ответственность должна быть разделена.', 'Если есть дети/детские деньги — без решения юриста не двигать.', 'Если нет папки документов — юрист будет тратить время.', 'Если цена в договоре отличается — нужен разбор до задатка.'],
    actions: [['Сделки / контроль', './deals.html']]
  },
  lawyer: {
    icon: '⚖️', title: 'Рабочее место юриста', tone: 'Структурированная карточка, стоп-факторы, документы, вопросы СПН и решение без лишней переписки.',
    primary: ['lawyerTab', 'docs', 'summary', 'dealReviews', 'dealTasks'],
    route: [
      ['Открыть карточку', 'Сначала вкладка “Юристу”, затем паспорт сделки.'],
      ['Проверить запреты', 'Дети, доля, опека, рента, приватизация, неизвестное основание, обременение.'],
      ['Проверить документы', 'ЕГРН с ЭЦП, основание права, зарегистрированные, папка документов.'],
      ['Вернуть решение', 'Что можно, что исправить, какие документы запросить, можно ли брать задаток.']
    ],
    checklist: ['Клиентские сообщения не использовать как юридическое заключение.', 'Если вопрос СПН пустой, но есть риск — вернуть задачу сформулировать вопрос.', 'По детям проверять представителей, документы ребенка и опеку.', 'По земле проверять КН, НСПД, ВРИ и связку дом/участок.'],
    actions: [['Юридическая очередь', './deals.html']]
  },
  broker: {
    icon: '🏦', title: 'Рабочее место ипотечного брокера', tone: 'Ипотека, Домклик, банк, оценка, сертификаты, СБР и расходы клиента.',
    primary: ['broker', 'docs', 'financeSummary', 'summary', 'dealTasks'],
    route: [
      ['Проверить банк', 'Сбер/Домклик или другой банк, статус одобрения, программа.'],
      ['Проверить объект', 'Подходит ли объект банку: доля, дом, земля, частный сектор, дети.'],
      ['Проверить пакет', 'Покупатель, продавец, объект, ЕГРН с ЭЦП, оценка.'],
      ['Объяснить расходы', 'Оценка, СБР, страховки, платные услуги банка, от чего можно отказаться.']
    ],
    checklist: ['Брокер видит только ипотечные/банковские сценарии.', 'Маткапитал и сертификаты требуют проверки сроков перечисления.', 'Сбер: объект должен быть в Домклике, документы загружаются отдельно.', 'Платные услуги банка нужно объяснять клиенту заранее.'],
    actions: [['Ипотечные сделки', './deals.html']]
  },
  spn: {
    icon: '🏠', title: 'Рабочее место СПН', tone: 'Простой маршрут: заполнить сделку, понять риск, собрать документы, передать юристу и отправить клиенту только нужное.',
    primary: ['now', 'docs', 'client', 'summary', 'financeSummary'],
    route: [
      ['Заполнить мастер', 'Идти по шагам, не открывая все поля без необходимости.'],
      ['Проверить паспорт', 'Убедиться, что система правильно поняла объект, детей, деньги и расчет.'],
      ['Собрать документы', 'Папка Яндекс Диска, ЕГРН с ЭЦП, справка о зарегистрированных.'],
      ['Передать дальше', 'Юристу — карточку, клиенту — только готовое сообщение, брокеру — ипотечный блок.']
    ],
    checklist: ['Сначала нажмите “Сформировать”.', 'Красный статус — задаток не брать до решения.', 'Клиенту не отправлять карточку юристу.', 'Если не нашли сценарий — заполнить вручную через “Открыть все поля”.'],
    actions: [['Мои сделки', './deals.html']]
  }
};

let currentRole = localStorage.getItem('navigator_role_workspace_v1') || 'spn';
let focusMode = localStorage.getItem('navigator_role_focus_v1') === '1';

function get(id) { return document.getElementById(id); }
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function loadStylesheet() {
  if (document.querySelector('link[href="./assets/css/role-workspace.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/css/role-workspace.css';
  document.head.appendChild(link);
}
async function detectRole() {
  try {
    const user = await getCurrentUser();
    if (!user) return currentRole;
    const profile = await getMyProfile();
    currentRole = profile.role || 'spn';
    localStorage.setItem('navigator_role_workspace_v1', currentRole);
  } catch (_) {}
  return currentRole;
}
function roleOptions() {
  return Object.entries(ROLE_CONFIG).map(([id, cfg]) => `<option value="${id}" ${id === currentRole ? 'selected' : ''}>${cfg.icon} ${esc(cfg.title.replace('Рабочее место ', ''))}</option>`).join('');
}
function ensureWorkspace() {
  const panel = document.querySelector('.panel.result');
  if (!panel || get('roleWorkspace')) return;
  const box = document.createElement('div');
  box.id = 'roleWorkspace';
  box.className = 'box role-workspace';
  panel.insertBefore(box, panel.firstChild);
}
function applyTabFocus(config) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.remove('role-primary', 'role-secondary', 'role-hidden');
    if (config.primary.includes(tab.dataset.tab)) tab.classList.add('role-primary');
    else if (['summary', 'now', 'lawyerTab', 'broker', 'docs', 'client', 'dealReviews', 'dealTasks', 'financeSummary', 'testSuite', 'local'].includes(tab.dataset.tab)) tab.classList.add('role-secondary');
    if (focusMode && !config.primary.includes(tab.dataset.tab)) tab.classList.add('role-hidden');
  });
}
function openTab(id) {
  document.querySelector(`[data-tab="${id}"]`)?.click();
}
function currentStatusCards() {
  let schema = null;
  let deal = null;
  try {
    deal = getDeal();
    schema = normalizeDeal(deal);
  } catch (_) {}
  const missing = schema?.required?.length ?? '—';
  const child = schema?.owners?.hasChildren ? 'Да' : 'Нет';
  const broker = schema?.needs?.broker ? 'Да' : 'Нет';
  const risk = schema?.stopReasons?.length || 0;
  return `
    <div class="role-status-grid">
      <div class="role-status-card ${risk ? 'red' : 'green'}"><b>${risk}</b><span>критичных признаков</span></div>
      <div class="role-status-card ${missing && missing !== '—' ? 'orange' : 'green'}"><b>${missing}</b><span>не хватает</span></div>
      <div class="role-status-card ${child === 'Да' ? 'red' : 'green'}"><b>${child}</b><span>дети в сделке</span></div>
      <div class="role-status-card ${broker === 'Да' ? 'orange' : 'green'}"><b>${broker}</b><span>нужен брокер</span></div>
    </div>
  `;
}
function roleAlerts() {
  let schema = null;
  try { schema = normalizeDeal(getDeal()); } catch (_) {}
  if (!schema) return '';
  const alerts = [];
  if (schema.owners.hasChildren) alerts.push(['red', 'Дети в сделке', 'Проверьте документы ребенка, законного представителя, опеку/СФР/банк и порядок оформления долей.']);
  if (schema.money.hasChildMoney) alerts.push(['red', 'Детские деньги / СВО-средства', 'До задатка нужен отдельный разбор юриста и менеджера.']);
  if (schema.property.isShare) alerts.push(['orange', 'Доля или часть объекта', 'Проверьте нотариуса, ППП и возможность ипотеки.']);
  if (schema.property.needsLandCadastre) alerts.push(['orange', 'Земля / дом / СНТ', 'Нужны КН земли, НСПД, ВРИ и категория.']);
  if (schema.money.riskySettlement) alerts.push(['red', 'Рискованный расчет', 'Деньги до регистрации или наличные под расписку нужно согласовать с юристом.']);
  if (schema.title.isUnknown) alerts.push(['orange', 'Основание права неясно', 'Нужно увидеть документ-основание, а не только ЕГРН.']);
  if (!alerts.length) alerts.push(['green', 'Критичные признаки не выявлены', 'Все равно проверьте документы и сформируйте результат.']);
  return `<div class="role-alerts">${alerts.map(([cls, title, text]) => `<div class="role-alert ${cls}"><b>${esc(title)}</b>${esc(text)}</div>`).join('')}</div>`;
}
function routeHtml(config) {
  return `<div class="role-route">${config.route.map((item, index) => `<div class="role-route-card"><h3><span class="num">${index + 1}</span>${esc(item[0])}</h3><p>${esc(item[1])}</p></div>`).join('')}</div>`;
}
function renderWorkspace() {
  const config = ROLE_CONFIG[currentRole] || ROLE_CONFIG.spn;
  document.body.dataset.role = currentRole;
  document.body.dataset.roleFocus = focusMode ? '1' : '0';
  const box = get('roleWorkspace');
  if (!box) return;
  box.innerHTML = `
    <div class="role-workspace-grid">
      <div>
        <div class="work-zone-title">
          <div>
            <h2>${config.icon} ${esc(config.title)}</h2>
            <p>${esc(config.tone)}</p>
          </div>
          <span class="role-mode-badge">Роль: ${esc(currentRole)}</span>
        </div>
        ${currentStatusCards()}
        <div class="role-focus-tabs">
          ${config.primary.map((id, index) => `<button type="button" class="${index === 0 ? 'primary-focus' : ''}" data-focus-tab="${id}">${esc(tabName(id))}</button>`).join('')}
        </div>
        ${routeHtml(config)}
        ${roleAlerts()}
        <div class="role-actions">
          <button id="roleGenerate" class="green" type="button">Сформировать результат</button>
          <button id="roleOpenFirst" class="light" type="button">Открыть главный экран роли</button>
          ${config.actions.map(([title, href]) => `<a class="button light" href="${href}">${esc(title)}</a>`).join('')}
        </div>
      </div>
      <div>
        <div class="role-compact-row">
          <label>Переключить роль интерфейса
            <select id="roleWorkspaceSelect">${roleOptions()}</select>
          </label>
        </div>
        <label class="role-focus-toggle"><input id="roleFocusToggle" type="checkbox" ${focusMode ? 'checked' : ''}> Фокусный режим: скрыть лишние вкладки</label>
        <ul class="role-mini-checklist">${config.checklist.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
      </div>
    </div>
  `;
  get('roleWorkspaceSelect').onchange = (event) => {
    currentRole = event.target.value;
    localStorage.setItem('navigator_role_workspace_v1', currentRole);
    renderWorkspace();
  };
  get('roleFocusToggle').onchange = (event) => {
    focusMode = event.target.checked;
    localStorage.setItem('navigator_role_focus_v1', focusMode ? '1' : '0');
    renderWorkspace();
  };
  get('roleGenerate').onclick = () => get('btnGenerate')?.click();
  get('roleOpenFirst').onclick = () => openTab(config.primary[0]);
  box.querySelectorAll('[data-focus-tab]').forEach((button) => button.onclick = () => openTab(button.dataset.focusTab));
  applyTabFocus(config);
}
function tabName(id) {
  const names = {
    summary: 'Сводка', now: 'Что сейчас', lawyerTab: 'Карточка юристу', broker: 'Брокеру', docs: 'Документы', client: 'Клиенту', local: 'Борисоглебск', dealReviews: 'Решения', dealTasks: 'Задачи', systemAudit: 'Проверка', testSuite: 'Тесты', financeSummary: 'Финансы'
  };
  return names[id] || id;
}
async function start() {
  loadStylesheet();
  await detectRole();
  ensureWorkspace();
  renderWorkspace();
  window.addEventListener('navigatorDealOpened', renderWorkspace);
  window.addEventListener('navigatorDealSaved', renderWorkspace);
  document.addEventListener('input', () => setTimeout(renderWorkspace, 120));
  document.addEventListener('change', () => setTimeout(renderWorkspace, 120));
}
let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (document.querySelector('.panel.result') && document.querySelector('.tabs')) {
    clearInterval(timer);
    start();
  }
  if (attempts > 60) clearInterval(timer);
}, 200);
