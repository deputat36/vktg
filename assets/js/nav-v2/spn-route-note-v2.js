function readDraft() {
  try { return JSON.parse(localStorage.getItem('nav_deal_draft_v2') || '{}'); } catch (_) { return {}; }
}

function textOf(value, map) {
  return map[value] || value || 'не выбрано';
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
  if (isLead) lines.push('Это короткий сценарий: сначала важно зафиксировать запрос клиента, контакт и следующий шаг. Детальная сделочная анкета нужна позже, когда появится объект или вторая сторона.');
  if (deal.objectType === 'share') lines.push('Выбрана доля: нужны сособственники, уведомления/отказы и нотариальная логика.');
  if (deal.objectType === 'room') lines.push('Выбрана комната: важно отличать её от доли и уточнить статус объекта, соседей и места общего пользования.');
  if (deal.objectType === 'flat_ground') lines.push('Выбрана квартира на земле: дополнительно проверяются земля, вход, коммуникации и статус дома.');
  return lines;
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
  box.innerHTML = `<summary><b>Логика сценария</b></summary><div style="margin-top:8px;line-height:1.5">${buildNote().map((line) => `<p style="margin:0 0 6px">${line}</p>`).join('')}</div>`;
}

const observer = new MutationObserver(() => injectNote());
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('storage', injectNote);
injectNote();
