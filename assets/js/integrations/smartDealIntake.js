import { setCheckedValues } from '../ui/form.js';

const state = {
  goal: localStorage.getItem('smart_goal') || 'deposit',
  representation: localStorage.getItem('smart_representation') || 'both_sides_two_spn',
  objectGroup: localStorage.getItem('smart_object_group') || 'flat',
  calculation: localStorage.getItem('smart_calculation') || 'cash',
  features: JSON.parse(localStorage.getItem('smart_features') || '[]'),
  mode: localStorage.getItem('smart_flow_mode') || 'simple'
};

const goals = [
  ['deposit', 'Готовим задаток', 'Можно ли брать задаток и что собрать.'],
  ['deal', 'Готовим сделку', 'Финальный пакет и регистрация.'],
  ['check', 'Проверка до аванса', 'Быстро понять риски.'],
  ['mortgage', 'Ипотечная сделка', 'Банк, оценка, Домклик.']
];
const reps = [
  ['both_sides_two_spn', 'Два СПН', 'Продавец и покупатель у наших СПН.'],
  ['both_sides_one_spn', 'Один СПН на обе стороны', 'Один специалист ведет всех.'],
  ['seller_only', 'Мы за продавца', 'Покупатель сам или с агентством.'],
  ['buyer_only', 'Мы за покупателя', 'Продавец сам или с агентством.'],
  ['external_agency', 'Есть другое агентство', 'Вторую сторону ведет партнер.']
];
const objects = [
  ['flat', 'Квартира в МКД', 'Обычная квартира.'],
  ['private_flat', 'Квартира в частном секторе', 'Нюансы для банка/маткапитала.'],
  ['house_land', 'Дом + земля', 'Два кадастровых номера.'],
  ['land', 'Земля / СНТ', 'Границы, ВРИ, категория.'],
  ['share', 'Доля', 'Нотариус, ППП, ограничения.'],
  ['new_building', 'Новостройка / уступка', 'ДДУ, уступка, банк.']
];
const calcs = [
  ['cash', 'Без ипотеки', 'Наличные или безнал.'],
  ['mortgage', 'Ипотека', 'Банк и оценка.'],
  ['sber', 'Сбер / Домклик', 'Документы в Домклик, СБР.'],
  ['certificates', 'Сертификаты', 'Маткапитал, НИС, переселение.'],
  ['mixed', 'Смешанный расчет', 'Несколько источников денег.']
];
const features = [
  ['minor_owner', 'Несовершеннолетний собственник'],
  ['power_of_attorney', 'Доверенность'],
  ['registered_people', 'Есть зарегистрированные'],
  ['price_mismatch', 'Цена в договоре отличается'],
  ['inheritance_recent', 'Недавнее наследство'],
  ['encumbrance', 'Обременение продавца'],
  ['alternative', 'Альтернатива / цепочка'],
  ['no_boundaries', 'Участок без межевания']
];

function get(id) { return document.getElementById(id); }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
function setValue(id, value) { const el = get(id); if (el) el.value = value ?? ''; }
function loadStylesheet() {
  if (document.querySelector('link[href="./assets/css/smart-deal-intake.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/css/smart-deal-intake.css';
  document.head.appendChild(link);
}
function leftPanel() { return document.querySelector('aside.panel.left'); }

function cards(key, items, active) {
  return items.map(([id, title, hint]) => `<button type="button" class="smart-card ${active === id ? 'active' : ''}" data-smart-key="${key}" data-smart-value="${id}"><b>${esc(title)}</b><small>${esc(hint)}</small></button>`).join('');
}
function renderHtml() {
  return `
    <div class="smart-compact-row"><div><h2>🚀 Быстрое заполнение сделки</h2><p>Отвечайте на простые вопросы. Лишнее скрыто, нужное подставляется автоматически.</p></div><span class="smart-mode-note" id="smartModeNote">Режим: простой</span></div>
    <div class="smart-stage"><h3>1. Что готовим?</h3><div class="smart-cards">${cards('goal', goals, state.goal)}</div></div>
    <div class="smart-stage"><h3>2. Кого мы представляем?</h3><div class="smart-cards">${cards('representation', reps, state.representation)}</div></div>
    <div class="smart-stage"><h3>3. Какой объект?</h3><div class="smart-cards">${cards('objectGroup', objects, state.objectGroup)}</div></div>
    <div class="smart-stage"><h3>4. Какой расчет?</h3><div class="smart-cards">${cards('calculation', calcs, state.calculation)}</div></div>
    <div class="smart-stage"><h3>5. Есть особенности?</h3><div class="smart-chips">${features.map(([id,title]) => `<button type="button" class="smart-chip" data-smart-feature="${id}">${esc(title)}</button>`).join('')}</div></div>
    <div class="smart-stage"><h3>6. Минимум данных</h3><div class="smart-fields"><label>Адрес объекта<input id="smartAddress" placeholder="Борисоглебск, адрес"></label><label>Цена<input id="smartPriceFact" placeholder="например: 3 500 000"></label><label class="smart-field" data-smart-field="sellerPhone">Телефон продавца<input id="smartSellerPhone"></label><label class="smart-field" data-smart-field="buyerPhone">Телефон покупателя<input id="smartBuyerPhone"></label></div></div>
    <div id="smartRecommendations" class="smart-recommendations"></div>
    <div class="smart-actions"><button id="btnSmartApply" class="green" type="button">Применить и сформировать</button><button id="btnSmartDetails" class="light" type="button">Показать подробные поля</button><button id="btnSmartReset" class="light" type="button">Сбросить</button></div>
  `;
}
function ensureIntake() {
  if (get('smartDealIntake')) return;
  const panel = leftPanel();
  if (!panel) return;
  const box = document.createElement('section');
  box.id = 'smartDealIntake';
  box.className = 'smart-intake';
  box.innerHTML = renderHtml();
  panel.insertBefore(box, panel.firstChild);
  bind();
  applyStateToForm();
  refreshButtons();
  renderRecommendations();
}
function bind() {
  document.querySelectorAll('[data-smart-key]').forEach((btn) => btn.onclick = () => {
    state[btn.dataset.smartKey] = btn.dataset.smartValue;
    saveState(); refreshButtons(); applyStateToForm(); renderRecommendations();
  });
  document.querySelectorAll('[data-smart-feature]').forEach((btn) => btn.onclick = () => {
    const id = btn.dataset.smartFeature;
    state.features = state.features.includes(id) ? state.features.filter((x) => x !== id) : [...state.features, id];
    saveState(); refreshButtons(); applyStateToForm(); renderRecommendations();
  });
  ['smartAddress','smartPriceFact','smartSellerPhone','smartBuyerPhone'].forEach((id) => get(id)?.addEventListener('input', applyStateToForm));
  get('btnSmartApply').onclick = () => { applyStateToForm(); get('btnGenerate')?.click(); document.querySelector('[data-tab="now"]')?.click(); };
  get('btnSmartDetails').onclick = () => { state.mode = state.mode === 'simple' ? 'details' : 'simple'; saveState(); applyMode(); };
  get('btnSmartReset').onclick = () => { localStorage.removeItem('smart_goal'); localStorage.removeItem('smart_representation'); localStorage.removeItem('smart_object_group'); localStorage.removeItem('smart_calculation'); localStorage.removeItem('smart_features'); localStorage.removeItem('smart_flow_mode'); location.reload(); };
}
function saveState() {
  localStorage.setItem('smart_goal', state.goal);
  localStorage.setItem('smart_representation', state.representation);
  localStorage.setItem('smart_object_group', state.objectGroup);
  localStorage.setItem('smart_calculation', state.calculation);
  localStorage.setItem('smart_features', JSON.stringify(state.features));
  localStorage.setItem('smart_flow_mode', state.mode);
}
function refreshButtons() {
  document.querySelectorAll('[data-smart-key]').forEach((btn) => btn.classList.toggle('active', state[btn.dataset.smartKey] === btn.dataset.smartValue));
  document.querySelectorAll('[data-smart-feature]').forEach((btn) => btn.classList.toggle('active', state.features.includes(btn.dataset.smartFeature)));
}
function applyMode() {
  document.body.dataset.smartFlow = state.mode;
  get('smartModeNote').textContent = state.mode === 'simple' ? 'Режим: простой' : 'Режим: подробно';
  get('btnSmartDetails').textContent = state.mode === 'simple' ? 'Показать подробные поля' : 'Скрыть подробные поля';
}
function repValues() {
  if (state.representation === 'seller_only') return { seller: 'our_spn', buyer: 'client_self' };
  if (state.representation === 'buyer_only') return { seller: 'client_self', buyer: 'our_spn' };
  if (state.representation === 'external_agency') return { seller: 'external_agency', buyer: 'our_spn' };
  return { seller: 'our_spn', buyer: 'our_spn' };
}
function applyStateToForm() {
  applyMode();
  setValue('stage', state.goal === 'deal' ? 'Сделка назначена' : state.goal === 'deposit' ? 'Задаток планируется' : 'Первичная подготовка до задатка');
  setValue('representationModel', state.representation);
  const rep = repValues(); setValue('sellerRepresentation', rep.seller); setValue('buyerRepresentation', rep.buyer);
  setValue('objectType', objectTypeText());
  setValue('rightForm', state.objectGroup === 'share' ? 'Доля в праве на квартиру' : 'Весь объект целиком');
  setValue('bankType', state.calculation === 'sber' ? 'Сбер / Домклик' : state.calculation === 'mortgage' ? 'Другой банк' : state.calculation === 'cash' ? 'Наличный / безналичный расчет без банка' : 'Не выбран / не требуется');
  setCheckedValues('payments', state.calculation === 'sber' ? ['mortgage','safe'] : state.calculation === 'mortgage' || state.goal === 'mortgage' ? ['mortgage'] : state.calculation === 'mixed' ? ['cash','mortgage'] : ['cash']);
  setCheckedValues('certificates', state.calculation === 'certificates' ? ['maternity'] : []);
  const f = { minor_owner:'minor', power_of_attorney:'proxy', registered_people:'registered', price_mismatch:'price_mismatch', inheritance_recent:'inheritance', encumbrance:'encumbrance', alternative:'alternative', no_boundaries:'no_boundaries' };
  setCheckedValues('flags', state.features.map((x) => f[x]).filter(Boolean));
  if (get('smartAddress')?.value) setValue('address', get('smartAddress').value);
  if (get('smartPriceFact')?.value) { setValue('priceFact', get('smartPriceFact').value); setValue('priceContract', get('smartPriceFact').value); }
  if (get('smartSellerPhone')?.value) setValue('sellerPhone', get('smartSellerPhone').value);
  if (get('smartBuyerPhone')?.value) setValue('buyerPhone', get('smartBuyerPhone').value);
  const seller = document.querySelector('[data-smart-field="sellerPhone"]');
  const buyer = document.querySelector('[data-smart-field="buyerPhone"]');
  if (seller) seller.hidden = rep.seller !== 'our_spn' && state.representation !== 'external_agency';
  if (buyer) buyer.hidden = rep.buyer !== 'our_spn';
}
function objectTypeText() {
  if (state.objectGroup === 'private_flat') return 'Квартира в частном секторе / часть дома по документам квартира';
  if (state.objectGroup === 'house_land') return 'Жилой дом + земельный участок';
  if (state.objectGroup === 'land') return 'Земельный участок без дома';
  if (state.objectGroup === 'new_building') return 'Новостройка / ДДУ';
  return 'Квартира в многоквартирном доме';
}
function renderRecommendations() {
  const rec = ['Главная цель — быстро понять, можно ли брать задаток сейчас, или сначала нужно закрыть риск.'];
  if (state.representation === 'seller_only') rec.push('Мы отвечаем за продавца: фокус на праве собственности, ЕГРН, зарегистрированных, обременениях и освобождении.');
  if (state.representation === 'buyer_only') rec.push('Мы отвечаем за покупателя: фокус на проверке объекта, деньгах, банке и безопасном расчете.');
  if (state.representation === 'both_sides_two_spn') rec.push('Два СПН: сразу договоритесь, кто собирает документы продавца, кто покупателя, кто передает карточку юристу.');
  if (state.representation === 'both_sides_one_spn') rec.push('Один СПН на обе стороны: фиксируйте договоренности особенно подробно, чтобы не было недопонимания.');
  if (state.representation === 'external_agency') rec.push('Другое агентство: зафиксируйте контакт и кто отвечает за документы второй стороны.');
  if (state.objectGroup === 'house_land') rec.push('Дом + земля: нужны кадастровые номера дома и участка, проверка границ в НСПД, ВРИ и требований банка.');
  if (state.objectGroup === 'private_flat') rec.push('Квартира в частном секторе: заранее проверить пригодность для ипотеки и материнского капитала.');
  if (state.objectGroup === 'share') rec.push('Доля: до задатка проверить нотариуса, преимущественное право покупки и возможность ипотеки.');
  if (state.calculation === 'mortgage' || state.calculation === 'sber' || state.goal === 'mortgage') rec.push('Ипотека: сканы — отдельными файлами; для ЕГРН нужны PDF + XML + SIG/архив с ЭЦП.');
  if (state.calculation === 'certificates') rec.push('Сертификаты: уточните остаток, сроки перечисления, требования к объекту и получателю денег.');
  if (state.features.length) rec.push('Есть особенности: лучше передать юристу карточку до задатка.');
  get('smartRecommendations').innerHTML = `<h3>Подсказки СПН</h3><ul>${rec.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
}
function start() { loadStylesheet(); ensureIntake(); applyMode(); }
let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (leftPanel() && get('mode') && get('objectType') && get('paymentsBox')) { clearInterval(timer); start(); }
  if (attempts > 60) clearInterval(timer);
}, 200);
