import { getCurrentUser } from './supabase.js';
import { getMyProfile } from './crmApi.js';

const ROLE_CONFIG = {
  admin: {
    icon: '⚙️', title: 'Рабочее место администратора', tone: 'Контроль системы, ролей, сделок, рисков и аналитики.',
    primary: ['summary', 'dealTasks', 'dealReviews', 'systemAudit'],
    checklist: ['Проверьте рисковые сделки и открытые задачи.', 'Контролируйте роли сотрудников и активность.', 'Следите за сделками ниже 80% готовности.', 'Проверяйте ошибки через «Проверка» и «Тесты».'],
    actions: [['Сделки / CRM', './deals.html'], ['Сотрудники / роли', './admin.html']]
  },
  manager: {
    icon: '📊', title: 'Рабочее место менеджера', tone: 'Быстрый контроль подготовки сделки, рисков, задач и качества работы СПН.',
    primary: ['summary', 'now', 'dealTasks', 'dealReviews'],
    checklist: ['Посмотрите главное решение и стоп-факторы.', 'Проверьте, кто ответственный со стороны продавца и покупателя.', 'Проконтролируйте открытые задачи.', 'Оставьте управленческое решение, если сделка спорная.'],
    actions: [['Сделки / контроль', './deals.html']]
  },
  lawyer: {
    icon: '⚖️', title: 'Рабочее место юриста', tone: 'Карточка сделки, стоп-факторы, документы и решение без лишней переписки.',
    primary: ['lawyerTab', 'docs', 'dealReviews', 'dealTasks'],
    checklist: ['Откройте карточку юристу.', 'Проверьте объект, основания, стороны и форму расчетов.', 'Оставьте решение: можно, нужны документы, исправить условия или стоп.', 'Автозадачи уйдут СПН после решения.'],
    actions: [['Юридическая очередь', './deals.html']]
  },
  broker: {
    icon: '🏦', title: 'Рабочее место ипотечного брокера', tone: 'Ипотека, Домклик, банк, оценка, сертификаты и расходы клиента.',
    primary: ['broker', 'docs', 'dealReviews', 'dealTasks'],
    checklist: ['Проверьте банк, Домклик и форму расчета.', 'Проверьте документы покупателя, продавца и объекта.', 'Оцените расходы: оценка, СБР, страховки, услуги банка.', 'Оставьте решение и создайте задачи для СПН.'],
    actions: [['Ипотечные сделки', './deals.html']]
  },
  spn: {
    icon: '🏠', title: 'Рабочее место СПН', tone: 'Что сделать сейчас, какие документы собрать и что можно отправить клиенту.',
    primary: ['now', 'docs', 'client', 'summary'],
    checklist: ['Сначала нажмите «Сформировать».', 'Проверьте «Что сейчас» и список документов.', 'Скопируйте клиенту только готовые сообщения.', 'После проверки юриста закройте задачи.'],
    actions: [['Мои сделки', './deals.html']]
  }
};

let currentRole = localStorage.getItem('navigator_role_workspace_v1') || 'spn';

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
    tab.classList.remove('role-primary', 'role-secondary');
    if (config.primary.includes(tab.dataset.tab)) tab.classList.add('role-primary');
    else if (['summary', 'now', 'lawyerTab', 'broker', 'docs', 'client', 'dealReviews', 'dealTasks'].includes(tab.dataset.tab)) tab.classList.add('role-secondary');
  });
}
function openTab(id) {
  document.querySelector(`[data-tab="${id}"]`)?.click();
}
function renderWorkspace() {
  const config = ROLE_CONFIG[currentRole] || ROLE_CONFIG.spn;
  document.body.dataset.role = currentRole;
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
        <div class="role-focus-tabs">
          ${config.primary.map((id, index) => `<button type="button" class="${index === 0 ? 'primary-focus' : ''}" data-focus-tab="${id}">${esc(tabName(id))}</button>`).join('')}
        </div>
        <div class="role-actions">
          <button id="roleGenerate" class="green" type="button">Сформировать результат</button>
          ${config.actions.map(([title, href]) => `<a class="button light" href="${href}">${esc(title)}</a>`).join('')}
        </div>
      </div>
      <div>
        <label>Переключить роль интерфейса
          <select id="roleWorkspaceSelect">${roleOptions()}</select>
        </label>
        <ul class="role-mini-checklist">${config.checklist.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
      </div>
    </div>
  `;
  get('roleWorkspaceSelect').onchange = (event) => {
    currentRole = event.target.value;
    localStorage.setItem('navigator_role_workspace_v1', currentRole);
    renderWorkspace();
  };
  get('roleGenerate').onclick = () => get('btnGenerate')?.click();
  box.querySelectorAll('[data-focus-tab]').forEach((button) => button.onclick = () => openTab(button.dataset.focusTab));
  applyTabFocus(config);
}
function tabName(id) {
  const names = {
    summary: 'Сводка', now: 'Что сейчас', lawyerTab: 'Карточка юристу', broker: 'Брокеру', docs: 'Документы', client: 'Клиенту', local: 'Борисоглебск', dealReviews: 'Решения', dealTasks: 'Задачи', systemAudit: 'Проверка'
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
