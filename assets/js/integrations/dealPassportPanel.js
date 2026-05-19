import { getDeal } from '../ui/form.js';
import { buildDealPassport } from '../core/dealSchema.js';
import { loadData, makeLabels } from '../core/data.js';

let labels = null;

function get(id) { return document.getElementById(id); }
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function label(id) { return labels?.[id] || id; }
function chips(items = [], cls = 'blue') {
  return items.length ? items.map((item) => `<span class="pill ${cls}">${esc(label(item))}</span>`).join(' ') : '<span class="pill orange">не выбрано</span>';
}
function list(items = []) {
  return items.length ? '<ul>' + items.map((item) => `<li>${esc(item)}</li>`).join('') + '</ul>' : '<span class="pill green">минимум заполнен</span>';
}

function cooperationTitle(d) {
  if (d.cooperationSummary) return d.cooperationSummary;
  if (d.representationModel === 'both_sides_one_spn') return 'Один СПН ведет обе стороны';
  if (d.representationModel === 'both_sides_two_spn') return 'Два СПН: продавец и покупатель';
  if (d.representationModel === 'seller_only') return 'Компания представляет продавца';
  if (d.representationModel === 'buyer_only') return 'Компания представляет покупателя';
  if (d.representationModel === 'external_agency') return 'Сделка с другим агентством';
  return 'Формат представительства не уточнен';
}

function passportHtml() {
  const d = getDeal();
  const passport = buildDealPassport(d, labels || {});
  const s = passport.schema;
  const sourceCls = s.money.hasChildMoney ? 'red' : s.money.hasMortgage || s.money.hasMatcap || s.money.hasSocialProgram ? 'orange' : 'blue';
  const settlementCls = s.money.riskySettlement ? 'red' : s.money.settlementUnknown ? 'orange' : 'green';
  const childBadge = s.owners.hasChildren ? '<span class="pill red">дети участвуют</span>' : '<span class="pill green">дети не отмечены</span>';
  const objectBadges = [
    s.property.isShare && 'доля/ППП/нотариус',
    s.property.needsLandCadastre && 'земля/НСПД',
    s.property.isPrivateSectorFlat && 'частный сектор',
    s.property.isCommercial && 'коммерция',
    s.title.isUnknown && 'основание неясно',
    s.money.hasChildMoney && 'детские деньги',
    s.money.riskySettlement && 'рискованный расчет'
  ].filter(Boolean);

  return `
    <div id="dealPassportPanel" class="box blue">
      <h3>Паспорт сделки — проверьте, правильно ли система поняла ситуацию</h3>
      <table>
        <tr><th>Что продаем</th><td>${esc(d.objectType || '—')}<br>${esc(d.rightForm || '—')}</td><th>Кого представляем</th><td>${esc(cooperationTitle(d))}</td></tr>
        <tr><th>Собственники / дети</th><td>${childBadge}<br>Продавцов: ${esc(d.sellerCount || '—')} · Покупателей: ${esc(d.buyerCount || '—')}</td><th>Документ-основание</th><td>${chips(d.basis, s.title.isUnknown ? 'orange' : 'blue')}</td></tr>
        <tr><th>Источник денег</th><td>${chips(d.payments, sourceCls)}</td><th>Порядок расчетов</th><td>${chips(d.settlements, settlementCls)}</td></tr>
        <tr><th>Кого подключить</th><td colspan="3">${s.needs.broker ? '<span class="pill orange">брокер</span>' : ''} ${s.needs.manager ? '<span class="pill orange">менеджер</span>' : ''} ${s.needs.opika ? '<span class="pill red">опека</span>' : ''} <span class="pill blue">юрист</span></td></tr>
        <tr><th>Особые признаки</th><td colspan="3">${objectBadges.length ? chips(objectBadges, 'orange') : '<span class="pill green">особые признаки не выявлены</span>'}</td></tr>
        <tr><th>Чего не хватает</th><td colspan="3">${list(s.required)}</td></tr>
      </table>
    </div>
  `;
}

function injectInto(tabId, position = 'afterbegin') {
  const tab = get(tabId);
  if (!tab) return;
  const old = tab.querySelector('#dealPassportPanel');
  if (old) old.remove();
  tab.insertAdjacentHTML(position, passportHtml());
}

function refreshPassport() {
  if (!labels) return;
  injectInto('summary', 'afterbegin');
  injectInto('now', 'afterbegin');
  injectInto('lawyerTab', 'afterbegin');
}

async function start() {
  const data = await loadData();
  labels = makeLabels(data);
  document.addEventListener('click', (event) => {
    if (event.target?.id === 'btnGenerate' || event.target?.id === 'btnSelfCheck') setTimeout(refreshPassport, 80);
  });
  document.addEventListener('input', () => setTimeout(refreshPassport, 80));
  document.addEventListener('change', () => setTimeout(refreshPassport, 80));
  setTimeout(refreshPassport, 500);
}

start().catch(console.warn);
