const DRAFT_KEY = 'nav_deal_draft_v2';
const CHECKLIST_URL = './spn-v2-checklist.html?test=20260617-90';
let scheduled = false;
let observerStarted = false;

const TITLES = {
  simple_flat: 'простая квартира',
  house_land: 'дом с участком',
  share_house: 'доля / часть дома',
  matcap_minor: 'маткапитал / ребёнок-покупатель',
  post_registration: 'расчёт после регистрации'
};

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function clearTestDraft() {
  const draft = readDraft();
  if (draft.createdFromChecklist || draft.testScenario) {
    localStorage.removeItem(DRAFT_KEY);
  }
  window.location.href = './spn-v2.html?test=20260617-90';
}

function bannerHtml(draft) {
  const title = TITLES[draft.testScenario] || draft.testScenario || 'тестовый сценарий';
  return `<section class="card" id="spnTestModeBanner" style="border:1px solid rgba(245,158,11,.45);background:rgba(245,158,11,.08)">
    <div class="section-title">
      <div>
        <span class="pill yellow">Тестовый режим</span>
        <h2 style="margin:8px 0 4px">Открыт сценарий проверки: ${esc(title)}</h2>
        <p class="muted" style="margin:0">Это черновик из страницы проверки мастера. Перед созданием реальной сделки очистите тестовый черновик.</p>
      </div>
      <div class="actions" style="justify-content:flex-start">
        <a class="btn light" href="${CHECKLIST_URL}">К проверке</a>
        <button class="btn primary" type="button" data-clear-test-draft="1">Очистить тест</button>
      </div>
    </div>
  </section>`;
}

function apply() {
  const draft = readDraft();
  const existing = document.getElementById('spnTestModeBanner');
  if (!draft.createdFromChecklist && !draft.testScenario) {
    if (existing) existing.remove();
    return;
  }

  const appShell = document.querySelector('#app .nav-v2-shell');
  if (!appShell) return;

  if (existing) return;
  appShell.insertAdjacentHTML('afterbegin', bannerHtml(draft));
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    apply();
  }, 80);
}

function startObserver() {
  if (observerStarted) return;
  const host = document.getElementById('app');
  if (!host) return;
  observerStarted = true;
  const observer = new MutationObserver(() => schedule());
  observer.observe(host, { childList: true, subtree: true });
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  startObserver();
  apply();
  if (observerStarted && attempts >= 10) clearInterval(timer);
  if (attempts >= 40) clearInterval(timer);
}, 150);

document.addEventListener('click', (event) => {
  const clearButton = event.target.closest('[data-clear-test-draft]');
  if (!clearButton) {
    schedule();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  clearTestDraft();
}, true);

window.addEventListener('storage', schedule);
