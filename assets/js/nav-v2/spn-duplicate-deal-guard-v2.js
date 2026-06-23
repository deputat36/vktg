import { rpc, esc } from './supabase-v2.js';

const DRAFT_KEY = 'nav_deal_draft_v2';
const CONFIRMED_KEY = 'nav_spn_duplicate_confirmed_at_v2';
const CONFIRMED_DUP_KEY = 'nav_spn_duplicate_confirmed_key_v2';
const ADDRESS_STOP_WORDS = new Set([
  'ул', 'улица', 'пер', 'переулок', 'пр', 'проспект', 'пркт', 'пл', 'площадь', 'ш', 'шоссе',
  'д', 'дом', 'к', 'корп', 'корпус', 'стр', 'строение', 'кв', 'квартира', 'пом', 'помещение'
]);

let deals = [];
let profile = null;
let loaded = false;
let loadStarted = false;
let renderQueued = false;
let lastMatches = [];
let lastDraftKey = '';

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function addressSignature(value) {
  return normalize(value)
    .split(' ')
    .map((part) => part.replace(/^0+(\d)/, '$1'))
    .filter((part) => part && !ADDRESS_STOP_WORDS.has(part))
    .join(' ');
}

function shortId(id) {
  return String(id || '').slice(0, 8).toUpperCase();
}

function objectName(type) {
  return ({
    flat_mkd: 'квартира в МКД',
    flat_ground: 'квартира на земле',
    room: 'комната',
    share: 'доля',
    share_room: 'доля / комната',
    house_land: 'дом с участком',
    house: 'дом',
    land: 'земельный участок',
    new_building: 'новостройка',
    commercial: 'коммерция'
  })[type] || type || 'объект';
}

function draftAddress(draft) {
  return addressSignature(draft.address);
}

function draftObjectType(draft) {
  return String(draft.objectType || '').trim();
}

function draftDuplicateKey(draft, matches) {
  return JSON.stringify({
    address: draftAddress(draft),
    objectType: draftObjectType(draft),
    matches: matches.map((deal) => ({ id: deal.id, exactObject: Boolean(deal.exactObject), address: addressSignature(deal.address) })).sort((a, b) => String(a.id).localeCompare(String(b.id)))
  });
}

function hasUsefulAddress(draft) {
  return draftAddress(draft).length >= 4 && draft.stage !== 'lead_only';
}

function hasFreshConfirmation(key) {
  const value = Number(sessionStorage.getItem(CONFIRMED_KEY) || 0);
  const confirmedKey = sessionStorage.getItem(CONFIRMED_DUP_KEY) || '';
  return value > 0 && Date.now() - value < 30000 && confirmedKey === key;
}

function markConfirmed(key) {
  sessionStorage.setItem(CONFIRMED_KEY, String(Date.now()));
  sessionStorage.setItem(CONFIRMED_DUP_KEY, key);
}

function possibleDuplicates(draft) {
  const address = draftAddress(draft);
  const type = draftObjectType(draft);
  if (!loaded || profile?.role !== 'spn' || !hasUsefulAddress(draft)) return [];

  return deals
    .filter((deal) => addressSignature(deal.address) === address)
    .map((deal) => ({
      ...deal,
      exactObject: Boolean(type && String(deal.object_type || '') === type)
    }))
    .sort((a, b) => Number(b.exactObject) - Number(a.exactObject))
    .slice(0, 3);
}

function hostNode() {
  return document.getElementById('pageStatus') || document.getElementById('app');
}

function duplicateReason(draft, matches) {
  const exact = matches.some((deal) => deal.exactObject);
  const objectText = draftObjectType(draft) ? ` Тип объекта: ${objectName(draftObjectType(draft))}.` : '';
  return exact
    ? `Совпали адрес и тип объекта.${objectText}`
    : `Совпал адрес после приведения к единому виду.${objectText} Если это другой объект, проверьте квартиру, корпус или уточнение адреса.`;
}

function panelHtml(matches, key, draft) {
  const rows = matches.map((deal) => {
    const title = deal.display_title || deal.title || `${objectName(deal.object_type)} — ${deal.address || 'адрес уточняется'}`;
    const badge = deal.exactObject ? '<span class="pill red">адрес и объект совпадают</span>' : '<span class="pill yellow">адрес совпадает</span>';
    return `<li><a href="./deal-card-v2.html?id=${encodeURIComponent(deal.id)}" target="_blank" rel="noopener">${esc(title)}</a> <span class="small">ID ${esc(shortId(deal.id))}</span> ${badge}</li>`;
  }).join('');

  return `<div class="status warn" data-spn-duplicate-guard="true" data-duplicate-key="${esc(key)}" style="margin:10px 0">
    <b>Проверьте дубль перед сохранением.</b>
    <div style="margin-top:6px">${esc(duplicateReason(draft, matches))}</div>
    <ul style="margin:8px 0 0 18px;padding:0">${rows}</ul>
  </div>`;
}

function moveNearCurrentStatus(existing) {
  const host = hostNode();
  if (!host || !existing) return;
  if (host.nextElementSibling === existing) return;
  host.insertAdjacentElement('afterend', existing);
}

function renderPanel() {
  const existing = document.querySelector('[data-spn-duplicate-guard]');
  const draft = readDraft();
  const matches = possibleDuplicates(draft);
  const key = draftDuplicateKey(draft, matches);
  lastMatches = matches;
  lastDraftKey = key;

  if (!matches.length) {
    existing?.remove();
    return;
  }

  if (existing?.dataset.duplicateKey === key) {
    moveNearCurrentStatus(existing);
    return;
  }

  const html = panelHtml(matches, key, draft);
  if (existing) {
    existing.outerHTML = html;
    moveNearCurrentStatus(document.querySelector('[data-spn-duplicate-guard]'));
    return;
  }

  const host = hostNode();
  if (!host) return;
  host.insertAdjacentHTML('afterend', html);
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderPanel();
  });
}

async function loadDeals() {
  if (loadStarted) return;
  loadStarted = true;
  try {
    const data = await rpc('nav_v2_get_deals_list', { p_limit: 80 }, 12000);
    profile = data.profile || null;
    deals = data.items || [];
    loaded = true;
    renderPanel();
  } catch (_) {
    loaded = false;
  }
}

function saveButtonFromEvent(event) {
  return event.target?.closest?.('[data-action="save"]') || null;
}

function guardSave(event) {
  const button = saveButtonFromEvent(event);
  if (!button || button.disabled) return;

  const draft = readDraft();
  const matches = lastMatches.length ? lastMatches : possibleDuplicates(draft);
  const key = lastDraftKey || draftDuplicateKey(draft, matches);
  if (!matches.length || hasFreshConfirmation(key)) return;

  const message = `Похоже, сделка с таким адресом уже есть. ${duplicateReason(draft, matches)}\n\n${matches.map((deal, index) => `${index + 1}. ${deal.display_title || deal.title || deal.address || deal.id} (${shortId(deal.id)})`).join('\n')}\n\nСохранить новую карточку всё равно?`;
  if (confirm(message)) {
    markConfirmed(key);
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

document.addEventListener('input', () => { loadDeals(); scheduleRender(); }, true);
document.addEventListener('click', () => { loadDeals(); scheduleRender(); }, true);
document.addEventListener('pointerup', guardSave, true);
document.addEventListener('click', guardSave, true);

loadDeals();
scheduleRender();
