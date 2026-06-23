import { rpc, esc } from './supabase-v2.js';

const DRAFT_KEY = 'nav_deal_draft_v2';
const CONFIRMED_KEY = 'nav_spn_duplicate_confirmed_at_v2';
const CONFIRMED_DUP_KEY = 'nav_spn_duplicate_confirmed_key_v2';

let deals = [];
let profile = null;
let loaded = false;
let loadStarted = false;
let renderQueued = false;
let lastMatches = [];

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
  return normalize(draft.address);
}

function draftObjectType(draft) {
  return String(draft.objectType || '').trim();
}

function hasUsefulAddress(draft) {
  return draftAddress(draft).length >= 6 && draft.stage !== 'lead_only';
}

function duplicateKey(matches) {
  return JSON.stringify(matches.map((deal) => deal.id).sort());
}

function hasFreshConfirmation(matches) {
  const value = Number(sessionStorage.getItem(CONFIRMED_KEY) || 0);
  const key = sessionStorage.getItem(CONFIRMED_DUP_KEY) || '';
  return value > 0 && Date.now() - value < 30000 && key === duplicateKey(matches);
}

function markConfirmed(matches) {
  sessionStorage.setItem(CONFIRMED_KEY, String(Date.now()));
  sessionStorage.setItem(CONFIRMED_DUP_KEY, duplicateKey(matches));
}

function possibleDuplicates(draft) {
  const address = draftAddress(draft);
  const type = draftObjectType(draft);
  if (!loaded || profile?.role !== 'spn' || !hasUsefulAddress(draft)) return [];

  return deals
    .filter((deal) => normalize(deal.address) === address)
    .map((deal) => ({
      ...deal,
      exactObject: type && String(deal.object_type || '') === type
    }))
    .sort((a, b) => Number(b.exactObject) - Number(a.exactObject))
    .slice(0, 3);
}

function hostNode() {
  return document.getElementById('pageStatus') || document.getElementById('app');
}

function panelHtml(matches) {
  const rows = matches.map((deal) => {
    const title = deal.display_title || deal.title || `${objectName(deal.object_type)} — ${deal.address || 'адрес уточняется'}`;
    const badge = deal.exactObject ? '<span class="pill red">адрес и объект совпадают</span>' : '<span class="pill yellow">адрес совпадает</span>';
    return `<li><a href="./deal-card-v2.html?id=${encodeURIComponent(deal.id)}" target="_blank" rel="noopener">${esc(title)}</a> <span class="small">ID ${esc(shortId(deal.id))}</span> ${badge}</li>`;
  }).join('');

  return `<div class="status warn" data-spn-duplicate-guard="true" style="margin:10px 0">
    <b>Проверьте дубль перед сохранением.</b>
    <div style="margin-top:6px">В ваших сделках уже есть карточка с таким адресом:</div>
    <ul style="margin:8px 0 0 18px;padding:0">${rows}</ul>
  </div>`;
}

function renderPanel() {
  const existing = document.querySelector('[data-spn-duplicate-guard]');
  const matches = possibleDuplicates(readDraft());
  lastMatches = matches;

  if (!matches.length) {
    existing?.remove();
    return;
  }

  const html = panelHtml(matches);
  const key = duplicateKey(matches);
  if (existing?.dataset.duplicateKey === key) return;

  if (existing) {
    existing.outerHTML = html.replace('data-spn-duplicate-guard="true"', `data-spn-duplicate-guard="true" data-duplicate-key="${esc(key)}"`);
    return;
  }

  const host = hostNode();
  if (!host) return;
  host.insertAdjacentHTML('afterend', html.replace('data-spn-duplicate-guard="true"', `data-spn-duplicate-guard="true" data-duplicate-key="${esc(key)}"`));
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

  const matches = lastMatches.length ? lastMatches : possibleDuplicates(readDraft());
  if (!matches.length || hasFreshConfirmation(matches)) return;

  const message = `Похоже, сделка с таким адресом уже есть:\n\n${matches.map((deal, index) => `${index + 1}. ${deal.display_title || deal.title || deal.address || deal.id} (${shortId(deal.id)})`).join('\n')}\n\nСохранить новую карточку всё равно?`;
  if (confirm(message)) {
    markConfirmed(matches);
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
