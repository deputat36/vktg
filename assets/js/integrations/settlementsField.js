import { loadData } from '../core/data.js';
import { renderChecks } from '../ui/form.js';

function get(id) { return document.getElementById(id); }
function findPaymentsBox() { return get('paymentsBox'); }

async function ensureSettlementsField() {
  if (get('settlementsBox')) return;
  const paymentsBox = findPaymentsBox();
  if (!paymentsBox) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'section';
  wrapper.innerHTML = `
    <h3>Порядок расчетов</h3>
    <p class="small">Это отдельно от источника денег. Например: деньги могут быть маткапиталом, ипотекой или собственными средствами, а порядок расчетов — СБР, аккредитив, перевод после регистрации, перечисление СФР и т.д.</p>
    <div id="settlementsBox"></div>
  `;
  paymentsBox.parentElement.insertAdjacentElement('afterend', wrapper);
  const data = await loadData();
  renderChecks('settlementsBox', 'settlements', data.dictionaries.settlements || []);
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (findPaymentsBox()) {
    clearInterval(timer);
    ensureSettlementsField().catch(console.warn);
  }
  if (attempts > 60) clearInterval(timer);
}, 200);
