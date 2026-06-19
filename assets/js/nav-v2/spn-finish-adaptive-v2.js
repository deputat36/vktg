const DRAFT_KEY = 'nav_deal_draft_v2';
let scheduled = false;
let observerStarted = false;

const LABELS = {
  preparationMode: {
    consult: 'консультация',
    deposit: 'подготовка к задатку',
    deal: 'подготовка сделки',
    check_docs: 'проверка документов',
    rework: 'доработка заявки'
  },
  representation: {
    seller: 'только продавца',
    buyer: 'только покупателя',
    one_spn_both: 'обе стороны, один СПН',
    both: 'обе стороны, два СПН',
    partner_agency: 'партнёрская сделка',
    unknown: 'пока не ясно'
  },
  stage: {
    lead_only: 'есть только клиент',
    object_chosen: 'объект выбран',
    terms_discussed: 'стороны договорились',
    urgent_deposit: 'срочно готовим задаток',
    deposit_exists: 'задаток уже был',
    main_deal: 'готовим основную сделку',
    legal_problem: 'есть проблема, нужен юрист'
  },
  objectType: {
    flat_mkd: 'квартира в МКД',
    flat_ground: 'квартира на земле',
    room: 'комната',
    house_land: 'дом с участком',
    land: 'земельный участок',
    new_building: 'новостройка / ДДУ / уступка',
    commercial: 'коммерция',
    share: 'доля / часть объекта'
  }
};

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function arr(deal, key) {
  return Array.isArray(deal[key]) ? deal[key] : [];
}

function flags(deal) {
  const base = Array.isArray(deal.flags) ? deal.flags : [];
  if ((deal.legalForm === 'share' || deal.shareSale === true) && !base.includes('shares')) return [...base, 'shares'];
  return base;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function label(group, value) {
  return LABELS[group]?.[value] || value || 'не указано';
}

function filled(value) {
  return String(value ?? '').trim().length > 0;
}

function field(key, labelText, type = 'text', placeholder = '') {
  const deal = readDraft();
  return `<div class="field"><label>${esc(labelText)}</label><input data-field="${esc(key)}" type="${esc(type)}" value="${esc(deal[key] || '')}" placeholder="${esc(placeholder)}"></div>`;
}

function textarea(key, labelText, placeholder = '') {
  const deal = readDraft();
  return `<div class="field"><label>${esc(labelText)}</label><textarea data-field="${esc(key)}" placeholder="${esc(placeholder)}">${esc(deal[key] || '')}</textarea></div>`;
}

function section(title, note, content) {
  return `<div class="card" style="box-shadow:none;margin-top:12px">
    <h3>${esc(title)}</h3>
    ${note ? `<p class="muted" style="margin:4px 0 10px">${esc(note)}</p>` : ''}
    ${content}
  </div>`;
}

function chip(text, cls = 'blue') {
  return `<span class="pill ${esc(cls)}">${esc(text)}</span>`;
}

function missingItems(deal) {
  const items = [];
  if (!filled(deal.preparationMode)) items.push('не выбрано, что готовим');
  if (!filled(deal.representation)) items.push('не выбрано, кого сопровождаем');
  if (!filled(deal.stage)) items.push('не указана стадия');
  if (!filled(deal.objectType)) items.push('не выбран тип объекта');
  if (!filled(deal.address) && deal.stage !== 'lead_only') items.push('нет адреса или ориентира');
  if ((deal.hasBuyer === true || ['buyer', 'one_spn_both', 'both'].includes(deal.representation)) && !arr(deal, 'payments').length && !filled(deal.moneyComment)) items.push('непонятен источник денег');
  if ((deal.preparationMode === 'deposit' || deal.stage === 'urgent_deposit') && deal.settlementsAgreed !== true) items.push('расчёты не согласованы');
  if ((deal.preparationMode === 'deposit' || deal.stage === 'urgent_deposit') && deal.expensesAgreed !== true) items.push('расходы не согласованы');
  if (!filled(deal.clientNextStep)) items.push('нет ближайшего шага с клиентом');
  return items;
}

function riskItems(deal) {
  const items = [];
  const fs = flags(deal);
  if (fs.includes('minorSeller') || fs.includes('minorBuyer') || fs.includes('minorRegistered')) items.push('дети / опека / регистрация детей');
  if (fs.includes('powerOfAttorney')) items.push('доверенность');
  if (fs.includes('shares') || deal.legalForm === 'share' || deal.shareSale === true) items.push('доля / сособственники / нотариус');
  if (fs.includes('encumbrance')) items.push('арест / обременение');
  if (fs.includes('spouse')) items.push('супруг / согласие');
  if (fs.includes('sellerBankruptcyRisk')) items.push('проверка продавца');
  if (fs.includes('alternativeDeal')) items.push('цепочка / зависимая сделка');
  if (arr(deal, 'basis').some((item) => ['inheritLaw', 'inheritWill', 'privat', 'court'].includes(item))) items.push('сложное основание права');
  if (arr(deal, 'payments').some((item) => ['matcap', 'nominalChild', 'svoChildAccount'].includes(item))) items.push('детские деньги / маткапитал');
  if (arr(deal, 'payments').some((item) => ['mortgage', 'militaryMortgage', 'certificate'].includes(item))) items.push('банк / сертификат / сроки перечисления');
  if (arr(deal, 'settlements').some((item) => ['afterRegistration', 'pensionFund'].includes(item))) items.push('часть оплаты после регистрации');
  if (deal.priceAgreed === false) items.push('цена не согласована');
  if (deal.settlementsAgreed === false) items.push('расчёты не согласованы');
  if (deal.expensesAgreed === false) items.push('расходы не согласованы');
  if (deal.objectType === 'flat_ground') items.push('квартира на земле');
  if (deal.objectType === 'room') items.push('комната');
  return [...new Set(items)];
}

function readinessPercent(deal) {
  const missing = missingItems(deal).length;
  const base = 100 - missing * 10;
  return Math.max(10, Math.min(100, base));
}

function decision(deal) {
  const missing = missingItems(deal);
  const risks = riskItems(deal);
  const urgentRisk = risks.some((item) => item.includes('дети') || item.includes('арест') || item.includes('расчёты не согласованы') || item.includes('цена не согласована'));

  if (urgentRisk) return ['error', 'Сначала проверить риски', 'Не идти к задатку, пока не понятен следующий шаг по красным вопросам.'];
  if (missing.length >= 3) return ['warn', 'Черновик можно сохранить, но есть пробелы', 'Сохраните карточку и дозаполните недостающие данные перед задатком.'];
  if (risks.length) return ['warn', 'Можно двигаться, но с проверкой', 'Назначьте ответственного: юрист, брокер, менеджер или СПН.'];
  return ['ok', 'Можно двигаться дальше', 'Основные поля заполнены, явных стоп-факторов по ответам нет.'];
}

function specialists(deal) {
  const risks = riskItems(deal);
  const result = [];
  if (risks.some((item) => item.includes('дети') || item.includes('доля') || item.includes('доверенность') || item.includes('основание') || item.includes('арест') || item.includes('квартира на земле'))) result.push('юрист');
  if (arr(deal, 'payments').some((item) => ['mortgage', 'militaryMortgage', 'matcap', 'certificate'].includes(item))) result.push('брокер');
  if (deal.settlementsAgreed !== true || deal.expensesAgreed !== true || deal.priceAgreed === false) result.push('менеджер');
  if (!result.length) result.push('СПН ведёт по обычному маршруту');
  return result;
}

function summaryText(deal) {
  const risks = riskItems(deal);
  const missing = missingItems(deal);
  const specs = specialists(deal);
  return [
    'Передача заявки от СПН',
    '',
    `Что готовим: ${label('preparationMode', deal.preparationMode)}`,
    `Кого сопровождаем: ${label('representation', deal.representation)}`,
    `Стадия: ${label('stage', deal.stage)}`,
    `Объект: ${label('objectType', deal.objectType)}`,
    `Адрес: ${deal.address || 'не указан'}`,
    `Цена: ${deal.priceTotal || 'не указана'}`,
    `Задаток/аванс: ${deal.depositAmount || 'не указан'}`,
    '',
    `Кого подключить: ${specs.join(', ')}`,
    `Выявлено: ${risks.join(', ') || 'явных рисков нет'}`,
    `Не хватает: ${missing.join(', ') || 'ключевых пробелов нет'}`,
    '',
    `Ближайший шаг: ${deal.clientNextStep || 'не указан'}`,
    `Комментарий СПН: ${deal.spnFinalComment || deal.riskComment || deal.stageComment || 'нет'}`
  ].join('\n');
}

function decisionSection() {
  const deal = readDraft();
  const [cls, title, note] = decision(deal);
  const percent = readinessPercent(deal);
  return section('1. Решение по заявке', 'Главный вывод по заполненной информации.', `<div class="status ${cls}"><b>${esc(title)}</b><br>${esc(note)}</div>
    <div class="progress" style="margin-top:12px"><i style="width:${percent}%"></i></div>
    <p class="muted" style="margin:8px 0 0">Готовность по обязательным ориентирам: <b>${percent}%</b></p>`);
}

function specialistsSection() {
  const deal = readDraft();
  const items = specialists(deal);
  return section('2. Кого подключить', 'Список формируется по выбранным ответам.', `<div class="actions" style="justify-content:flex-start">${items.map((item) => chip(item, item === 'юрист' ? 'yellow' : item === 'брокер' ? 'blue' : item === 'менеджер' ? 'yellow' : 'green')).join('')}</div>`);
}

function missingSection() {
  const deal = readDraft();
  const missing = missingItems(deal);
  const risks = riskItems(deal);
  const missingHtml = missing.length ? `<ul>${missing.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '<div class="status ok">Ключевых пробелов нет.</div>';
  const riskHtml = risks.length ? `<div class="actions" style="justify-content:flex-start;margin-top:8px">${risks.map((item) => chip(item)).join('')}</div>` : '<div class="status ok">Явных рисков по ответам нет.</div>';
  return section('3. Что проверить перед следующим шагом', 'Короткий список для СПН, менеджера, юриста или брокера.', `<h4>Не хватает</h4>${missingHtml}<h4 style="margin-top:12px">Выявлено</h4>${riskHtml}`);
}

function nextStepSection() {
  return section('4. Ближайший шаг', 'Не общий план, а одно ближайшее действие после сохранения карточки.', `<div class="grid">
    <div>${field('clientNextStep', 'Ближайший шаг с клиентом', 'text', 'запросить документы, назначить задаток, подключить юриста')}</div>
    <div>${field('nextStepDeadline', 'Срок ближайшего шага', 'text', 'сегодня, завтра, до задатка')}</div>
  </div>
  ${textarea('spnFinalComment', 'Финальный комментарий СПН', 'Что важно передать менеджеру/юристу/брокеру?')}`);
}

function handoffSection() {
  const deal = readDraft();
  return section('5. Текст передачи', 'Можно скопировать и отправить менеджеру, юристу или брокеру.', `<div class="field"><label>Готовый текст</label><textarea id="adaptiveHandoffText" readonly style="min-height:260px">${esc(summaryText(deal))}</textarea></div>
  <div class="actions" style="justify-content:flex-start"><button class="btn light" type="button" data-adaptive-copy-handoff="1">Скопировать текст передачи</button></div>`);
}

function finishStepHtml() {
  return `<div id="adaptiveFinishStep">
    <h2>Итог и передача</h2>
    <p class="muted">Финальный экран должен помочь принять решение: сохранить черновик, идти к задатку, подключить специалиста или дозаполнить пробелы.</p>
    ${decisionSection()}
    ${specialistsSection()}
    ${missingSection()}
    ${nextStepSection()}
    ${handoffSection()}
  </div>`;
}

function updateHandoffText() {
  const field = document.getElementById('adaptiveHandoffText');
  if (!field) return;
  field.value = summaryText(readDraft());
}

function findFinishCard() {
  const headings = [...document.querySelectorAll('#app h2')];
  const heading = headings.find((node) => node.textContent.trim().startsWith('Итог'));
  return heading?.closest?.('.card') || null;
}

function replaceFinishStep(card) {
  if (card.querySelector('#adaptiveFinishStep')) return;

  const title = card.querySelector('.section-title');
  const pageStatus = card.querySelector('#pageStatus');
  if (!title || !pageStatus) return;

  let node = title.nextSibling;
  while (node && node !== pageStatus) {
    const next = node.nextSibling;
    node.remove();
    node = next;
  }

  pageStatus.insertAdjacentHTML('beforebegin', finishStepHtml());
}

function apply() {
  const card = findFinishCard();
  if (!card) return;
  replaceFinishStep(card);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    apply();
    updateHandoffText();
  }, 80);
}

function startObserver() {
  if (observerStarted) return;
  const host = document.getElementById('app');
  if (!host) return;
  observerStarted = true;
  const observer = new MutationObserver(() => schedule());
  observer.observe(host, { childList: true, subtree: true });
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  startObserver();
  apply();
  updateHandoffText();
  if (observerStarted && attempts >= 10) clearInterval(timer);
  if (attempts >= 40) clearInterval(timer);
}, 150);

document.addEventListener('click', (event) => {
  const copyButton = event.target?.closest?.('[data-adaptive-copy-handoff]');
  if (!copyButton) {
    schedule();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const text = document.getElementById('adaptiveHandoffText')?.value || summaryText(readDraft());
  navigator.clipboard?.writeText(text).then(() => {
    copyButton.textContent = 'Скопировано';
    setTimeout(() => { copyButton.textContent = 'Скопировать текст передачи'; }, 1500);
  });
}, true);

document.addEventListener('input', (event) => {
  if (!event.target?.closest?.('#adaptiveFinishStep [data-field]')) return;
  setTimeout(updateHandoffText, 120);
}, true);
window.addEventListener('storage', schedule);
