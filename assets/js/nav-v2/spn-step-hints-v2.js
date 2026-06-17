const DRAFT_KEY = 'nav_deal_draft_v2';
let currentHints = [];

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') || {}; } catch (_) { return {}; }
}

function arr(value) { return Array.isArray(value) ? value : []; }
function filled(value) { return String(value ?? '').trim().length > 0; }
function moneyFilled(value) { return Number(String(value || '').replace(',', '.')) > 0; }
function has(list, value) { return arr(list).includes(value); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }

function activeStepIndex() {
  const buttons = [...document.querySelectorAll('.step-pill')];
  return buttons.findIndex((button) => button.classList.contains('active'));
}

function hintsForStep(index, d) {
  const flags = arr(d.flags);
  const basis = arr(d.basis);
  const payments = arr(d.payments);
  const settlements = arr(d.settlements);

  if (index === 0) return [
    'Сначала определите цель: готовим задаток, сделку или просто консультацию. От этого зависит глубина проверки.',
    'Если клиент хочет задаток сегодня/завтра — не пропускайте расчеты, расходы, детей, доверенность и основание права.'
  ];

  if (index === 1) return [
    'Уточните, кто наш клиент и кто несет ответственность за документы: продавец, покупатель, обе стороны или партнерская сделка.',
    'Если вторая сторона без представителя, заранее зафиксируйте, кто объясняет ей расходы, сроки и риски.'
  ];

  if (index === 2) {
    const hints = [];
    if (!filled(d.address)) hints.push('Укажите адрес. Без адреса юристу и менеджеру сложно понять, о какой заявке речь.');
    if (!moneyFilled(d.priceTotal)) hints.push('Укажите цену объекта. От нее зависят задаток, комиссия, расходы и ожидания сторон.');
    if (d.preparationMode === 'deposit' && !moneyFilled(d.depositAmount)) hints.push('Для задатка нужна сумма задатка/аванса до встречи с клиентом.');
    if (!filled(d.cadastralNumber)) hints.push('Кадастровый номер можно заполнить позже, но если он есть — это ускорит проверку.');
    return hints.length ? hints : ['Базовые данные объекта заполнены. Проверьте, не отличается ли цена в договоре от фактической договоренности.'];
  }

  if (index === 3) {
    const hints = [];
    if (!flags.length) hints.push('Отметьте хотя бы простую ситуацию: один взрослый собственник, несколько собственников, доли, супруг, дети или доверенность.');
    if (has(flags, 'minorSeller') || has(flags, 'minorBuyer') || has(flags, 'minorRegistered')) hints.push('Есть дети: до задатка нужно понять, нужна ли опека, выписка, разрешение, где будет регистрация/доля ребенка.');
    if (has(flags, 'powerOfAttorney')) hints.push('Есть доверенность: нужно проверить полномочия, срок, право получения денег и право подписания задатка/договора.');
    if (has(flags, 'shares')) hints.push('Есть доли: возможна нотариальная форма и дополнительные расходы. Уточните, кто их оплачивает.');
    if (!filled(d.sellerPhone) && !filled(d.buyerPhone)) hints.push('Добавьте телефоны сторон, чтобы потом не искать контакты перед задатком/проверкой.');
    return hints;
  }

  if (index === 4) {
    const hints = [];
    if (!basis.length) hints.push('Отметьте основание права. Без этого юрист не поймет главный юридический риск.');
    if (basis.some(x => ['inheritLaw','inheritWill'].includes(x))) hints.push('Наследство: уточнить дату смерти, срок владения, круг наследников, были ли споры или отказы.');
    if (has(basis, 'privat')) hints.push('Приватизация: уточнить отказников и зарегистрированных лиц, особенно детей и тех, кто мог сохранить право пользования.');
    if (has(basis, 'court')) hints.push('Решение суда: передавать юристу до задатка. Нужны текст решения и отметка о вступлении в силу.');
    if (!filled(d.basisComment)) hints.push('Кратко напишите, какие документы уже видел СПН, а чего нет на руках.');
    return hints;
  }

  if (index === 5) {
    const hints = [];
    if (!payments.length) hints.push('Отметьте источник денег покупателя. Это сразу показывает, нужен ли брокер, банк, СФР, сертификат или особый порядок расчетов.');
    if (payments.some(x => ['mortgage','militaryMortgage'].includes(x))) hints.push('Есть ипотека: уточните банк, одобрение, первоначальный взнос, оценку, страховку и требования банка к объекту.');
    if (payments.some(x => ['matcap','nominalChild','svoChildAccount'].includes(x))) hints.push('Есть детские/социальные деньги: до задатка проверьте порядок перечисления и интересы детей.');
    if (has(payments, 'certificate')) hints.push('Сертификат/субсидия: уточните срок действия, орган, порядок перечисления и список обязательных условий.');
    if (has(payments, 'installment')) hints.push('Рассрочка/остаток долга: нужен безопасный механизм и понятные сроки оплаты.');
    return hints;
  }

  if (index === 6) {
    const hints = [];
    if (!settlements.length) hints.push('Выберите механизм расчетов: на сделке, перед сделкой, СБР, аккредитив, ячейка, после регистрации и т.д.');
    if (d.settlementsAgreed !== true) hints.push('До задатка порядок расчетов должен быть согласован. Иначе юрист получит не заявку, а спор сторон.');
    if (has(settlements, 'afterRegistration')) hints.push('Расчет после регистрации — повышенный риск. Обычно нужен понятный механизм защиты продавца.');
    if (!filled(d.settlementsComment)) hints.push('Добавьте комментарий: когда деньги передаются, кто пишет расписку, какой банк/сервис, есть ли обременение.');
    return hints;
  }

  if (index === 7) {
    const hints = [];
    if (d.expensesAgreed !== true) hints.push('Расходы лучше согласовать до задатка: нотариус, банк, справки, оценка, страховка, госпошлина, комиссия.');
    if (!filled(d.notaryPayer)) hints.push('Отметьте, кто платит нотариуса или что нотариус пока не нужен/не ясно.');
    if (!filled(d.expensesComment)) hints.push('Напишите спорные расходы в комментарии: кто что платит и что еще не согласовано.');
    return hints;
  }

  if (index === 8) {
    const hints = [];
    if (!filled(d.spnFinalComment)) hints.push('Напишите короткий комментарий для юриста: что понятно, чего нет, что просите проверить.');
    if (!filled(d.clientNextStep)) hints.push('Укажите следующий шаг с клиентом: собрать документы, назначить задаток, согласовать расчеты, подключить брокера.');
    hints.push('Перед сохранением прочитайте текст передачи юристу. Он должен быть понятен без устных пояснений.');
    return hints;
  }

  return [];
}

function copyText() {
  const index = activeStepIndex();
  const title = document.querySelector('.stepper > section.card h2')?.textContent?.trim() || 'Текущий шаг';
  const text = [`Вопросы и уточнения по шагу: ${title}`, '', ...currentHints.map((hint, i) => `${i + 1}. ${hint}`)].join('\n');
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copySpnStepHints');
    if (!btn) return;
    btn.textContent = 'Скопировано';
    setTimeout(() => btn.textContent = 'Скопировать вопросы', 1500);
  }).catch(() => {
    alert('Не удалось скопировать автоматически. Выделите текст подсказок вручную.');
  });
}

function renderHints() {
  const mainCard = document.querySelector('.stepper > section.card');
  if (!mainCard) return;
  const index = activeStepIndex();
  if (index < 0) return;
  const hints = hintsForStep(index, readDraft()).filter(Boolean);
  currentHints = hints;
  const old = document.getElementById('spnStepHints');
  if (old) old.remove();
  if (!hints.length) return;
  const box = document.createElement('div');
  box.id = 'spnStepHints';
  box.className = 'status warn';
  box.innerHTML = `<b>Подсказка перед передачей юристу</b><br>${hints.map((hint) => `• ${esc(hint)}`).join('<br>')}<div class="actions" style="justify-content:flex-start;margin-top:10px"><button id="copySpnStepHints" class="btn light" type="button">Скопировать вопросы</button></div>`;
  const title = mainCard.querySelector('h2');
  if (title) title.insertAdjacentElement('afterend', box);
  document.getElementById('copySpnStepHints')?.addEventListener('click', copyText);
}

function scheduleRender() {
  window.requestAnimationFrame(renderHints);
}

new MutationObserver(scheduleRender).observe(document.body, { childList: true, subtree: true });
document.addEventListener('input', scheduleRender, true);
document.addEventListener('click', () => setTimeout(renderHints, 0), true);
renderHints();
