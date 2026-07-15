const FORBIDDEN_DIRECT_KEYS = Object.freeze([
  'sellerName',
  'seller_name',
  'sellerFullName',
  'seller_fio',
  'sellerPhone',
  'seller_phone',
  'buyerName',
  'buyer_name',
  'buyerFullName',
  'buyer_fio',
  'buyerPhone',
  'buyer_phone',
  'clientEmail',
  'client_email'
]);

const LEGACY_HANDOFF_PREFIXES = Object.freeze([
  'Заголовок сделки:',
  'ФИО продавца:',
  'ФИО покупателя:',
  'Телефон продавца:',
  'Телефон покупателя:'
]);

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cloneJson(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return {}; }
}

function stripLegacyHandoffLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .filter((line) => !LEGACY_HANDOFF_PREFIXES.some((prefix) => line.trim().startsWith(prefix)))
    .join('\n')
    .trim();
}

export function clientDirectIdentifierKeys() {
  return [...FORBIDDEN_DIRECT_KEYS];
}

export function sanitizeClientDeal(input) {
  const deal = cloneJson(plainObject(input));
  FORBIDDEN_DIRECT_KEYS.forEach((key) => { delete deal[key]; });

  if (plainObject(deal.spn_final) === deal.spn_final) {
    const handoff = stripLegacyHandoffLines(deal.spn_final.handoff_text);
    deal.spn_final = { ...deal.spn_final };
    if (handoff) deal.spn_final.handoff_text = handoff;
    else delete deal.spn_final.handoff_text;
  }

  return deal;
}

export function sanitizeWizardResult(input) {
  const result = cloneJson(plainObject(input));
  result.deal = sanitizeClientDeal(result.deal);
  return result;
}

export function neutralObjectLabel(deal = {}) {
  const type = String(deal.objectType || deal.object_type || '').trim();
  return ({
    flat_mkd: 'Квартира в МКД',
    flat_ground: 'Квартира на земле',
    room: 'Комната',
    share: 'Доля',
    house_land: 'Дом с участком',
    house: 'Дом',
    land: 'Земельный участок',
    new_building: 'Новостройка',
    commercial: 'Коммерческий объект'
  })[type] || 'Объект';
}

export function neutralDealTitle(deal = {}) {
  const address = String(deal.address || '').trim();
  return `${neutralObjectLabel(deal)} — ${address || 'ориентир уточняется'}`;
}

export function hasDirectClientIdentifiers(input) {
  const deal = plainObject(input);
  return FORBIDDEN_DIRECT_KEYS.some((key) => String(deal[key] || '').trim());
}
