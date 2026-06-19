const CHECK_ID = 'spnConsistencyCheck';
const DRAFT_KEY = 'nav_deal_draft_v2';

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function filled(value) {
  return String(value || '').trim().length > 0;
}

function buildChecks(deal) {
  const warnings = [];
  const tips = [];
  const flags = arr(deal.flags);
  const payments = arr(deal.payments);
  const settlements = arr(deal.settlements);

  if (deal.preparationMode === 'consult' && ['urgent_deposit', 'deposit_exists', 'main_deal'].includes(deal.stage)) {
    warnings.push('Выбрана консультация, но стадия уже похожа на задаток или сделку. Возможно, лучше выбрать “подготовка к задатку” или “подготовка сделки”.');
  }

  if (deal.preparationMode === 'deposit' && deal.stage === 'lead_only') {
    warnings.push('Выбрана подготовка к задатку, но стадия “есть только клиент”. Для задатка обычно уже нужны объект, стороны, цена и сумма.');
  }

  if (deal.objectType === 'share' && !flags.includes('shares')) {
    warnings.push('Объект — доля. Проверьте, что в рисках/продавце отмечены доли, сособственники, уведомления и нотариус.');
  }

  if (deal.objectType === 'room' && flags.includes('shares')) {
    tips.push('Комната и доля — разные сценарии. Если это именно доля в праве, лучше выбрать объект “доля”. Если отдельная комната — оставьте “комната”.');
  }

  if (deal.objectType === 'flat_ground' && !filled(deal.landStatus) && !filled(deal.landCadastralNumber)) {
    tips.push('Для квартиры на земле желательно уточнить землю: статус, кадастровый номер, порядок пользования или документы на участок.');
  }

  if (flags.includes('minorSeller') || flags.includes('minorBuyer') || flags.includes('minorRegistered') || payments.includes('matcap') || payments.includes('nominalChild') || payments.includes('svoChildAccount')) {
    warnings.push('Есть дети, опека, маткапитал или детские деньги. До задатка лучше подключить юриста.');
  }

  if (payments.includes('mortgage') || payments.includes('militaryMortgage') || payments.includes('certificate') || payments.includes('matcap')) {
    if (!filled(deal.bankName) && !filled(deal.mortgageApproved)) {
      tips.push('Есть ипотека/сертификат/маткапитал. Желательно уточнить банк, одобрение, сроки и требования к объекту.');
    }
  }

  if (settlements.includes('afterRegistration') && deal.settlementsAgreed !== true) {
    warnings.push('Расчёт после регистрации выбран, но порядок расчётов не отмечен как согласованный. Это риск для продавца.');
  }

  if ((deal.preparationMode === 'deposit' || deal.stage === 'urgent_deposit') && deal.expensesAgreed !== true) {
    tips.push('Для задатка желательно заранее согласовать расходы: нотариус, банк, справки, госпошлина, комиссия.');
  }

  if ((deal.preparationMode === 'deposit' || deal.stage === 'urgent_deposit') && !filled(deal.depositAmount)) {
    tips.push('Для задатка не указана сумма. Лучше уточнить её до передачи юристу или руководителю.');
  }

  if (deal.representation === 'buyer' && deal.hasSeller === true) {
    tips.push('Сопровождаем покупателя, но продавец тоже отмечен как имеющийся. Это нормально, если объект выбран; проверьте, не нужен ли блок продавца.');
  }

  if (deal.representation === 'seller' && deal.hasBuyer === true) {
    tips.push('Сопровождаем продавца, но покупатель уже есть. Если стороны договорились, проверьте задаток, расчёты и расходы.');
  }

  return { warnings, tips };
}

function listHtml(items) {
  return items.map((item) => `<li>${item}</li>`).join('');
}

function injectCheck() {
  const aside = document.querySelector('.steps.card');
  if (!aside) return;

  const deal = readDraft();
  const result = buildChecks(deal);
  const hasContent = result.warnings.length || result.tips.length;
  let box = document.getElementById(CHECK_ID);

  if (!hasContent) {
    if (box) box.remove();
    return;
  }

  if (!box) {
    box = document.createElement('details');
    box.id = CHECK_ID;
    box.className = result.warnings.length ? 'status warn' : 'status';
    box.style.marginTop = '12px';
    aside.appendChild(box);
  }

  box.className = result.warnings.length ? 'status warn' : 'status';
  box.innerHTML = `<summary><b>Проверка логики</b></summary>
    <div style="margin-top:8px;line-height:1.5">
      ${result.warnings.length ? `<b>Внимание:</b><ul style="margin:6px 0 10px 18px;padding:0">${listHtml(result.warnings)}</ul>` : ''}
      ${result.tips.length ? `<b>Что уточнить:</b><ul style="margin:6px 0 0 18px;padding:0">${listHtml(result.tips)}</ul>` : ''}
    </div>`;
}

let scheduled = false;
function scheduleCheck() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    injectCheck();
  }, 90);
}

document.addEventListener('click', scheduleCheck, true);
document.addEventListener('input', scheduleCheck, true);
window.addEventListener('storage', scheduleCheck);

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  injectCheck();
  if (document.querySelector('.steps.card') || attempts >= 25) clearInterval(timer);
}, 150);
