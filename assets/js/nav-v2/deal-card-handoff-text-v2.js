import { rpc, esc, getCachedUser } from './supabase-v2.js';

const dealId = new URLSearchParams(location.search).get('id');
let handoffText = '';
let loaded = false;

function readHandoffText(cardData) {
  const deal = cardData?.deal || {};
  const snapshot = deal.wizard_snapshot || {};
  return snapshot?.deal?.spn_final?.handoff_text
    || snapshot?.deal?.handoff_text
    || snapshot?.spn_final?.handoff_text
    || '';
}

function panelHtml(text) {
  return `<section id="handoffTextPanel" class="card" style="border:2px solid rgba(37,99,235,.16)">
    <div class="section-title">
      <div>
        <h2>Текст передачи юристу от СПН</h2>
        <p class="muted">Короткая выжимка из мастера: объект, стороны, деньги, расчеты, расходы, риски и пробелы. Ее удобно читать юристу и менеджеру перед проверкой.</p>
      </div>
      <span class="pill blue">сохранено из мастера</span>
    </div>
    <textarea id="cardHandoffText" readonly style="min-height:220px">${esc(text)}</textarea>
    <div class="actions" style="justify-content:flex-start">
      <button id="copyCardHandoffText" class="btn primary" type="button">Скопировать текст</button>
      <button class="btn light" data-tab-shortcut="comments" type="button">Открыть комментарии</button>
    </div>
  </section>`;
}

function placePanel() {
  if (!handoffText) return;
  const main = document.querySelector('main.nav-v2-shell');
  if (!main) return;
  const existing = document.getElementById('handoffTextPanel');
  if (existing) return;

  const rows = main.querySelectorAll(':scope > .kpi-row');
  const anchor = rows.length ? rows[rows.length - 1] : main.querySelector('.hero');
  if (!anchor) return;
  anchor.insertAdjacentHTML('afterend', panelHtml(handoffText));

  const copy = document.getElementById('copyCardHandoffText');
  if (copy) copy.onclick = async () => {
    const field = document.getElementById('cardHandoffText');
    try {
      await navigator.clipboard.writeText(handoffText);
      copy.textContent = 'Скопировано';
      setTimeout(() => copy.textContent = 'Скопировать текст', 1500);
    } catch (_) {
      if (field) { field.focus(); field.select(); }
      copy.textContent = 'Выделено для копирования';
      setTimeout(() => copy.textContent = 'Скопировать текст', 1800);
    }
  };
}

async function loadHandoffText() {
  if (loaded || !dealId || !getCachedUser()) return;
  loaded = true;
  try {
    const cardData = await rpc('nav_v2_get_deal_card', { p_deal_id: dealId }, 12000);
    handoffText = readHandoffText(cardData);
    placePanel();
  } catch (_) {
    // Карточка сама покажет ошибку загрузки, если она есть. Helper не должен ломать страницу.
  }
}

new MutationObserver(placePanel).observe(document.body, { childList: true, subtree: true });
loadHandoffText();
