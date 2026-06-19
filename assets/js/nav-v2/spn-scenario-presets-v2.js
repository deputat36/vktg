const PRESET_CARD_ID = 'spnScenarioPresets';
const DRAFT_KEY = 'nav_deal_draft_v2';

const presets = [
  {
    title: 'Первичная консультация',
    text: 'Клиент есть, но сделки ещё нет. Фиксируем запрос, контакт и следующий шаг.',
    patch: { preparationMode: 'consult', stage: 'lead_only', representation: 'unknown', hasSeller: false, hasBuyer: false }
  },
  {
    title: 'Срочный задаток, обе стороны',
    text: 'Продавец и покупатель уже есть, нужно быстро проверить условия до задатка.',
    patch: { preparationMode: 'deposit', stage: 'urgent_deposit', representation: 'one_spn_both', hasSeller: true, hasBuyer: true }
  },
  {
    title: 'Задаток от продавца',
    text: 'Работаем от продавца, покупатель есть или появился. Нужны право, документы, цена, задаток, расходы и расчёты.',
    patch: { preparationMode: 'deposit', stage: 'urgent_deposit', representation: 'seller', hasSeller: true, hasBuyer: true }
  },
  {
    title: 'Задаток от покупателя',
    text: 'Работаем от покупателя, объект выбран. Нужны деньги покупателя, условия задатка, расходы и риски объекта.',
    patch: { preparationMode: 'deposit', stage: 'urgent_deposit', representation: 'buyer', hasSeller: true, hasBuyer: true }
  },
  {
    title: 'Партнёрская сделка',
    text: 'Есть внешний партнёр. Важно понять, чья сторона, кто отвечает за документы, задаток и передачу информации.',
    patch: { preparationMode: 'deposit', stage: 'terms_discussed', representation: 'partner_agency', hasSeller: true, hasBuyer: true }
  },
  {
    title: 'Только продавец',
    text: 'Работаем от продавца: право, документы, собственники, риски, готовность к задатку.',
    patch: { preparationMode: 'check_docs', stage: 'object_chosen', representation: 'seller', hasSeller: true, hasBuyer: false }
  },
  {
    title: 'Только покупатель',
    text: 'Работаем от покупателя: деньги, ипотека, маткапитал, сертификаты, сроки.',
    patch: { preparationMode: 'consult', stage: 'object_chosen', representation: 'buyer', hasSeller: false, hasBuyer: true }
  },
  {
    title: 'Доля / часть объекта',
    text: 'Сначала выберите физический тип недвижимости, потом уточните долю, вход, двор и порядок пользования.',
    patch: { preparationMode: 'check_docs', stage: 'object_chosen', hasSeller: true, legalForm: 'share', flags: ['shares'] }
  },
  {
    title: 'Комната',
    text: 'Не путать с долей: уточняем статус комнаты, соседей и места общего пользования.',
    patch: { preparationMode: 'check_docs', stage: 'object_chosen', objectCategory: 'room', objectType: 'room', hasSeller: true }
  },
  {
    title: 'Квартира на земле',
    text: 'Проверяем землю, статус дома, вход, коммуникации и документы на участок.',
    patch: { preparationMode: 'check_docs', stage: 'object_chosen', objectCategory: 'flat', apartmentKind: 'flat_ground', objectType: 'flat_ground', hasSeller: true }
  },
  {
    title: 'Дом с участком',
    text: 'Проверяем отдельно дом и землю: кадастры, собственников, межевание, ВРИ, коммуникации.',
    patch: { preparationMode: 'check_docs', stage: 'object_chosen', objectCategory: 'house_land', objectType: 'house_land', hasSeller: true }
  },
  {
    title: 'Земельный участок',
    text: 'Категория земли, ВРИ, межевание, подъезд, ограничения, коммуникации, строения.',
    patch: { preparationMode: 'check_docs', stage: 'object_chosen', objectCategory: 'land', objectType: 'land', hasSeller: true }
  },
  {
    title: 'Новостройка / уступка',
    text: 'Застройщик, ДДУ или уступка, эскроу, акт, остаток оплаты, ипотека.',
    patch: { preparationMode: 'check_docs', stage: 'object_chosen', objectCategory: 'new_building', objectType: 'new_building', hasSeller: true }
  },
  {
    title: 'Коммерция',
    text: 'Назначение, собственник физлицо/юрлицо, арендатор, НДС, ограничения, отдельный вход.',
    patch: { preparationMode: 'check_docs', stage: 'object_chosen', objectCategory: 'commercial', objectType: 'commercial', hasSeller: true }
  }
];

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function mergeArrays(currentValue, nextValue) {
  const current = Array.isArray(currentValue) ? currentValue : [];
  const next = Array.isArray(nextValue) ? nextValue : [];
  return [...new Set([...current, ...next])];
}

function applyPreset(index) {
  const preset = presets[index];
  if (!preset) return;
  const ok = confirm(`Применить сценарий «${preset.title}»?\n\nТекущий черновик не будет очищен. Будут изменены только стартовые признаки сценария.`);
  if (!ok) return;

  const draft = readDraft();
  const patch = { ...preset.patch };

  if (Array.isArray(patch.flags)) patch.flags = mergeArrays(draft.flags, patch.flags);
  const next = { ...draft, ...patch };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  location.reload();
}

function presetHtml(item, index) {
  return `<div class="list-item">
    <b>${item.title}</b>
    <span class="small">${item.text}</span>
    <div class="actions" style="justify-content:flex-start;margin-top:8px">
      <button class="btn light" type="button" data-spn-preset="${index}">Выбрать этот сценарий</button>
    </div>
  </div>`;
}

function injectPresets() {
  const appShell = document.querySelector('#app .nav-v2-shell');
  if (!appShell || document.getElementById(PRESET_CARD_ID)) return;

  const guide = document.getElementById('spnScenarioGuide');
  const card = document.createElement('section');
  card.id = PRESET_CARD_ID;
  card.className = 'card';
  card.innerHTML = `<details open>
    <summary><span class="pill blue">Быстрый старт</span> <b>Шаблоны сценариев</b></summary>
    <p class="muted" style="margin:10px 0 12px">Выберите типовую ситуацию, чтобы мастер сам выставил стартовые ответы. Это не удаляет черновик.</p>
    <div class="list">${presets.map(presetHtml).join('')}</div>
  </details>`;

  if (guide && guide.nextSibling) appShell.insertBefore(card, guide.nextSibling);
  else if (guide) appShell.appendChild(card);
  else {
    const hero = appShell.querySelector('.hero');
    if (hero && hero.nextSibling) appShell.insertBefore(card, hero.nextSibling);
    else appShell.prepend(card);
  }
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  injectPresets();
  if (document.getElementById(PRESET_CARD_ID) || attempts >= 30) clearInterval(timer);
}, 150);

document.addEventListener('click', (event) => {
  const button = event.target?.closest?.('[data-spn-preset]');
  if (button) {
    event.preventDefault();
    applyPreset(Number(button.dataset.spnPreset));
    return;
  }
  setTimeout(injectPresets, 80);
}, true);
