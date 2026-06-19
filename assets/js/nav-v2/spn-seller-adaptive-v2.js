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

function flags() {
  const deal = readDraft();
  const base = Array.isArray(deal.flags) ? deal.flags : [];
  if ((deal.legalForm === 'share' || deal.shareSale === true) && !base.includes('shares')) return [...base, 'shares'];
  return base;
}

function hasFlag(value) {
  return flags().includes(value);
}

function hasBasis(value) {
  return arr('basis').includes(value);
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

function ownershipSection() {
  return section('1. Кто продаёт', 'Это влияет на маршрут: простой продавец, несколько собственников или ребёнок-собственник.', `<div class="option-grid">
    ${option('Один взрослый продавец', 'Самый простой сценарий. Можно сочетать с супругом или доверенностью.', 'sellerFlag:oneAdultSeller', hasFlag('oneAdultSeller'))}
    ${option('Несколько продавцов', 'Нужно понять доли, кто подписывает и кто получает деньги.', 'sellerFlag:manySellers', hasFlag('manySellers'))}
    ${option('Есть ребёнок-собственник', 'Стоп-фактор: юрист и опека до задатка.', 'sellerFlag:minorSeller', hasFlag('minorSeller'), 'юрист до задатка')}
  </div>`);
}

function riskSection() {
  return section('2. Что может остановить задаток', 'Эти пункты лучше выяснить до назначения задатка.', `<div class="option-grid">
    ${option('Собственность оформлена в долях', 'Есть сособственники, нотариус, уведомления или отказы.', 'sellerFlag:shares', hasFlag('shares'))}
    ${option('Есть супруг/супруга', 'Проверить согласие или брачный режим.', 'sellerFlag:spouse', hasFlag('spouse'))}
    ${option('Продажа по доверенности', 'Проверить полномочия и право получения денег.', 'sellerFlag:powerOfAttorney', hasFlag('powerOfAttorney'), 'юрист до задатка')}
    ${option('Продавец не будет лично', 'Нужно понять представителя, доверенность и порядок подписания.', 'sellerFlag:sellerWillNotAttend', hasFlag('sellerWillNotAttend'))}
    ${option('Есть арест/обременение', 'Без юриста не фиксировать задаток.', 'sellerFlag:encumbrance', hasFlag('encumbrance'), 'стоп-фактор')}
    ${option('Риск банкротства продавца', 'Нужна предварительная проверка.', 'sellerFlag:sellerBankruptcyRisk', hasFlag('sellerBankruptcyRisk'), 'проверить')}
  </div>`);
}

function basisSection() {
  return section('3. Основание права', 'Основание права влияет на глубину проверки. Наследство, приватизация, суд и нестандартные основания лучше показать юристу.', `<div class="option-grid">
    ${option('ДКП', 'Обычная покупка по договору купли-продажи.', 'toggle:basis:sale', hasBasis('sale'))}
    ${option('Дарение', 'Проверить дарителя, срок владения и семейные риски.', 'toggle:basis:gift', hasBasis('gift'))}
    ${option('Наследство по закону', 'Юрист: сроки, круг наследников, отказы.', 'toggle:basis:inheritLaw', hasBasis('inheritLaw'), 'юрист')}
    ${option('Наследство по завещанию', 'Юрист: обязательные наследники и возможные споры.', 'toggle:basis:inheritWill', hasBasis('inheritWill'), 'юрист')}
    ${option('Приватизация', 'Проверить отказников и право пользования.', 'toggle:basis:privat', hasBasis('privat'), 'юрист')}
    ${option('ДДУ / уступка', 'Проверить договор, оплату, акт, застройщика.', 'toggle:basis:ddu', hasBasis('ddu'))}
    ${option('Решение суда', 'Юрист до задатка.', 'toggle:basis:court', hasBasis('court'), 'стоп-фактор')}
    ${option('Иное', 'Опишите в комментарии.', 'toggle:basis:other', hasBasis('other'))}
  </div>`);
}

function conditionalDetails() {
  const blocks = [];

  if (hasFlag('powerOfAttorney')) {
    blocks.push(detailsSection('Доверенность', 'Заполняется только если продажа по доверенности.', `<div class="grid">
      <div>${field('proxyDate', 'Дата доверенности')}</div>
      <div>${field('proxyPowers', 'Какие полномочия?', 'text', 'продажа, подписание, получение денег')}</div>
    </div>`, true));
  }

  if (hasFlag('shares')) {
    blocks.push(detailsSection('Доли / сособственники', 'Заполняется, если право оформлено в долях или продаётся часть объекта.', textarea('shareSellerComment', 'Что важно по долям?', 'Размер долей, уведомления, отказы, кто готовит нотариуса?'), true));
  }

  if (hasFlag('minorSeller')) {
    blocks.push(detailsSection('Ребёнок-собственник / опека', 'Стоп-фактор. Нужно понимать встречную покупку и разрешение опеки до задатка.', textarea('childSellerComment', 'Что известно по ребёнку и опеке?', 'Есть ли встречная покупка, какое разрешение опеки, куда выделяется доля?'), true));
  }

  if (hasFlag('spouse')) {
    blocks.push(detailsSection('Супруг / согласие', 'Заполняется, если есть супруг или нужно понять брачный режим.', textarea('spouseComment', 'Что известно по супругу?', 'Брак, развод, согласие, брачный договор, покупка в браке или нет?')));
  }

  if (hasFlag('encumbrance')) {
    blocks.push(detailsSection('Арест / обременение', 'Стоп-фактор для задатка. Нужно передать юристу.', textarea('encumbranceComment', 'Что за обременение?', 'Ипотека, арест, запрет регистрации, долг, исполнительное производство?'), true));
  }

  if (hasFlag('sellerWillNotAttend')) {
    blocks.push(detailsSection('Продавец не будет лично', 'Нужно понять, кто будет подписывать и на каком основании.', textarea('sellerAbsentComment', 'Кто будет вместо продавца?', 'Представитель, доверенность, удалённое подписание, когда продавец доступен?')));
  }

  if (hasBasis('inheritLaw') || hasBasis('inheritWill') || hasBasis('privat') || hasBasis('court') || hasBasis('other')) {
    blocks.push(detailsSection('Основание права — пояснение', 'Для сложных оснований лучше написать короткое пояснение для юриста.', textarea('basisComment', 'Что важно по основанию права?', 'Дата, кто участвовал, были ли споры, отказы, суд, наследники, приватизация.')));
  }

  if (!blocks.length) {
    return `<div class="status ok" style="margin-top:12px">Дополнительные уточнения пока не нужны. Если выберете риск выше, появится нужный вопрос.</div>`;
  }

  return blocks.join('');
}

function sellerStepHtml() {
  return `<div id="adaptiveSellerStep">
    <h2>Продавец и право</h2>
    <p class="muted">Сначала отметьте то, что влияет на маршрут сделки. Подробности для юриста появляются только по выбранным рискам.</p>
    ${ownershipSection()}
    ${riskSection()}
    ${basisSection()}
    ${section('4. Уточнения по выбранным рискам', 'Здесь появляются только те вопросы, которые стали нужны после выбранных пунктов выше.', conditionalDetails())}
    ${section('5. Короткий комментарий по продавцу', 'Не пишите всё подряд. Достаточно: кто собственник, кто будет на задатке/сделке, каких документов не хватает.', textarea('sellerComment', 'Комментарий по продавцу', 'Кто собственник, кто будет на задатке/сделке, какие документы есть, чего не хватает?'))}
  </div>`;
}

function findSellerCard() {
  const headings = [...document.querySelectorAll('#app h2')];
  const heading = headings.find((node) => node.textContent.trim().startsWith('Продавец и право'));
  return heading?.closest?.('.card') || null;
}

function replaceSellerStep(card) {
  if (card.querySelector('#adaptiveSellerStep')) return;

  const title = card.querySelector('.section-title');
  const pageStatus = card.querySelector('#pageStatus');
  if (!title || !pageStatus) return;

  let node = title.nextSibling;
  while (node && node !== pageStatus) {
    const next = node.nextSibling;
    node.remove();
    node = next;
  }

  pageStatus.insertAdjacentHTML('beforebegin', sellerStepHtml());
}

function apply() {
  const card = findSellerCard();
  if (!card) return;
  replaceSellerStep(card);
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
  if (event.target?.closest?.('#adaptiveSellerStep [data-field]')) return;
  schedule();
}, true);
window.addEventListener('storage', schedule);
