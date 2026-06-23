import { getMyProfile, esc } from './supabase-v2.js';

let profile = null;
let observerStarted = false;

function cleanTitle(title) {
  const text = String(title || '').trim();
  const marker = 'Продавец не указан / Покупатель не указан — ';
  if (!text.startsWith(marker)) return { title: text, warning: '' };
  const rest = text.slice(marker.length).trim();
  if (!rest || rest.toLowerCase() === 'адрес не указан') {
    return { title: 'Сделка без адреса', warning: 'Не указаны продавец, покупатель и адрес.' };
  }
  return { title: rest, warning: 'Не указаны продавец и покупатель.' };
}

function polishHero() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const h1 = hero.querySelector('h1');
  const p = hero.querySelector('p');
  if (h1) h1.textContent = 'Мои сделки';
  if (p) p.textContent = 'Рабочий список СПН: что нужно сделать сейчас, где нужны документы, юрист или брокер.';
}

function polishFilters() {
  const select = document.getElementById('dealFilter');
  if (!select || select.dataset.spnPolished === '1') return;
  select.dataset.spnPolished = '1';
  Array.from(select.options).forEach((option) => {
    if (['demo', 'real'].includes(option.value)) option.remove();
    if (option.value === 'all') option.textContent = 'Все мои сделки';
    if (option.value === 'attention') option.textContent = 'Требуют внимания';
    if (option.value === 'lawyer') option.textContent = 'Ждут юриста';
    if (option.value === 'broker') option.textContent = 'Ждут брокера';
  });
}

function polishCards() {
  document.querySelectorAll('.deal-card').forEach((card) => {
    if (card.dataset.spnDealsPolished === '1') return;
    const title = card.querySelector('.deal-title');
    if (!title) return;
    const cleaned = cleanTitle(title.textContent);
    if (cleaned.title) title.textContent = cleaned.title;
    if (cleaned.warning) {
      title.insertAdjacentHTML('afterend', `<div class="status warn" style="margin-top:8px">${esc(cleaned.warning)} Откройте карточку и дозаполните данные сторон.</div>`);
    }
    card.dataset.spnDealsPolished = '1';
  });
}

function applyPolish() {
  if (profile?.role !== 'spn') return;
  polishHero();
  polishFilters();
  polishCards();
}

async function init() {
  try {
    profile = await getMyProfile({ refresh: false, timeout: 8000 });
  } catch (_) {
    profile = null;
  }

  applyPolish();

  if (!observerStarted) {
    observerStarted = true;
    new MutationObserver(() => applyPolish()).observe(document.body, { childList: true, subtree: true });
  }
}

init();
