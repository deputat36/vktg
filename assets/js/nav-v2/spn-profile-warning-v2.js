import { getMyProfile, esc } from './supabase-v2.js';

let observerStarted = false;
let profile = null;

function missingProfileItems() {
  const items = [];
  if (!profile?.manager_id && !profile?.manager_name) items.push('не назначен менеджер');
  if (!profile?.phone) items.push('не указан телефон');
  return items;
}

function applyWarning() {
  if (profile?.role !== 'spn') return;
  const items = missingProfileItems();
  if (!items.length) return;
  if (document.getElementById('spnProfileWarning')) return;

  const hero = document.querySelector('.hero');
  if (!hero) return;
  hero.insertAdjacentHTML(
    'afterend',
    `<div id="spnProfileWarning" class="status warn">Профиль СПН заполнен не полностью: ${esc(items.join(', '))}. Это влияет на маршрутизацию сделки и контроль со стороны менеджера.</div>`
  );
}

async function init() {
  try {
    profile = await getMyProfile({ refresh: true, timeout: 8000 });
  } catch (_) {
    profile = null;
  }

  applyWarning();

  if (!observerStarted) {
    observerStarted = true;
    new MutationObserver(() => applyWarning()).observe(document.body, { childList: true, subtree: true });
  }
}

init();
