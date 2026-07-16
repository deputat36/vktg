const DRAFT_KEY = 'nav_deal_draft_v2';
let scheduled = false;
let observerStarted = false;

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function paymentSet() {
  const draft = readDraft();
  return new Set(Array.isArray(draft.payments) ? draft.payments : []);
}

function scopeMessage(payments) {
  const hasMortgage = payments.has('mortgage') || payments.has('militaryMortgage');
  const hasMatcapOrCertificate = payments.has('matcap') || payments.has('certificate');

  if (hasMortgage && hasMatcapOrCertificate) {
    return 'Ипотечный брокер нужен для консультации, подбора программы и одобрения. Маткапитал, сертификат и оформление сделки ведут СПН и юрист.';
  }
  if (hasMortgage) {
    return 'Ипотечный брокер нужен для консультации, подбора программы, одобрения и обучения СПН. Подготовку и оформление сделки ведут СПН и юрист.';
  }
  if (hasMatcapOrCertificate) {
    return 'Маткапитал и сертификаты ведут СПН и юрист. Ипотечный брокер не подключается, если ипотеки нет.';
  }
  return '';
}

function replaceLegacyText(root, message) {
  if (!message) return;
  const replacements = [
    'Есть ипотека, маткапитал или сертификат — подключить брокера.',
    'Ипотека, сертификат или маткапитал — подключить брокера.',
    'ипотека, сертификат или маткапитал — подключить брокера',
    'Есть ипотека, маткапитал или сертификат — подключить брокера'
  ];

  root.querySelectorAll('*').forEach((node) => {
    if (node.children.length) return;
    const original = node.textContent || '';
    let next = original;
    replacements.forEach((value) => { next = next.replace(value, message); });
    if (next !== original) node.textContent = next;
  });

  root.querySelectorAll('pre').forEach((node) => {
    const payments = paymentSet();
    const hasMortgage = payments.has('mortgage') || payments.has('militaryMortgage');
    if (!hasMortgage) {
      node.textContent = (node.textContent || '')
        .replace(/Кого подключить:\s*брокер(,\s*)?/gi, 'Кого подключить: СПН и юрист$1');
    }
  });
}

function correctSpecialistChips(root, payments, message) {
  const hasMortgage = payments.has('mortgage') || payments.has('militaryMortgage');
  const hasLegalFunds = payments.has('matcap') || payments.has('certificate');

  if (!hasMortgage) {
    root.querySelectorAll('.pill').forEach((pill) => {
      if ((pill.textContent || '').trim().toLowerCase() !== 'брокер') return;
      const section = pill.closest('.card, section, details');
      const heading = section?.querySelector('h2, h3, h4, summary')?.textContent || '';
      if (/кого подключить|специалист|маршрут/i.test(heading)) pill.remove();
    });
  }

  if (!hasLegalFunds || !message) return;
  const sections = [...root.querySelectorAll('.card, section, details')];
  const target = sections.find((section) => /кого подключить|маршрут по деньгам/i.test(section.querySelector('h2, h3, h4, summary')?.textContent || ''));
  if (!target || target.querySelector('[data-broker-scope-correction]')) return;
  const note = document.createElement('div');
  note.className = 'status warn';
  note.dataset.brokerScopeCorrection = 'true';
  note.style.marginTop = '8px';
  note.textContent = message;
  target.appendChild(note);
}

function apply() {
  const root = document.getElementById('app');
  if (!root) return;
  const payments = paymentSet();
  const message = scopeMessage(payments);
  replaceLegacyText(root, message);
  correctSpecialistChips(root, payments, message);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    apply();
  }, 60);
}

function startObserver() {
  if (observerStarted) return;
  const root = document.getElementById('app');
  if (!root) return;
  observerStarted = true;
  new MutationObserver(schedule).observe(root, { childList: true, subtree: true, characterData: true });
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  startObserver();
  apply();
  if (observerStarted && attempts >= 10) clearInterval(timer);
  if (attempts >= 40) clearInterval(timer);
}, 150);

document.addEventListener('click', schedule, true);
document.addEventListener('input', schedule, true);
window.addEventListener('storage', schedule);
