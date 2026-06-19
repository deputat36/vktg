const DRAFT_KEY = 'nav_deal_draft_v2';
let scheduled = false;
let observerStarted = false;

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function arr(key) {
  const deal = readDraft();
  return Array.isArray(deal[key]) ? deal[key] : [];
}

function hasFlag(value) {
  return arr('flags').includes(value);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function option(title, text, action, active = false, note = '') {
  return `<button type="button" class="option ${active ? 'active' : ''}" data-action="${esc(action)}"><b>${esc(title)}</b><span>${esc(text || '')}</span>${note ? `<em class="small">${esc(note)}</em>` : ''}</button>`;
}

function field(key, label, type = 'text', placeholder = '') {
  const deal = readDraft();
  return `<div class="field"><label>${esc(label)}</label><input data-field="${esc(key)}" type="${esc(type)}" value="${esc(deal[key] || '')}" placeholder="${esc(placeholder)}"></div>`;
}

function textarea(key, label, placeholder = '') {
  const deal = readDraft();
  return `<div class="field"><label>${esc(label)}</label><textarea data-field="${esc(key)}" placeholder="${esc(placeholder)}">${esc(deal[key] || '')}</textarea></div>`;
}

function section(title, note, content) {
  return `<div class="card" style="box-shadow:none;margin-top:12px">
    <h3>${esc(title)}</h3>
    ${note ? `<p class="muted" style="margin:4px 0 10px">${esc(note)}</p>` : ''}
    ${content}
  </div>`;
}

function detailsSection(title, note, content, open = false) {
  return `<details class="status" style="margin-top:12px" ${open ? 'open' : ''}>
    <summary><b>${esc(title)}</b></summary>
    ${note ? `<p class="muted" style="margin:8px 0 10px">${esc(note)}</p>` : ''}
    ${content}
  </details>`;
}

function buyerCompositionSection() {
  const deal = readDraft();
  return section('1. Кто покупает', 'Это влияет на документы, доли, опеку и дальнейший маршрут.', `<div class="option-grid">
    ${option('Покупает один взрослый', 'Простой сценарий.', 'set:buyerMode:one', deal.buyerMode === 'one')}
    ${option('Покупателей несколько', 'Нужно понять доли и кто фактически платит.', 'set:buyerMode:multiple', deal.buyerMode === 'multiple')}
    ${option('Есть ребёнок-покупатель', 'Влияет на доли, маткапитал, опеку и оформление.', 'toggle:flags:minorBuyer', hasFlag('minorBuyer'), 'юрист/опека')}
  </div>`);
}

function chainSection() {
  const deal = readDraft();
  return section('2. Есть ли зависимость от другой сделки', 'Цепочка влияет на сроки, задаток и условия ответственности.', `<div class="option-grid">
    ${option('Покупатель свободен', 'Не зависит от продажи своего объекта.', 'set:buyerChain:false', deal.buyerChain === false)}
    ${option('Покупатель продаёт свой объект', 'Возможна цепочка. Нужно понять сроки и зависимые условия.', 'set:buyerChain:true', deal.buyerChain === true, 'цепочка')}
  </div>`);
}

function contactSection() {
  return section('3. Контакт и лицо, принимающее решение', 'Контакты важны, но они не должны мешать определить сценарий сделки.', `<div class="grid">
    <div>${field('buyerName', 'Имя покупателя')}</div>
    <div>${field('buyerPhone', 'Телефон покупателя')}</div>
  </div>
  <div class="grid">
    <div>${field('buyerDecisionMaker', 'Кто принимает решение?', 'text', 'сам покупатель, супруг, родители, инвестор')}</div>
    <div>${field('buyerReadyDate', 'Когда готов к задатку?', 'text', 'сегодня, завтра, после одобрения, после продажи')}</div>
  </div>`);
}

function conditionalDetails() {
  const deal = readDraft();
  const blocks = [];

  if (deal.buyerMode === 'multiple') {
    blocks.push(detailsSection('Несколько покупателей', 'Заполняется только если покупателей несколько.', textarea('buyerMultipleComment', 'Что важно по нескольким покупателям?', 'Кто платит, какие доли, кто будет на задатке и сделке?'), true));
  }

  if (hasFlag('minorBuyer')) {
    blocks.push(detailsSection('Ребёнок-покупатель', 'Нужно понять источник денег и как будут выделяться доли.', textarea('childBuyerComment', 'Что известно по ребёнку-покупателю?', 'Маткапитал, опека, доли детям, номинальный счёт, кто законный представитель?'), true));
  }

  if (deal.buyerChain === true) {
    blocks.push(detailsSection('Цепочка / продажа своего объекта', 'Это влияет на сроки задатка, сделки и ответственность сторон.', textarea('buyerChainComment', 'Что известно по цепочке?', 'Что продаёт покупатель, есть ли задаток там, когда будут деньги, что зависит от регистрации?'), true));
  }

  if (!blocks.length) {
    return `<div class="status ok" style="margin-top:12px">Дополнительные вопросы по покупателю пока не нужны. Если появится ребёнок, несколько покупателей или цепочка — вопросы откроются автоматически.</div>`;
  }

  return blocks.join('');
}

function buyerStepHtml() {
  return `<div id="adaptiveBuyerStep">
    <h2>Покупатель</h2>
    <p class="muted">Сначала отметьте то, что влияет на сценарий. Контакты и подробности идут ниже.</p>
    ${buyerCompositionSection()}
    ${chainSection()}
    ${contactSection()}
    ${section('4. Уточнения по выбранной ситуации', 'Появляются только вопросы, которые стали нужны после выбранных пунктов выше.', conditionalDetails())}
    ${section('5. Короткий комментарий по покупателю', 'Кратко: мотивация, готовность, кто влияет на решение, что может сорвать задаток.', textarea('buyerComment', 'Комментарий по покупателю', 'Кто принимает решение, готов ли к задатку, есть ли цепочка?'))}
  </div>`;
}

function findBuyerCard() {
  const headings = [...document.querySelectorAll('#app h2')];
  const heading = headings.find((node) => node.textContent.trim().startsWith('Покупатель'));
  return heading?.closest?.('.card') || null;
}

function replaceBuyerStep(card) {
  if (card.querySelector('#adaptiveBuyerStep')) return;

  const title = card.querySelector('.section-title');
  const pageStatus = card.querySelector('#pageStatus');
  if (!title || !pageStatus) return;

  let node = title.nextSibling;
  while (node && node !== pageStatus) {
    const next = node.nextSibling;
    node.remove();
    node = next;
  }

  pageStatus.insertAdjacentHTML('beforebegin', buyerStepHtml());
}

function apply() {
  const card = findBuyerCard();
  if (!card) return;
  replaceBuyerStep(card);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    apply();
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
  if (observerStarted && attempts >= 10) clearInterval(timer);
  if (attempts >= 40) clearInterval(timer);
}, 150);

document.addEventListener('click', schedule, true);
document.addEventListener('input', (event) => {
  if (event.target?.closest?.('#adaptiveBuyerStep [data-field]')) return;
  schedule();
}, true);
window.addEventListener('storage', schedule);
