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

function hasPayment(value) {
  return arr('payments').includes(value);
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

function riskList() {
  const risks = [];
  if (hasFlag('minorSeller') || hasFlag('minorBuyer') || hasPayment('matcap') || hasPayment('nominalChild') || hasPayment('svoChildAccount')) risks.push('дети / опека / детские деньги');
  if (hasFlag('powerOfAttorney')) risks.push('доверенность');
  if (hasFlag('shares')) risks.push('доли / сособственники / нотариус');
  if (hasFlag('encumbrance')) risks.push('арест / обременение');
  if (hasBasis('inheritLaw') || hasBasis('inheritWill') || hasBasis('privat') || hasBasis('court')) risks.push('сложное основание права');
  if (hasPayment('mortgage') || hasPayment('militaryMortgage') || hasPayment('certificate')) risks.push('банк / сертификат / сроки оплаты');
  return risks;
}

function safetySection() {
  const deal = readDraft();
  const risks = riskList();
  const riskHtml = risks.length
    ? `<div class="status warn" style="margin-top:10px"><b>Перед задатком обратить внимание:</b><br>${risks.map((item) => `• ${esc(item)}`).join('<br>')}</div>`
    : `<div class="status ok" style="margin-top:10px">Явных стоп-факторов для задатка по выбранным ответам пока нет.</div>`;

  return section('1. Можно ли безопасно идти к задатку', 'Сначала проверьте не дату и место, а готовность сторон и риски.', `<div class="option-grid">
    ${option('Цена согласована', 'Стороны одинаково понимают итоговую цену объекта.', 'set:priceAgreed:true', deal.priceAgreed === true)}
    ${option('Цена ещё не согласована', 'Задаток рано фиксировать, сначала договориться по цене.', 'set:priceAgreed:false', deal.priceAgreed === false, 'стоп')}
    ${option('Расчёты понятны', 'Понятно, когда и как продавец получает деньги.', 'set:settlementsAgreed:true', deal.settlementsAgreed === true)}
    ${option('Расчёты не понятны', 'До задатка нужно согласовать порядок денег.', 'set:settlementsAgreed:false', deal.settlementsAgreed === false, 'стоп')}
    ${option('Расходы согласованы', 'Понятно, кто платит нотариуса, банк, справки, госпошлины.', 'set:expensesAgreed:true', deal.expensesAgreed === true)}
    ${option('Расходы не согласованы', 'До задатка нужно проговорить расходы.', 'set:expensesAgreed:false', deal.expensesAgreed === false, 'уточнить')}
    ${option('Юрист проверил риски', 'Выберите, если спорные моменты уже показали юристу.', 'set:lawyerCheckedBeforeDeposit:true', deal.lawyerCheckedBeforeDeposit === true)}
    ${option('Юрист ещё не проверял', 'Если есть дети, доли, доверенность, наследство, обременение — сначала юрист.', 'set:lawyerCheckedBeforeDeposit:false', deal.lawyerCheckedBeforeDeposit === false)}
  </div>${riskHtml}`);
}

function mainConditionsSection() {
  const deal = readDraft();
  return section('2. Главные условия задатка', 'Это то, что реально должно быть закреплено в соглашении.', `<div class="option-grid">
    ${option('Задаток', 'Жёстче по последствиям отказа. Нужны понятные условия.', 'set:depositKind:deposit', deal.depositKind === 'deposit')}
    ${option('Аванс', 'Мягче, чаще возвращается. Уточнить формулировку.', 'set:depositKind:advance', deal.depositKind === 'advance')}
    ${option('Пока не решили', 'Сначала согласовать юридическую форму денег.', 'set:depositKind:unknown', deal.depositKind === 'unknown')}
  </div>
  <div class="grid" style="margin-top:12px">
    <div>${field('depositAmount', 'Сумма задатка/аванса', 'number')}</div>
    <div>${field('depositDate', 'Когда планируется задаток?', 'text', 'дата или ориентир')}</div>
  </div>
  <div class="grid">
    <div>${field('dealDeadline', 'До какого срока выйти на сделку?', 'text', 'дата или период')}</div>
    <div>${field('releaseTerms', 'Освобождение объекта', 'text', 'до сделки, после регистрации, дата')}</div>
  </div>
  ${textarea('depositConditions', 'Что обязательно фиксируем в задатке?', 'Цена, срок сделки, порядок расчётов, расходы, мебель, освобождение, ответственность сторон.')}`);
}

function responsibilitySection() {
  return section('3. Что будет, если кто-то не выйдет на сделку', 'Эти условия важнее, чем место подписания. Их нужно проговорить до передачи денег.', `<div class="grid">
    <div>${field('sellerRefusalTerms', 'Если откажется продавец')}</div>
    <div>${field('buyerRefusalTerms', 'Если откажется покупатель')}</div>
  </div>
  ${textarea('depositReturnConditions', 'Когда деньги возвращаются / не возвращаются?', 'Ипотека не одобрена, документы не готовы, юрист выявил риск, продавец передумал, покупатель передумал.')}`);
}

function participantsSection() {
  return section('4. Кто подписывает и кто получает деньги', 'Подписант и получатель денег должны совпадать с безопасной схемой. Особенно при доверенности, долях и нескольких продавцах.', `<div class="grid">
    <div>${field('depositSignerSeller', 'Кто подписывает от продавца?', 'text', 'собственник, представитель, все продавцы')}</div>
    <div>${field('depositSignerBuyer', 'Кто подписывает от покупателя?', 'text', 'покупатель, представитель, супруг')}</div>
  </div>
  <div class="grid">
    <div>${field('depositReceiver', 'Кто получает деньги?')}</div>
    <div>${field('depositTransferMethod', 'Как передаются деньги?', 'text', 'наличные, перевод, расписка')}</div>
  </div>`);
}

function technicalSection() {
  return detailsSection('5. Технические детали подписания', 'Эти поля нужны для организации встречи, но не должны быть в начале.', `<div class="grid">
    <div>${field('depositPlace', 'Где подписываем?')}</div>
    <div>${field('depositTime', 'Время подписания')}</div>
  </div>
  <div class="grid">
    <div>${field('depositDocumentsReady', 'Какие документы будут на встрече?')}</div>
    <div>${field('depositWhoPrepares', 'Кто готовит соглашение?')}</div>
  </div>`);
}

function existingDepositSection() {
  const deal = readDraft();
  if (deal.stage !== 'deposit_exists') return '';
  return detailsSection('Задаток уже был подписан', 'Появляется только если на стадии выбрано “Задаток уже был”.', `${textarea('existingDepositComment', 'Что уже подписали по задатку?', 'Дата, сумма, кто подписал, спорные условия, срок сделки.')}
  ${textarea('existingDepositProblems', 'Есть ли проблемы в уже подписанном документе?', 'Нет срока, не те стороны, не указан порядок расчётов, спорная ответственность.')}`, true);
}

function depositStepHtml() {
  return `<div id="adaptiveDepositStep">
    <h2>Условия задатка</h2>
    <p class="muted">Сначала проверяем безопасность и ключевые условия. Организационные детали — ниже.</p>
    ${safetySection()}
    ${mainConditionsSection()}
    ${responsibilitySection()}
    ${participantsSection()}
    ${technicalSection()}
    ${existingDepositSection()}
    ${section('6. Короткий комментарий по задатку', 'Кратко: что уже договорились, что спорно, что обязательно проверить перед подписанием.', textarea('depositComment', 'Комментарий по задатку', 'Что важно не забыть при подготовке задатка?'))}
  </div>`;
}

function findDepositCard() {
  const headings = [...document.querySelectorAll('#app h2')];
  const heading = headings.find((node) => node.textContent.trim().startsWith('Условия задатка'));
  return heading?.closest?.('.card') || null;
}

function replaceDepositStep(card) {
  if (card.querySelector('#adaptiveDepositStep')) return;

  const title = card.querySelector('.section-title');
  const pageStatus = card.querySelector('#pageStatus');
  if (!title || !pageStatus) return;

  let node = title.nextSibling;
  while (node && node !== pageStatus) {
    const next = node.nextSibling;
    node.remove();
    node = next;
  }

  pageStatus.insertAdjacentHTML('beforebegin', depositStepHtml());
}

function apply() {
  const card = findDepositCard();
  if (!card) return;
  replaceDepositStep(card);
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
  if (event.target?.closest?.('#adaptiveDepositStep [data-field]')) return;
  schedule();
}, true);
window.addEventListener('storage', schedule);
