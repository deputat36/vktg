import { rpc, esc } from './supabase-v2.js';

const dealId = new URLSearchParams(location.search).get('id');
let cardData = null;
let loaded = false;
let queued = false;

function snapshotDeal() {
  return cardData?.deal?.wizard_snapshot?.deal || {};
}

function spnFinal() {
  return snapshotDeal().spn_final || {};
}

function readinessLocal() {
  return snapshotDeal().readiness_local || {};
}

function clean(value) {
  return String(value || '').trim();
}

function arrayOf(value) {
  return Array.isArray(value) ? value.filter((item) => clean(item)) : [];
}

function findInsertTarget() {
  const handoffHeading = [...document.querySelectorAll('section.card h2')]
    .find((node) => node.textContent.trim() === 'Перед передачей юристу');
  const handoffPanel = handoffHeading?.closest?.('section.card');
  if (handoffPanel) return { mode: 'after', node: handoffPanel };

  const hero = document.querySelector('.nav-v2-shell .hero');
  if (hero) return { mode: 'after', node: hero };

  const shell = document.querySelector('.nav-v2-shell');
  if (shell) return { mode: 'prepend', node: shell };
  return null;
}

function buildList(title, items, cls = 'yellow') {
  if (!items.length) return '';
  return `<div>
    <h4>${esc(title)}</h4>
    <div class="list">${items.slice(0, 8).map((item) => `<div class="list-item"><span class="pill ${cls}">${esc(item)}</span></div>`).join('')}</div>
  </div>`;
}

function blockHtml() {
  const final = spnFinal();
  const readiness = readinessLocal();
  const handoffText = clean(final.handoff_text);
  const nextStep = clean(final.next_step || snapshotDeal().clientNextStep);
  const comment = clean(final.comment || snapshotDeal().spnFinalComment || snapshotDeal().riskComment);
  const missing = arrayOf(readiness.missing);
  const blockers = arrayOf(readiness.blockers);
  const notes = arrayOf(readiness.notes);
  const readinessCard = Number(readiness.card || 0);

  if (!handoffText && !nextStep && !comment && !missing.length && !blockers.length && !notes.length) return '';

  return `<section class="card" data-spn-handoff-snapshot="true" style="border:2px solid rgba(59,130,246,.18)">
    <div class="section-title">
      <div>
        <h2>Текст передачи СПН</h2>
        <p class="muted">Это итог, который СПН сформировал в мастере при создании сделки.</p>
      </div>
      ${readinessCard ? `<span class="pill ${readinessCard >= 80 ? 'green' : readinessCard >= 60 ? 'yellow' : 'red'}">готовность ${esc(readinessCard)}%</span>` : ''}
    </div>
    ${nextStep ? `<div class="status"><b>Ближайший шаг:</b> ${esc(nextStep)}</div>` : ''}
    ${comment ? `<p><b>Комментарий СПН:</b> ${esc(comment)}</p>` : ''}
    ${handoffText ? `<div class="field"><label>Готовый текст передачи</label><textarea readonly style="min-height:220px">${esc(handoffText)}</textarea></div>
      <div class="actions" style="justify-content:flex-start"><button class="btn light" type="button" data-copy-spn-handoff="1">Скопировать текст</button></div>` : ''}
    <div class="side-by-side">
      ${buildList('Не хватает', missing, 'yellow')}
      ${buildList('Стоп-факторы', blockers, 'red')}
    </div>
    ${buildList('Замечания', notes, 'blue')}
  </section>`;
}

function bindCopy() {
  const button = document.querySelector('[data-copy-spn-handoff]');
  if (!button || button.dataset.bound === '1') return;
  button.dataset.bound = '1';
  button.addEventListener('click', () => {
    const text = clean(spnFinal().handoff_text);
    const area = document.querySelector('[data-spn-handoff-snapshot] textarea');
    navigator.clipboard?.writeText(text).then(() => {
      button.textContent = 'Скопировано';
      setTimeout(() => { button.textContent = 'Скопировать текст'; }, 1600);
    }, () => {
      area?.focus();
      area?.select();
      button.textContent = 'Выделено для копирования';
    });
  });
}

function render() {
  if (!loaded) return;
  const existing = document.querySelector('[data-spn-handoff-snapshot]');
  const html = blockHtml();
  if (!html) {
    existing?.remove();
    return;
  }

  if (existing) {
    existing.outerHTML = html;
    bindCopy();
    return;
  }

  const target = findInsertTarget();
  if (!target) return;
  if (target.mode === 'after') target.node.insertAdjacentHTML('afterend', html);
  else target.node.insertAdjacentHTML('afterbegin', html);
  bindCopy();
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    render();
  });
}

async function loadData() {
  if (!dealId) return;
  try {
    cardData = await rpc('nav_v2_get_deal_card', { p_deal_id: dealId }, 12000);
    loaded = true;
    render();
  } catch (_) {
    loaded = false;
  }
}

const app = document.getElementById('app') || document.body;
new MutationObserver(schedule).observe(app, { childList: true, subtree: true });

loadData();
window.addEventListener('hashchange', schedule);
