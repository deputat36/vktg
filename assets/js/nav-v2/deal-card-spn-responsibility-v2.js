const BOX_ID = 'dealCardSpnResponsibilityV2';
let lastKey = '';

function text(value) {
  return String(value || '').trim();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function nameOf(person) {
  return text(person?.name) || text(person?.email) || '';
}

function target() {
  const main = document.querySelector('#app main.nav-v2-shell') || document.querySelector('#app main');
  if (!main) return null;
  return main.querySelector('#dealResponsibilitySnapshotV2') || main.querySelector('.tabs') || main.querySelector('.card') || main;
}

function line(title, value, ok) {
  const cls = ok ? 'status ok' : 'status warn';
  return `<div class="${cls}"><b>${escapeHtml(title)}:</b> ${escapeHtml(value || 'не назначен')}</div>`;
}

export function renderDealCardSpnResponsibility(snapshot) {
  const place = target();
  if (!place) return false;

  const seller = nameOf(snapshot?.seller_spn);
  const buyer = nameOf(snapshot?.buyer_spn);
  const manager = nameOf(snapshot?.manager);
  const key = JSON.stringify({ seller, buyer, manager });
  if (key === lastKey && document.getElementById(BOX_ID)) return true;
  lastKey = key;

  let box = document.getElementById(BOX_ID);
  if (!box) {
    box = document.createElement('section');
    box.id = BOX_ID;
    box.className = 'card';
    box.style.margin = '14px 0';
    place.after(box);
  }

  const sameSpn = seller && buyer && seller === buyer;
  box.innerHTML = `<h2>СПН по сделке</h2>
    <p class="muted">Короткая видимость для руководителя, юриста и команды: кто ведёт продавца и покупателя.</p>
    ${sameSpn ? line('СПН сделки', `${seller} ведёт продавца и покупателя`, true) : `${line('СПН продавца', seller, Boolean(seller))}${line('СПН покупателя', buyer, Boolean(buyer))}`}
    ${manager ? line('Менеджер', manager, true) : ''}`;
  return true;
}
