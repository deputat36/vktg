import { rpc } from './supabase-v2.js';

const dealId = new URLSearchParams(location.search).get('id');

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function firstWord(value) {
  const text = clean(value);
  return text ? text.split(' ')[0].replace(/[.,;:]+$/g, '') : '';
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function participantSources(data) {
  const deal = data?.deal || {};
  return [
    data?.participants,
    data?.deal_participants,
    data?.dealParticipants,
    deal.participants,
    deal.deal_participants,
    deal.dealParticipants,
    deal.deal_summary?.participants,
    deal.wizard_snapshot?.participants,
    deal.deal_summary?.parties,
    deal.wizard_snapshot?.parties
  ];
}

function personName(item) {
  if (typeof item === 'string') return item;
  return item?.full_name || item?.fio || item?.name || item?.client_name || item?.participant_name || item?.title || '';
}

function side(item) {
  return clean(item?.side || item?.role || item?.type || item?.participant_role).toLowerCase();
}

function rank(item) {
  const s = side(item);
  if (s.includes('seller') || s.includes('продав') || s.includes('owner') || s.includes('собствен')) return 1;
  if (s.includes('buyer') || s.includes('покуп')) return 2;
  return 3;
}

function surnames(data) {
  let people = [];
  for (const source of participantSources(data)) {
    if (arr(source).length) {
      people = arr(source);
      break;
    }
  }
  const seen = new Set();
  return people
    .slice()
    .sort((a, b) => rank(a) - rank(b))
    .map((item) => firstWord(personName(item)))
    .filter((name) => {
      const key = name.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function address(data) {
  const deal = data?.deal || {};
  return clean(deal.address || deal.object_address || deal.property_address || deal.deal_summary?.address || deal.wizard_snapshot?.address);
}

function titleFrom(data) {
  const deal = data?.deal || {};
  const a = address(data);
  const names = surnames(data);
  const base = [a, names.length ? names.join(' / ') : ''].filter(Boolean).join(' — ');
  return base || clean(deal.title) || 'Сделка';
}

function isLawyerScreen() {
  return location.hash === '#risks' || document.body.innerText.toLowerCase().includes('юридическая проверка');
}

async function init() {
  if (!dealId) return;
  try {
    const data = await rpc('nav_v2_get_deal_card', { p_deal_id: dealId }, 15000);
    const title = titleFrom(data);
    const h1 = document.querySelector('.hero h1');
    if (h1 && title) h1.textContent = isLawyerScreen() ? `Юридическая проверка: ${title}` : title;

    const names = surnames(data);
    if (names.length && !document.getElementById('dealParticipantsTitleBlock')) {
      const card = [...document.querySelectorAll('.card h2')].find((el) => el.textContent.includes('Суть сделки'))?.closest('.card');
      if (card) card.querySelector('.list')?.insertAdjacentHTML('beforeend', `<div id="dealParticipantsTitleBlock" class="list-item"><b>Участники</b>${names.join(' / ')}</div>`);
    }
  } catch (_) {}
}

setTimeout(init, 700);
setTimeout(init, 2200);
