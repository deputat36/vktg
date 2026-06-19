function readDraft() {
  try { return JSON.parse(localStorage.getItem('nav_deal_draft_v2') || '{}'); } catch (_) { return {}; }
}

function textOf(value, map) {
  return map[value] || value || 'не выбрано';
}

function buildNextQuestions(deal) {
  const questions = [];
  const isLead = deal.stage === 'lead_only' || (deal.preparationMode === 'consult' && !deal.objectType);

  if (isLead) {
    questions.push('Что клиент хочет сделать: купить, продать, проверить документы или подготовиться к задатку?');
    questions.push('Есть ли уже объект или вторая сторона?');
    questions.push('Какой ближайший следующий шаг: документы, подбор, встреча, звонок, консультация?');
    return questions;
  }

  if (deal.preparationMode === 'deposit' || deal.stage === 'urgent_deposit') {
    questions.push('Цена, сумма задатка, дата и место задатка уже согласованы?');
    questions.push('Кто получает деньги и каким способом?');
    questions.push('Расходы и порядок расчётов согласованы до подписания?');
  }

  if (deal.representation === 'partner_agency') {
    questions.push('Кто партнёр, чью сторону он ведёт и кто отвечает за документы?');
    questions.push('Кто передаёт условия задатка, кто получает деньги, кто общается с юристом?');
  }

  if (deal.representation === 'seller' || deal.representation === 'one_spn_both' || deal.representation === 'both' || deal.representation === 'partner_agency') {
    questions.push('Кто собственник, какое основание права, есть ли супруг, дети, доли или доверенность?');
  }

  if (deal.representation === 'buyer' || deal.representation === 'one_spn_both' || deal.representation === 'both' || deal.representation === 'partner_agency') {
    questions.push('За счёт чего покупатель платит: свои деньги, ипотека, маткапитал, сертификат?');
  }

  if (deal.objectType === 'share') questions.push('По доле: кто сособственники, есть ли уведомления/отказы, кто готовит нотариуса?');
  if (deal.objectType === 'room') questions.push('По комнате: это отдельная комната или доля, какой статус, кто соседи, что с местами общего пользования?');
  if (deal.objectType === 'flat_ground') questions.push('По квартире на земле: что с землёй, входом, коммуникациями и статусом дома?');
  if (deal.objectType === 'house_land') questions.push('По дому с участком: совпадают ли собственники дома и земли, есть ли межевание, ВРИ и коммуникации?');
  if (deal.objectType === 'land') questions.push('По земле: категория, ВРИ, межевание, подъезд, ограничения, коммуникации и строения?');
  if (deal.objectType === 'new_building') questions.push('По новостройке: ДДУ или уступка, застройщик, эскроу, акт, остаток оплаты, ипотека?');
  if (deal.objectType === 'commercial') questions.push('По коммерции: назначение, собственник физлицо/юрлицо, арендатор, НДС и ограничения?');

  return questions.slice(0, 6);
}

function buildNote() {
  const deal = readDraft();
  const prep = textOf(deal.preparationMode, {
    consult: 'консультация / первичный разговор',
    deposit: 'подготовка к задатку',
    deal: 'подготовка сделки',
    check_docs: 'проверка объекта или документов',
    rework: 'доработка заявки'
  });
  const side = textOf(deal.representation, {
    seller: 'сопровождаем продавца',
    buyer: 'сопровождаем покупателя',
    one_spn_both: 'сопровождаем обе стороны, один СПН',
    both: 'сопровождаем обе стороны, два СПН',
    partner_agency: 'партнёрская сделка',
    unknown: 'сторона пока не ясна'
  });
  const stage = textOf(deal.stage, {
    lead_only: 'есть только клиент',
    object_chosen: 'объект выбран, условия не согласованы',
    terms_discussed: 'стороны уже договорились',
    urgent_deposit: 'срочно готовим задаток',
    deposit_exists: 'задаток уже был',
    main_deal: 'готовим основную сделку',
    legal_problem: 'есть вопрос для юриста'
  });

  const isLead = deal.stage === 'lead_only' || (deal.preparationMode === 'consult' && !deal.objectType);
  const lines = [];
  lines.push(`Сценарий: ${prep}.`);
  lines.push(`Сторона: ${side}.`);
  lines.push(`Стадия: ${stage}.`);
  if (isLead) lines.push('Короткий сценарий: зафиксируйте запрос, контакт и следующий шаг. Детальная сделочная анкета понадобится позже, когда появится объект или вторая сторона.');
  if (deal.objectType === 'share') lines.push('Доля: нужны сособственники, уведомления/отказы и нотариальная логика.');
  if (deal.objectType === 'room') lines.push('Комната: важно отличать её от доли, уточнить статус объекта, соседей и места общего пользования.');
  if (deal.objectType === 'flat_ground') lines.push('Квартира на земле: дополнительно проверяются земля, вход, коммуникации и статус дома.');
  if (deal.objectType === 'house_land') lines.push('Дом с участком: проверяются и дом, и земля — это два связанных объекта.');
  if (deal.objectType === 'land') lines.push('Земельный участок: ключевые вопросы — категория, ВРИ, межевание и ограничения.');
  if (deal.objectType === 'new_building') lines.push('Новостройка/уступка: важно понять тип договора, застройщика, эскроу, акт и остаток оплаты.');
  if (deal.objectType === 'commercial') lines.push('Коммерция: проверяются назначение, арендатор, юрлицо/физлицо, НДС и ограничения.');
  return { lines, questions: buildNextQuestions(deal) };
}

function injectNote() {
  const aside = document.querySelector('.steps.card');
  if (!aside) return;
  let box = document.getElementById('spnRouteNote');
  if (!box) {
    box = document.createElement('details');
    box.id = 'spnRouteNote';
    box.className = 'status';
    box.style.marginTop = '12px';
    aside.appendChild(box);
  }

  const note = buildNote();
  const linesHtml = note.lines.map((line) => `<p style="margin:0 0 6px">${line}</p>`).join('');
  const questionsHtml = note.questions.length
    ? `<div style="margin-top:10px"><b>Что спросить сейчас:</b><ul style="margin:6px 0 0 18px;padding:0">${note.questions.map((line) => `<li>${line}</li>`).join('')}</ul></div>`
    : '';

  box.innerHTML = `<summary><b>Логика сценария</b></summary><div style="margin-top:8px;line-height:1.5">${linesHtml}${questionsHtml}</div>`;
}

let scheduled = false;
function scheduleNoteUpdate() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    injectNote();
  }, 80);
}

document.addEventListener('click', scheduleNoteUpdate, true);
document.addEventListener('input', scheduleNoteUpdate, true);
window.addEventListener('storage', scheduleNoteUpdate);

let attempts = 0;
const bootTimer = setInterval(() => {
  attempts += 1;
  injectNote();
  if (document.getElementById('spnRouteNote') || attempts >= 20) clearInterval(bootTimer);
}, 150);
