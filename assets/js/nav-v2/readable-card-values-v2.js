const ROLE_LABELS = {
  owner: 'владелец',
  admin: 'администратор',
  manager: 'менеджер',
  spn: 'СПН',
  lawyer: 'юрист',
  broker: 'брокер',
  viewer: 'наблюдатель'
};

const REPRESENTATION_LABELS = {
  seller: 'представляем продавца',
  buyer: 'представляем покупателя',
  both: 'представляем обе стороны',
  company: 'интерес компании',
  other_agency: 'партнерская сделка',
  external_party: 'внешняя сторона'
};

let queued = false;

function exactLabel(map, value) {
  const key = String(value || '').trim();
  return map[key] || null;
}

function replaceTextAfterLabel(item, text) {
  const label = item?.querySelector?.(':scope > b');
  if (!label) return;
  const rest = [...item.childNodes].filter((node) => node !== label);
  rest.forEach((node) => node.remove());
  item.append(document.createTextNode(text));
}

function normalizeRepresentation(item) {
  const label = item?.querySelector?.(':scope > b');
  if (!label || label.textContent.trim() !== 'Представительство') return;
  const current = [...item.childNodes]
    .filter((node) => node !== label)
    .map((node) => node.textContent || '')
    .join('')
    .trim();
  const readable = exactLabel(REPRESENTATION_LABELS, current);
  if (!readable) return;
  replaceTextAfterLabel(item, readable);
}

function normalizeRoleText(node) {
  if (!node || node.dataset.readableRoleReady === '1') return;
  const readable = exactLabel(ROLE_LABELS, node.textContent);
  if (!readable) return;
  node.textContent = readable;
  node.dataset.readableRoleReady = '1';
}

function applyReadableValues() {
  document.querySelectorAll('.list-item').forEach(normalizeRepresentation);
  document.querySelectorAll('.list-item > b, .pill').forEach(normalizeRoleText);
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    applyReadableValues();
  });
}

const app = document.getElementById('app') || document.body;
new MutationObserver(schedule).observe(app, { childList: true, subtree: true });

applyReadableValues();
window.addEventListener('hashchange', schedule);
