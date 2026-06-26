import { setupTop, getCachedUser, renderAuthBox, rpc, esc, money, riskPill, statusText } from './supabase-v2.js';

const dealId = new URLSearchParams(location.search).get('id');
let currentData = null;
let currentProfile = null;
let activeTab = location.hash ? location.hash.replace('#', '') : 'overview';

function list(data, key) { return Array.isArray(data?.[key]) ? data[key] : []; }
function dateText(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }
function dateShort(value) { return value ? new Date(value).toLocaleDateString('ru-RU') : '—'; }
function metric(label, value, cls = '') { return `<div class="metric ${cls}"><span>${label}</span><b>${value ?? '—'}</b></div>`; }
function countOpenTasks(items) { return items.filter((task) => ['open', 'in_progress'].includes(task.status)).length; }
function countMissingDocs(items) { return items.filter((doc) => doc.is_required && !['received', 'checked'].includes(doc.status)).length; }
function countRedRisks(items) { return items.filter((risk) => risk.level === 'red' && risk.is_resolved !== true).length; }
function countBlockingReviews(items) { return items.filter((review) => review.blocks_deposit || review.blocks_deal || review.decision === 'blocked').length; }
function isLawyer() { return currentProfile?.role === 'lawyer'; }
function setPageStatus(text, type = 'info') {
  const el = document.getElementById('pageStatus');
  if (el) { el.className = 'status ' + type; el.textContent = text; }
}

function isDemoDeal(deal) {
  return deal?.deal_summary?.demo === true
    || deal?.wizard_snapshot?.demo === true
    || String(deal?.title || '').startsWith('ДЕМО:');
}

function demoBadge(deal) { return isDemoDeal(deal) ? '<span class="pill blue">ДЕМО</span> ' : ''; }

function norm(value) {
  return String(value || '').trim();
}

function objectTypeName(type) {
  return ({
    flat_mkd: 'Квартира в МКД',
    flat_ground: 'Квартира на земле',
    room: 'Комната',
    share: 'Доля',
    share_room: 'Доля / комната',
    house_land: 'Дом с участком',
    house: 'Дом',
    land: 'Земельный участок',
    new_building: 'Новостройка',
    commercial: 'Коммерция'
  })[type] || 'Объект';
}

function docCategoryLabel(category) {
  return ({
    identity: 'личность',
    object: 'объект',
    basis: 'основание права',
    utilities: 'справки и коммунальные',
    land: 'земля',
    children: 'дети / опека',
    share: 'доля / сособственники',
    mortgage: 'ипотека',
    money: 'деньги',
    other: 'другое'
  })[category] || category || 'категория не указана';
}

function sideLabel(side) {
  return ({
    seller: 'продавец',
    buyer: 'покупатель',
    both: 'обе стороны',
    company: 'компания',
    other_agency: 'партнер',
    external_party: 'внешняя сторона'
  })[side] || side || 'сторона не указана';
}

function docStatusLabel(status) {
  return ({
    needed: 'нужен',
    requested: 'запрошен',
    received: 'получен',
    checked: 'проверен',
    problem: 'проблема'
  })[status] || status || 'нужен';
}

function taskStatusLabel(status) {
  return ({
    open: 'открыта',
    in_progress: 'в работе',
    done: 'готово',
    cancelled: 'отменена'
  })[status] || status || 'открыта';
}

function taskPriorityLabel(priority) {
  return ({
    urgent: 'срочно',
    high: 'важно',
    normal: 'обычно',
    low: 'низкий'
  })[priority] || priority || 'обычно';
}

function isGenericTitle(title) {
  const text = norm(title).toLowerCase();
  return !text
    || text.includes('продавец не указан')
    || text.includes('покупатель не указан')
    || text.includes('адрес не указан');
}

function dealDisplayTitle(deal) {
  const explicitTitle = norm(deal?.display_title);
  if (explicitTitle) return explicitTitle;
  const storedTitle = norm(deal?.title);
  if (!isGenericTitle(storedTitle)) return storedTitle;
  return `${objectTypeName(deal?.object_type)} — ${norm(deal?.address) || 'адрес уточняется'}`;
}

function findPersonNames(deal, side) {
  const summary = deal?.deal_summary || {};
  const snapshot = deal?.wizard_snapshot || {};
  const sideData = snapshot?.[side] || snapshot?.[`${side}Info`] || {};
  const keys = side === 'seller'
    ? ['seller_last_name','seller_name','seller_fio','seller_full_name','seller']
    : ['buyer_last_name','buyer_name','buyer_fio','buyer_full_name','buyer'];
  const values = [];
  for (const key of keys) {
    values.push(deal?.[key], summary?.[key], sideData?.[key], snapshot?.[key]);
  }
  return values.map(norm).find(Boolean) || '';
}

function dealPartiesLine(deal) {
  const seller = findPersonNames(deal, 'seller');
  const buyer = findPersonNames(deal, 'buyer');
  const parts = [];
  if (seller) parts.push(`продавец: ${seller}`);
  if (buyer) parts.push(`покупатель: ${buyer}`);
  return parts.join(' · ');
}

function dealHeadline(deal) {
  const title = dealDisplayTitle(deal);
  if (isLawyer()) return `Юридическая проверка: ${title}`;
  return title;
}

function confirmDemoAction(actionText) {
  const deal = currentData?.deal;
  if (!isDemoDeal(deal)) return true;
  return confirm(`Это демо-сделка. Подтвердите тестовое действие: ${actionText}. Реальные сделки не будут затронуты.`);
}

function dealModePanel(deal) {
  if (isDemoDeal(deal)) return `<div class="status ok"><span class="pill blue">ДЕМО</span> Тестовая карточка. Действия безопасны, но перед сохранением появится подтверждение.</div>`;
  return `<div class="status ok"><span class="pill green">Рабочая</span> Реальная сделка Навигатора. Все изменения сохраняются в CRM.</div>`;
}

function statusSelector(deal) {
  const statuses = [
    ['draft','Черновик'],['need_info','Нужно дозаполнить'],['need_lawyer','Юрист'],['need_broker','Брокер'],
    ['need_documents','Нужны документы'],['ready_for_deposit','Готова к задатку'],['deposit_done','Задаток внесен'],
    ['preparing_deal','Подготовка к сделке'],['ready_for_deal','Готова к сделке'],['registration','На регистрации'],
    ['registered','Зарегистрирована'],['closed','Закрыта'],['cancelled','Отменена']
  ];
  return `<div class="card" style="box-shadow:none">
    <h3>Статус сделки</h3>
    <div class="field"><label>Текущий статус</label><select id="dealStatus">${statuses.map(([id,title]) => `<option value="${id}" ${deal.status === id ? 'selected' : ''}>${title}</option>`).join('')}</select></div>
    <button id="saveStatus" class="btn primary" type="button">Сохранить статус</button>
  </div>`;
}

function lawyerQuickActions(deal) {
  return `<section class="card">
    <div class="section-title">
      <div>
        <h2>Юридические действия</h2>
        <p class="muted">Кнопки фиксируют структурированное решение юриста и меняют рабочий статус сделки.</p>
      </div>
      ${riskPill(deal.risk_level)}
    </div>
    <div id="pageStatus" class="status">Проверьте риски, документы и условия. После проверки выберите юридическое действие.</div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn green" data-legal-action="checked" type="button">Проверено юристом</button>
      <button class="btn light" data-legal-action="need_documents" type="button">Нужны документы</button>
      <button class="btn red" data-legal-action="stop_factor" type="button">Есть стоп-фактор</button>
      <button class="btn light" data-legal-action="return_spn" type="button">Вернуть СПН</button>
      <button class="btn light" data-tab-shortcut="docs" type="button">К документам</button>
      <button class="btn light" data-tab-shortcut="reviews" type="button">К решениям</button>
    </div>
  </section>`;
}

function quickActions(deal) {
  if (isLawyer()) return lawyerQuickActions(deal);
  return `<section class="card">
    <div class="section-title">
      <div>
        <h2>Быстрые действия</h2>
        <p class="muted">Кнопки меняют статус сделки и помогают быстро передать ее нужному специалисту.</p>
      </div>
      ${riskPill(deal.risk_level)}
    </div>
    <div id="pageStatus" class="status">Выберите действие или перейдите во вкладку нужного раздела.</div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn light" data-quick-status="need_lawyer" type="button">Передать юристу</button>
      <button class="btn light" data-quick-status="need_broker" type="button">Передать брокеру</button>
      <button class="btn green" data-quick-status="ready_for_deposit" type="button">Готово к задатку</button>
      <button class="btn green" data-quick-status="ready_for_deal" type="button">Готово к сделке</button>
      <button class="btn light" data-quick-status="need_documents" type="button">Нужны документы</button>
    </div>
  </section>`;