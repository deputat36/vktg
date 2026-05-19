import { setCheckedValues } from '../ui/form.js';

const state = {
  goal: localStorage.getItem('smart_goal') || 'deposit',
  representation: localStorage.getItem('smart_representation') || 'both_sides_two_spn',
  objectGroup: localStorage.getItem('smart_object_group') || 'flat',
  ownerModel: localStorage.getItem('smart_owner_model') || 'one_adult',
  basis: JSON.parse(localStorage.getItem('smart_basis') || '["sale"]'),
  moneySources: JSON.parse(localStorage.getItem('smart_money_sources') || '["cash"]'),
  settlements: JSON.parse(localStorage.getItem('smart_settlements') || '["safe"]'),
  childRoles: JSON.parse(localStorage.getItem('smart_child_roles') || '[]'),
  features: JSON.parse(localStorage.getItem('smart_features') || '[]'),
  mode: localStorage.getItem('smart_flow_mode') || 'simple'
};

const goals = [
  ['deposit', 'Готовим задаток', 'Понять, можно ли брать деньги и что нужно до задатка.'],
  ['deal', 'Готовим сделку', 'Финальный пакет, регистрация, банк и сроки.'],
  ['check', 'Проверка до аванса', 'Быстро понять риски объекта и сторон.'],
  ['mortgage', 'Ипотечная сделка', 'Банк, оценка, Домклик, требования к объекту.']
];
const reps = [
  ['both_sides_two_spn', 'Два СПН', 'Продавец и покупатель у наших СПН.'],
  ['both_sides_one_spn', 'Один СПН на обе стороны', 'Один специалист ведет продавца и покупателя.'],
  ['seller_only', 'Мы за продавца', 'Покупатель сам или с другим агентством.'],
  ['buyer_only', 'Мы за покупателя', 'Продавец сам или с другим агентством.'],
  ['external_agency', 'Есть другое агентство', 'Одна из сторон через партнера/агента.']
];
const objects = [
  ['flat', 'Квартира в МКД', 'Обычная квартира.'],
  ['room', 'Комната', 'Комната/доля в коммунальной квартире.'],
  ['share', 'Доля', 'Доля в квартире, доме или земле.'],
  ['private_flat', 'Квартира в частном секторе', 'По документам квартира, но есть особенности.'],
  ['house_land', 'Дом + земля', 'Дом и участок как связка объектов.'],
  ['house_part', 'Часть дома', 'Часть жилого дома / доля / отдельный вход.'],
  ['land_izhs', 'Участок ИЖС/ЛПХ', 'Земля без дома или под строительство.'],
  ['land_snt', 'СНТ / садовый дом', 'Садовый дом, дача, участок СНТ.'],
  ['garage', 'Гараж / машиноместо', 'ГСК, гаражная амнистия, машиноместо.'],
  ['new_building', 'Новостройка / ДДУ', 'ДДУ, акт, застройщик.'],
  ['assignment', 'Уступка', 'Переуступка прав требования.'],
  ['commercial', 'Нежилое / коммерция', 'Нужна отдельная проверка условий.']
];
const ownerModels = [
  ['one_adult', 'Один взрослый собственник', 'Самый простой сценарий.'],
  ['several_adults', 'Несколько взрослых собственников', 'Нужны все собственники или доверенности.'],
  ['spouses', 'Супруги / совместное имущество', 'Проверить согласие супруга и режим собственности.'],
  ['minor_owner', 'Есть несовершеннолетний собственник', 'Опека и документы ребенка до задатка.'],
  ['inherited', 'Наследство / свежий переход права', 'Проверить срок, наследников, основание.'],
  ['unknown_owners', 'Собственники пока неясны', 'Сначала ЕГРН и документы основания.']
];
const basisItems = [
  ['sale', 'Купля-продажа'], ['gift', 'Дарение'], ['inheritLaw', 'Наследство по закону'], ['inheritWill', 'Наследство по завещанию'],
  ['privat', 'Приватизация'], ['ddu', 'ДДУ + акт'], ['assignment', 'Уступка'], ['court', 'Решение суда'],
  ['division', 'Раздел имущества / брачный договор'], ['admin', 'Постановление администрации'], ['landAct', 'Акт/свидетельство на землю'],
  ['garage', 'ГСК / гаражная амнистия'], ['technicalPlan', 'Оформление построенного дома'], ['extractOnly', 'Пока только ЕГРН'], ['other', 'Иное / неизвестно']
];
const moneyItems = [
  ['cash', 'Свои деньги наличными'], ['transfer', 'Свои деньги безналом'], ['mortgage', 'Ипотека'], ['matcap', 'Маткапитал'],
  ['regMatcap', 'Региональный маткапитал'], ['nominalChild', 'Детский номинальный счет'], ['svoChildAccount', 'Деньги/выплаты детей по СВО'],
  ['young', 'Молодая семья'], ['emergency', 'Переселение'], ['nis', 'НИС / военная ипотека'], ['largeFamily', 'Многодетная семья'],
  ['subsidy', 'Иная субсидия'], ['sellerMortgageClose', 'Гасим ипотеку продавца'], ['installment', 'Рассрочка'], ['counter', 'Встречные деньги']
];
const settlementItems = [
  ['safe', 'СБР'], ['accreditive', 'Аккредитив'], ['cell', 'Ячейка'], ['bankTransfer', 'Безнал по договору'],
  ['directAfter', 'Перевод после регистрации'], ['directBefore', 'Деньги до регистрации'], ['cashReceipt', 'Наличные под расписку'],
  ['pensionFund', 'Перечисление СФР'], ['municipal', 'Перечисление администрацией'], ['military', 'НИС / Росвоенипотека'],
  ['nominalPermission', 'С номинального счета по разрешению'], ['mixedStages', 'Несколько этапов'], ['unknown', 'Пока не согласовано']
];
const childItems = [
  ['minor_owner', 'Ребенок собственник'], ['minor_buyer', 'Ребенок будет покупателем/собственником'], ['minor_registered', 'Дети зарегистрированы'],
  ['matcap_history', 'Маткапитал был в истории объекта'], ['nominal_child_funds', 'Деньги с номинального счета ребенка'], ['svo_child_funds', 'Средства/выплаты на счетах детей по СВО']
];
const featureItems = [
  ['power_of_attorney', 'Доверенность'], ['price_mismatch', 'Цена в договоре отличается'], ['encumbrance', 'Обременение / арест'],
  ['alternative', 'Альтернатива / цепочка'], ['no_boundaries', 'Участок без межевания'], ['redevelopment', 'Перепланировка'],
  ['privat_refusers', 'Отказники от приватизации'], ['bankruptcy', 'Банкротство / долги'], ['residents_unknown', 'Неясно, кто зарегистрирован']
];

function get(id) { return document.getElementById(id); }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
function setValue(id, value) { const el = get(id); if (el) el.value = value ?? ''; }
function val(id) { return get(id)?.value || ''; }
function leftPanel() { return document.querySelector('aside.panel.left'); }
function labelBy(items, id) { return (items.find((x) => x[0] === id) || [id, id])[1]; }
function selectedLabels(items, selected) { return items.filter(([id]) => selected.includes(id)).map(([, title]) => title).join(', ') || 'не выбрано'; }
function loadStylesheet() {
  if (document.querySelector('link[href="./assets/css/smart-deal-intake.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/css/smart-deal-intake.css';
  document.head.appendChild(link);
}

function cards(key, items, active) {
  return items.map(([id, title, hint]) => `<button type="button" class="smart-card ${active === id ? 'active' : ''}" data-smart-key="${key}" data-smart-value="${id}"><b>${esc(title)}</b><small>${esc(hint)}</small></button>`).join('');
}
function chips(key, items, selected) {
  return items.map(([id, title]) => `<button type="button" class="smart-chip ${selected.includes(id) ? 'active' : ''}" data-smart-list="${key}" data-smart-value="${id}">${esc(title)}</button>`).join('');
}
function renderHtml() {
  return `
    <div class="smart-compact-row"><div><h2>🚀 Быстрое заполнение сделки</h2><p>Сначала выбираем суть сделки: что продаем, кто собственники, документы основания, деньги и порядок расчетов. Остальное появляется только при необходимости.</p></div><span class="smart-mode-note" id="smartModeNote">Режим: простой</span></div>
    <div class="smart-stage"><h3>1. Что готовим?</h3><div class="smart-cards">${cards('goal', goals, state.goal)}</div></div>
    <div class="smart-stage"><h3>2. Кого мы представляем?</h3><div class="smart-cards">${cards('representation', reps, state.representation)}</div></div>
    <div class="smart-stage"><h3>3. Что продаем по документам?</h3><div class="smart-cards">${cards('objectGroup', objects, state.objectGroup)}</div></div>
    <div class="smart-stage"><h3>4. Кто собственники?</h3><div class="smart-cards">${cards('ownerModel', ownerModels, state.ownerModel)}</div></div>
    <div class="smart-stage"><h3>5. Документы основания</h3><div class="smart-chips">${chips('basis', basisItems, state.basis)}</div></div>
    <div class="smart-stage"><h3>6. За какие средства покупают?</h3><div class="smart-chips">${chips('moneySources', moneyItems, state.moneySources)}</div></div>
    <div class="smart-stage"><h3>7. Какой порядок расчетов?</h3><div class="smart-chips">${chips('settlements', settlementItems, state.settlements)}</div></div>
    <div class="smart-stage"><h3>8. Дети в сделке</h3><div class="smart-chips">${chips('childRoles', childItems, state.childRoles)}</div></div>
    <div class="smart-stage"><h3>9. Дополнительные особенности</h3><div class="smart-chips">${chips('features', featureItems, state.features)}</div></div>
    <div class="smart-stage"><h3>10. Минимум данных</h3><div class="smart-fields"><label>Адрес объекта<input id="smartAddress" placeholder="Борисоглебск, адрес"></label><label>Цена<input id="smartPriceFact" placeholder="например: 3 500 000"></label><label class="smart-field" data-smart-field="sellerPhone">Телефон продавца<input id="smartSellerPhone"></label><label class="smart-field" data-smart-field="buyerPhone">Телефон покупателя<input id="smartBuyerPhone"></label></div></div>
    <div id="smartNeededDetails" class="smart-details"></div>
    <div id="smartRecommendations" class="smart-recommendations"></div>
    <div class="smart-actions"><button id="btnSmartApply" class="green" type="button">Применить и сформировать</button><button id="btnSmartDetails" class="light" type="button">Показать все поля</button><button id="btnSmartReset" class="light" type="button">Сбросить</button></div>
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
  syncFromExisting();
  applyStateToForm();
  refreshButtons();
  renderNeededDetails();
  renderRecommendations();
}
function bind() {
  document.querySelectorAll('[data-smart-key]').forEach((btn) => btn.onclick = () => {
    state[btn.dataset.smartKey] = btn.dataset.smartValue;
    normalizeState(); saveState(); refreshButtons(); applyStateToForm(); renderNeededDetails(); renderRecommendations();
  });
  document.querySelectorAll('[data-smart-list]').forEach((btn) => btn.onclick = () => {
    const key = btn.dataset.smartList;
    const id = btn.dataset.smartValue;
    state[key] = state[key].includes(id) ? state[key].filter((x) => x !== id) : [...state[key], id];
    normalizeState(); saveState(); refreshButtons(); applyStateToForm(); renderNeededDetails(); renderRecommendations();
  });
  ['smartAddress','smartPriceFact','smartSellerPhone','smartBuyerPhone'].forEach((id) => get(id)?.addEventListener('input', () => { applyStateToForm(); renderNeededDetails(); }));
  get('btnSmartApply').onclick = () => { applyStateToForm(); get('btnGenerate')?.click(); document.querySelector('[data-tab="now"]')?.click(); };
  get('btnSmartDetails').onclick = () => { state.mode = state.mode === 'simple' ? 'details' : 'simple'; saveState(); applyMode(); };
  get('btnSmartReset').onclick = () => ['smart_goal','smart_representation','smart_object_group','smart_owner_model','smart_basis','smart_money_sources','smart_settlements','smart_child_roles','smart_features','smart_flow_mode'].forEach((k) => localStorage.removeItem(k)) || location.reload();
}
function normalizeState() {
  if (!state.basis.length) state.basis = ['extractOnly'];
  if (!state.moneySources.length) state.moneySources = ['cash'];
  if (!state.settlements.length) state.settlements = ['unknown'];
  if (state.goal === 'mortgage' && !state.moneySources.includes('mortgage')) state.moneySources.push('mortgage');
  if (state.objectGroup === 'share' && !state.features.includes('shareDeal')) state.features.push('shareDeal');
  if (state.ownerModel === 'minor_owner' && !state.childRoles.includes('minor_owner')) state.childRoles.push('minor_owner');
  if (state.childRoles.includes('nominal_child_funds') && !state.moneySources.includes('nominalChild')) state.moneySources.push('nominalChild');
  if (state.childRoles.includes('svo_child_funds') && !state.moneySources.includes('svoChildAccount')) state.moneySources.push('svoChildAccount');
  if (state.moneySources.includes('matcap') && !state.childRoles.includes('minor_buyer')) state.childRoles.push('minor_buyer');
}
function saveState() {
  localStorage.setItem('smart_goal', state.goal);
  localStorage.setItem('smart_representation', state.representation);
  localStorage.setItem('smart_object_group', state.objectGroup);
  localStorage.setItem('smart_owner_model', state.ownerModel);
  localStorage.setItem('smart_basis', JSON.stringify(state.basis));
  localStorage.setItem('smart_money_sources', JSON.stringify(state.moneySources));
  localStorage.setItem('smart_settlements', JSON.stringify(state.settlements));
  localStorage.setItem('smart_child_roles', JSON.stringify(state.childRoles));
  localStorage.setItem('smart_features', JSON.stringify(state.features));
  localStorage.setItem('smart_flow_mode', state.mode);
}
function refreshButtons() {
  document.querySelectorAll('[data-smart-key]').forEach((btn) => btn.classList.toggle('active', state[btn.dataset.smartKey] === btn.dataset.smartValue));
  document.querySelectorAll('[data-smart-list]').forEach((btn) => btn.classList.toggle('active', state[btn.dataset.smartList].includes(btn.dataset.smartValue)));
}
function applyMode() {
  document.body.dataset.smartFlow = state.mode;
  get('smartModeNote').textContent = state.mode === 'simple' ? 'Режим: простой' : 'Режим: подробно';
  get('btnSmartDetails').textContent = state.mode === 'simple' ? 'Показать все поля' : 'Скрыть подробные поля';
}
function repValues() {
  if (state.representation === 'seller_only') return { seller: 'our_spn', buyer: 'client_self' };
  if (state.representation === 'buyer_only') return { seller: 'client_self', buyer: 'our_spn' };
  if (state.representation === 'external_agency') return { seller: 'external_agency', buyer: 'our_spn' };
  return { seller: 'our_spn', buyer: 'our_spn' };
}
function syncFromExisting() {
  if (val('address')) get('smartAddress').value = val('address');
  if (val('priceFact')) get('smartPriceFact').value = val('priceFact');
  if (val('sellerPhone')) get('smartSellerPhone').value = val('sellerPhone');
  if (val('buyerPhone')) get('smartBuyerPhone').value = val('buyerPhone');
}
function applyStateToForm() {
  applyMode();
  setValue('stage', state.goal === 'deal' ? 'Сделка назначена' : state.goal === 'deposit' ? 'Задаток планируется' : 'Первичная подготовка до задатка');
  setValue('representationModel', state.representation);
  const rep = repValues(); setValue('sellerRepresentation', rep.seller); setValue('buyerRepresentation', rep.buyer);
  setValue('objectType', objectTypeText());
  setValue('rightForm', rightFormText());
  setValue('bankType', bankTypeText());
  setCheckedValues('basis', state.basis);
  setCheckedValues('payments', state.moneySources);
  setCheckedValues('settlements', state.settlements);
  setCheckedValues('certificates', certificateIds());
  setCheckedValues('flags', flagIds());
  if (get('smartAddress')?.value) setValue('address', get('smartAddress').value);
  if (get('smartPriceFact')?.value) { setValue('priceFact', get('smartPriceFact').value); if (!val('priceContract') || val('priceContract') === val('priceFact')) setValue('priceContract', get('smartPriceFact').value); }
  if (get('smartSellerPhone')?.value) setValue('sellerPhone', get('smartSellerPhone').value);
  if (get('smartBuyerPhone')?.value) setValue('buyerPhone', get('smartBuyerPhone').value);
  const seller = document.querySelector('[data-smart-field="sellerPhone"]');
  const buyer = document.querySelector('[data-smart-field="buyerPhone"]');
  if (seller) seller.hidden = rep.seller !== 'our_spn' && state.representation !== 'external_agency';
  if (buyer) buyer.hidden = rep.buyer !== 'our_spn';
}
function objectTypeText() {
  return {
    flat: 'Квартира в многоквартирном доме', room: 'Комната', share: 'Доля в объекте недвижимости', private_flat: 'Квартира в частном секторе / часть дома по документам квартира',
    house_land: 'Жилой дом + земельный участок', house_part: 'Часть жилого дома', land_izhs: 'Земельный участок ИЖС/ЛПХ', land_snt: 'Садовый дом / дача / СНТ',
    garage: 'Гараж / машиноместо', new_building: 'Новостройка / ДДУ', assignment: 'Уступка права требования', commercial: 'Нежилое / коммерческое помещение'
  }[state.objectGroup] || 'Квартира в многоквартирном доме';
}
function rightFormText() {
  if (state.objectGroup === 'share' || state.objectGroup === 'room' || state.objectGroup === 'house_part') return 'Доля в праве / часть объекта';
  return 'Весь объект целиком';
}
function bankTypeText() {
  if (state.moneySources.includes('mortgage') || state.goal === 'mortgage') return state.settlements.includes('safe') ? 'Сбер / Домклик' : 'Банк / ипотека';
  if (state.moneySources.includes('nis')) return 'НИС / военная ипотека';
  return 'Не выбран / не требуется';
}
function certificateIds() {
  return state.moneySources.filter((x) => ['matcap','regMatcap','young','emergency','nis','largeFamily','refugee','subsidy','nominalChild','svoChildAccount'].includes(x));
}
function flagIds() {
  const flags = [];
  const add = (flag) => { if (!flags.includes(flag)) flags.push(flag); };
  if (state.ownerModel === 'several_adults') add('shareDeal');
  if (state.ownerModel === 'spouses') add('spouse');
  if (state.ownerModel === 'minor_owner' || state.childRoles.includes('minor_owner')) add('minorSeller');
  if (state.childRoles.includes('minor_buyer')) add('minorBuyer');
  if (state.childRoles.includes('minor_registered')) add('minorRegistered');
  if (state.childRoles.includes('matcap_history')) add('matcapPast');
  if (state.objectGroup === 'share') add('shareDeal');
  if (state.objectGroup === 'private_flat') add('privateSectorFlat');
  if (['land_izhs','land_snt','house_land'].includes(state.objectGroup)) add('landBoundary');
  const map = { power_of_attorney:'power', price_mismatch:'price_mismatch', encumbrance:'encumbrance', alternative:'alternative', no_boundaries:'landBoundary', redevelopment:'redevelopment', privat_refusers:'privatRefusers', bankruptcy:'bankruptcy', residents_unknown:'registeredUnknown' };
  state.features.forEach((x) => map[x] && add(map[x]));
  return flags;
}
function needSeller() { return ['both_sides_two_spn','both_sides_one_spn','seller_only','external_agency'].includes(state.representation); }
function needBuyer() { return ['both_sides_two_spn','both_sides_one_spn','buyer_only'].includes(state.representation); }
function isBank() { return state.moneySources.includes('mortgage') || state.moneySources.includes('nis') || state.goal === 'mortgage'; }
function isLand() { return ['house_land','land_izhs','land_snt'].includes(state.objectGroup) || state.features.includes('no_boundaries'); }
function isHardObject() { return ['house_land','house_part','land_izhs','land_snt','share','room','private_flat','garage','new_building','assignment','commercial'].includes(state.objectGroup); }
function hasChildren() { return state.ownerModel === 'minor_owner' || state.childRoles.length || state.moneySources.includes('matcap') || state.moneySources.includes('nominalChild') || state.moneySources.includes('svoChildAccount'); }
function detailInput(id, title, hint = '', required = false, textarea = false) {
  const tag = textarea ? `<textarea data-sync-field="${id}">${esc(val(id))}</textarea>` : `<input data-sync-field="${id}" value="${esc(val(id))}">`;
  return `<label>${esc(title)} ${required ? '<span class="smart-required">важно</span>' : '<span class="smart-optional">если есть</span>'}${tag}${hint ? `<div class="smart-detail-help">${esc(hint)}</div>` : ''}</label>`;
}
function detailSelect(id, title, options, hint = '', required = false) {
  const current = val(id);
  return `<label>${esc(title)} ${required ? '<span class="smart-required">важно</span>' : '<span class="smart-optional">если есть</span>'}<select data-sync-field="${id}">${options.map((x) => `<option ${x === current ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>${hint ? `<div class="smart-detail-help">${esc(hint)}</div>` : ''}</label>`;
}
function renderNeededDetails() {
  const box = get('smartNeededDetails');
  if (!box) return;
  const groups = [];
  groups.push(`<div class="smart-detail-group critical"><h4>Стороны и ответственность</h4><div class="smart-detail-help">Нужно не для бюрократии, а чтобы юрист понимал, кому вернуть замечания.</div><div class="smart-detail-row">${needSeller() ? detailInput('sellerMainName','Продавец / основной собственник','ФИО или коротко: продавцов несколько',false) : ''}${needBuyer() ? detailInput('buyerMainName','Покупатель','ФИО или коротко: покупателей несколько',false) : ''}</div>${detailInput('teamComment','Кто что делает по сделке','Например: СПН продавца собирает документы, СПН покупателя ведет банк, задаток готовит ...',false,true)}</div>`);
  const objFields = [detailInput('cadObject','Кадастровый номер объекта','Если нет — можно позже, но юристу/банку понадобится.',isHardObject())];
  if (isLand()) objFields.push(detailInput('cadLand','Кадастровый номер земли','Для дома/участка обязателен. По нему проверяем границы в НСПД.',true));
  if (state.objectGroup === 'share') objFields.push(detailInput('sellerSideComment','Кто владеет остальными долями / ППП','Укажите, есть ли другие долевики и как будем соблюдать преимущественное право.',true,true));
  objFields.push(detailInput('releaseInfo','Освобождение / ключи','Когда выезжают, кто зарегистрирован, когда передача ключей.',false,true));
  groups.push(`<div class="smart-detail-group ${isHardObject()?'critical':''}"><h4>Объект: важные уточнения</h4><div class="smart-detail-row">${objFields.join('')}</div></div>`);
  const moneyFields = [detailInput('priceContract','Цена в договоре','Если отличается от фактической — обязательно объяснить причину.',state.features.includes('price_mismatch')), detailInput('priceComment','Комментарий по цене и расчетам','Завышение/занижение, сертификаты, ипотека, смешанный расчет.',state.features.includes('price_mismatch'),true)];
  if (isBank()) moneyFields.push(detailInput('bankInfo','Статус банка / Домклика','Одобрение, оценка, СБР, какие документы уже загружены.',true,true));
  groups.push(`<div class="smart-detail-group ${isBank()||state.features.includes('price_mismatch')?'critical':''}"><h4>Деньги и порядок расчетов</h4><div class="smart-detail-help">Источник денег и порядок расчетов — разные вещи. Например: маткапитал как источник + перечисление СФР как порядок расчетов.</div><div class="smart-detail-row">${moneyFields.join('')}</div></div>`);
  if (hasChildren()) groups.push(`<div class="smart-detail-group stop"><h4>Дети в сделке</h4><div class="smart-detail-help">Если участвуют дети, до задатка нужно передать юристу сценарий и документы. Это может потребовать опеку, СФР, банк или разрешение по номинальному счету.</div><div class="smart-detail-row">${detailInput('buyerSideComment','Данные по детям и средствам','ФИО/возраст детей, кто законный представитель, ребенок собственник/покупатель/зарегистрирован, какие средства используются.',true,true)}${detailInput('questions','Вопрос юристу по детям','Например: нужно ли разрешение опеки, как использовать номинальный счет, как выделять доли.',true,true)}</div></div>`);
  const docFields = [detailSelect('stEgrn','ЕГРН с ЭЦП',['не запрошено','запрошено','получено','проверено'],'Для банка/нотариуса нужен комплект PDF + XML + SIG/архив.',true), detailSelect('stRegistered','Справка о зарегистрированных',['не запрошено','запрошено','получено','проверено'],'Нужна почти всегда до задатка/сделки.',true), detailInput('folderLink','Ссылка на папку документов','Яндекс Диск: каждый документ отдельным файлом.',false)];
  groups.push(`<div class="smart-detail-group critical"><h4>Документы: минимум для юриста</h4><div class="smart-detail-row">${docFields.join('')}</div>${!hasChildren() ? detailInput('questions','Вопрос юристу','Сформулируйте коротко: что проверить, что смущает, какой дедлайн.',false,true) : ''}</div>`);
  box.innerHTML = `<div class="smart-details-head"><div><h3>11. Нужные уточнения по этой сделке</h3><p class="smart-detail-help">Здесь только поля, которые помогают быстрее понять риск, запрет или следующий шаг.</p></div><div class="smart-summary-strip"><span>${esc(labelBy(goals,state.goal))}</span><span>${esc(labelBy(objects,state.objectGroup))}</span><span>${esc(labelBy(ownerModels,state.ownerModel))}</span></div></div><div class="smart-details-grid">${groups.join('')}</div>`;
  box.querySelectorAll('[data-sync-field]').forEach((el) => {
    el.oninput = () => { setValue(el.dataset.syncField, el.value); renderRecommendations(); };
    el.onchange = () => { setValue(el.dataset.syncField, el.value); renderRecommendations(); };
  });
}
function renderRecommendations() {
  const rec = ['Главная цель — быстро понять, можно ли брать задаток сейчас, или сначала нужно закрыть риск.'];
  rec.push('Основа анализа: объект по документам, собственники, документы основания, источник денег и порядок расчетов.');
  if (state.ownerModel === 'minor_owner') rec.push('Есть несовершеннолетний собственник: до задатка нужна проверка юриста и, вероятно, органов опеки.');
  if (hasChildren()) rec.push('Дети в сделке: понадобятся документы ребенка и законного представителя; при детских деньгах порядок использования проверяет юрист до задатка.');
  if (state.moneySources.includes('matcap')) rec.push('Маткапитал: нужны сертификат/сведения об остатке, условия СФР и понимание, как будут выделяться доли детям.');
  if (state.moneySources.includes('nominalChild') || state.moneySources.includes('svoChildAccount')) rec.push('Детский номинальный счет / средства детей: это стоп-сценарий до проверки юриста и менеджера.');
  if (state.settlements.includes('directBefore') || state.settlements.includes('cashReceipt')) rec.push('Деньги до регистрации или наличные под расписку — рискованный порядок расчетов. Лучше согласовать безопасную схему.');
  if (isLand()) rec.push('Дом/земля/СНТ: нужны кадастровые номера и проверка границ участка в НСПД.');
  if (state.objectGroup === 'share') rec.push('Доля: до задатка проверить нотариуса, ППП и возможность ипотеки.');
  if (isBank()) rec.push('Ипотека: сканы отдельными файлами; для ЕГРН нужны PDF + XML + SIG/архив с ЭЦП.');
  if (state.basis.includes('extractOnly') || state.basis.includes('other')) rec.push('Основание неизвестно или только из ЕГРН: до задатка запросите сам документ основания.');
  get('smartRecommendations').innerHTML = `<h3>Подсказки СПН</h3><ul>${rec.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
}
function start() { loadStylesheet(); ensureIntake(); applyMode(); }
let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (leftPanel() && get('mode') && get('objectType') && get('paymentsBox')) { clearInterval(timer); start(); }
  if (attempts > 60) clearInterval(timer);
}, 200);
