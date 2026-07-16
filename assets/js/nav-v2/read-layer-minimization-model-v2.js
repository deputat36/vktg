import { clientDirectIdentifierKeys } from './client-data-minimization-model-v2.js?v=20260715-01';

const EXTRA_DIRECT_IDENTIFIER_KEYS = Object.freeze([
  'seller_full_name',
  'buyer_full_name',
  'sellerEmail',
  'seller_email',
  'buyerEmail',
  'buyer_email',
  'sellerPassport',
  'seller_passport',
  'buyerPassport',
  'buyer_passport',
  'sellerSnils',
  'seller_snils',
  'buyerSnils',
  'buyer_snils'
]);

const DIRECT_IDENTIFIER_KEYS = new Set([
  ...clientDirectIdentifierKeys(),
  ...EXTRA_DIRECT_IDENTIFIER_KEYS
]);

const LEGACY_HANDOFF_PREFIXES = Object.freeze([
  'Заголовок сделки:',
  'ФИО продавца:',
  'ФИО покупателя:',
  'Телефон продавца:',
  'Телефон покупателя:'
]);

const WORK_ITEM_CONTEXTS = new Set(['tasks', 'documents', 'risks', 'comments', 'reviews', 'events', 'expenses']);
const WORK_ITEM_MARKERS = Object.freeze([
  'assigned_role',
  'assigned_to',
  'priority',
  'responsible_role',
  'required_for_deposit',
  'required_for_deal',
  'is_required',
  'blocks_deposit',
  'blocks_deal',
  'recommendation',
  'decision',
  'author_role',
  'visibility',
  'event_type'
]);

function clean(value) {
  return String(value ?? '').trim();
}

function cloneJson(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
}

export function shortDealId(value) {
  const id = clean(value);
  return id ? id.slice(0, 8).toUpperCase() : 'БЕЗ-КОДА';
}

export function neutralObjectTypeLabel(value) {
  const type = clean(value);
  return ({
    flat_mkd: 'Квартира в МКД',
    flat_ground: 'Квартира на земле',
    room: 'Комната',
    share: 'Доля',
    share_room: 'Доля / комната',
    house_land: 'Дом с участком',
    house: 'Дом',
    land: 'Земельный участок',
    new_building: 'Новостройка',
    commercial: 'Коммерческий объект'
  })[type] || 'Объект';
}

export function maskDealAddress(value) {
  const source = clean(value);
  if (!source) return '';
  return source
    .replace(/(?:,\s*|\s+)(?:кв(?:артира)?|оф(?:ис)?|пом(?:ещение)?|комн(?:ата)?|апарт(?:аменты)?)\.?\s*(?:№|#)?\s*[\p{L}\p{N}/-]+.*$/iu, '')
    .replace(/[\s,;.-]+$/u, '')
    .trim();
}

function isDemoDealRecord(deal = {}) {
  return deal?.deal_summary?.demo === true
    || deal?.wizard_snapshot?.demo === true
    || clean(deal.title).startsWith('ДЕМО:')
    || clean(deal.display_title).startsWith('ДЕМО:');
}

export function neutralDealReference(deal = {}) {
  const id = deal.id || deal.deal_id || deal.dealId;
  const code = shortDealId(id);
  const type = clean(deal.object_type || deal.objectType);
  const address = maskDealAddress(deal.address || deal.object_address || deal.objectAddress);
  const prefix = isDemoDealRecord(deal) ? 'ДЕМО: ' : '';
  if (!type && !address) return `${prefix}Сделка · ${code}`;
  return `${prefix}${neutralObjectTypeLabel(type)} — ${address || 'ориентир уточняется'} · ${code}`;
}

function stripLegacyHandoffLines(value) {
  return clean(value)
    .split(/\r?\n/u)
    .filter((line) => !LEGACY_HANDOFF_PREFIXES.some((prefix) => line.trim().startsWith(prefix)))
    .join('\n')
    .trim();
}

function looksLikeDealRecord(value, contextKey = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (contextKey === 'deal') return true;
  if (WORK_ITEM_CONTEXTS.has(contextKey)) return false;
  const hasIdentity = Boolean(value.id || value.deal_id || value.dealId || value.card_url);
  if (!hasIdentity) return false;
  const explicitDealMarker = [
    'object_type',
    'display_title',
    'wizard_snapshot',
    'deal_summary',
    'readiness_deposit',
    'readiness_deal',
    'operational_readiness_percent',
    'card_url',
    'seller_spn_id',
    'buyer_spn_id',
    'lawyer_assignment_state',
    'broker_assignment_state',
    'blocking_risks_count',
    'missing_documents_count',
    'red_risks_count',
    'overdue_tasks_count'
  ].some((key) => Object.prototype.hasOwnProperty.call(value, key));
  if (explicitDealMarker) return true;
  const hasDealIdAndTitle = Boolean(value.deal_id || value.dealId)
    && Object.prototype.hasOwnProperty.call(value, 'title');
  const isWorkItem = WORK_ITEM_MARKERS.some((key) => Object.prototype.hasOwnProperty.call(value, key));
  return hasDealIdAndTitle && !isWorkItem;
}

function sanitizeValue(value, contextKey = '') {
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, contextKey));
  if (!value || typeof value !== 'object') {
    return contextKey === 'handoff_text' ? stripLegacyHandoffLines(value) : value;
  }

  const output = {};
  Object.entries(value).forEach(([key, child]) => {
    if (DIRECT_IDENTIFIER_KEYS.has(key)) return;
    output[key] = sanitizeValue(child, key);
  });

  const dealId = output.deal_id || output.dealId || output.id;
  if (dealId && Object.prototype.hasOwnProperty.call(output, 'deal_title')) {
    output.deal_title = neutralDealReference({ id: dealId, title: output.deal_title });
  }
  if (dealId && Object.prototype.hasOwnProperty.call(output, 'dealTitle')) {
    output.dealTitle = neutralDealReference({ id: dealId, title: output.dealTitle });
  }

  if (looksLikeDealRecord(output, contextKey)) {
    const reference = neutralDealReference(output);
    output.title = reference;
    output.display_title = reference;
    if (Object.prototype.hasOwnProperty.call(output, 'address')) {
      output.address = maskDealAddress(output.address);
    }
  }

  return output;
}

export function minimizeNavigatorReadPayload(value) {
  return sanitizeValue(cloneJson(value));
}

export function containsDirectClientIdentifiers(value) {
  if (Array.isArray(value)) return value.some(containsDirectClientIdentifiers);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => DIRECT_IDENTIFIER_KEYS.has(key) || containsDirectClientIdentifiers(child));
}
