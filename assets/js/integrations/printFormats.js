import { getDeal } from '../ui/form.js';
import { analyzeDeal } from '../core/engine.js';
import { loadData } from '../core/data.js';

let dataCache = null;

function get(id) { return document.getElementById(id); }
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function clean(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '').trim();
}
function plainList(items) {
  return items && items.length ? items.map((item) => '• ' + clean(item)).join('\n') : '• —';
}
function paragraphs(text) {
  return String(text || '').split('\n').map((line) => line.trim() ? '<p>' + esc(line) + '</p>' : '<br>').join('');
}
async function currentResult() {
  if (!dataCache) dataCache = await loadData();
  return analyzeDeal(getDeal(), dataCache);
}
function cooperation(d) {
  if (d.cooperationSummary) return d.cooperationSummary;
  if (d.representationModel === 'both_sides_one_spn') return 'Один СПН ведет обе стороны';
  if (d.representationModel === 'both_sides_two_spn') return 'Два СПН: продавец и покупатель';
  if (d.representationModel === 'seller_only') return 'Компания представляет продавца';
  if (d.representationModel === 'buyer_only') return 'Компания представляет покупателя';
  if (d.representationModel === 'external_agency') return 'Сделка с другим агентством';
  return 'Формат не уточнен';
}

function formatLawyer(result) {
  const d = result.deal;
  return `КАРТОЧКА ЮРИСТУ

1. ГЛАВНОЕ
Решение системы: ${result.decision}
Готовность к задатку: ${result.ready}%
Формат: ${cooperation(d)}

2. ОТВЕТСТВЕННЫЕ
СПН продавца: ${d.sellerSpn || '—'} / ${d.sellerPhone || '—'}
СПН покупателя: ${d.buyerSpn || '—'} / ${d.buyerPhone || '—'}
Менеджер: ${d.manager || '—'}
Юрист: ${d.lawyer || '—'}
Кому вернуть замечания: ${d.preparationOwner || d.sellerSpn || d.buyerSpn || '—'}

3. ОБЪЕКТ
${d.objectType || '—'} / ${d.rightForm || '—'}
Адрес: ${d.address || '—'}
КН объекта: ${d.cadObject || '—'}
КН земли: ${d.cadLand || '—'}

4. ЦЕНА И РАСЧЕТ
Фактическая цена: ${d.priceFact || '—'}
Цена в договоре: ${d.priceContract || '—'}
Комментарий по цене: ${d.priceComment || '—'}
Банк: ${d.bankType || '—'}
Комментарий по расчетам: ${d.bankInfo || '—'}

5. СТОП-ФАКТОРЫ
${plainList(result.stop)}

6. ПРЕДУПРЕЖДЕНИЯ
${plainList(result.warn)}

7. НЕ ХВАТАЕТ
${plainList(result.missing)}

8. ДОКУМЕНТЫ
ЕГРН с ЭЦП: ${d.stEgrn || '—'}
Справка о зарегистрированных: ${d.stRegistered || '—'}
Папка: ${d.folderLink || '—'}

9. ВОПРОСЫ СПН
${d.questions || '—'}`;
}
function formatBroker(result) {
  const d = result.deal;
  return `КАРТОЧКА БРОКЕРУ

Формат сделки: ${cooperation(d)}
Покупатель / СПН покупателя: ${d.buyerSpn || '—'} / ${d.buyerPhone || '—'}
Объект: ${d.objectType || '—'} / ${d.rightForm || '—'}
Адрес: ${d.address || '—'}
Банк: ${d.bankType || '—'}
Расчет: ${(d.payments || []).join(', ') || '—'}
Сертификаты: ${(d.certificates || []).join(', ') || '—'}
Оценка: ${d.evaluationCost || '—'}
СБР: ${d.sbrCost || '—'}
Страховка / услуги банка: ${d.bankInsuranceCost || '—'}
Папка: ${d.folderLink || '—'}

Что проверить:
${plainList(result.bank)}

Риски / предупреждения:
${plainList([...(result.stop || []), ...(result.warn || [])])}`;
}
function formatDocs(result) {
  return `СПИСОК ДОКУМЕНТОВ

ПРОДАВЕЦ:
${plainList(result.docsSeller)}

ПОКУПАТЕЛЬ:
${plainList(result.docsBuyer)}

БАНК:
${plainList(result.bank)}

ДОПОЛНИТЕЛЬНО:
${plainList(result.extra)}

Важно: документы сканировать отдельными файлами, в названии файла указывать фамилию и тип документа. Для ЕГРН нужен полный комплект с ЭЦП: PDF + XML + SIG/архив.`;
}
function formatClient(result) {
  const d = result.deal;
  const address = d.address || '[адрес объекта]';
  return `СООБЩЕНИЕ КЛИЕНТУ

Здравствуйте! Для подготовки сделки по объекту ${address} нужно заранее собрать документы.

От продавца:
${plainList(result.docsSeller)}

От покупателя:
${plainList(result.docsBuyer)}

Если есть ипотека / банк:
${plainList(result.bank)}

ЕГРН для банка или нотариуса нужна полным комплектом: PDF + XML + SIG/архив с ЭЦП. Документы лучше прислать отдельными файлами.`;
}
function formatCosts(result) {
  const d = result.deal;
  return `ПАМЯТКА ПО РАСХОДАМ

Госпошлина за регистрацию права: ${d.registrationFeeAmount || '4000'}
Госпошлина по земле: ${d.landRegistrationFeeAmount || '700'}
Оценка объекта: ${d.evaluationCost || 'квартира 3–5 тыс., дом 6–9 тыс.'}
СБР / безопасные расчеты: ${d.sbrCost || 'Сбер ориентир 3400'}
Нотариус: ${d.notaryCost || 'если требуется'}
Страховка / услуги банка: ${d.bankInsuranceCost || 'если ипотека'}
Прочие расходы: ${d.otherCosts || '—'}
Комментарий: ${d.costsComment || '—'}

В МФЦ желательно иметь деньги на карте для оплаты госпошлины. Если карты нет, в окне могут дать квитанцию на оплату.`;
}

const formats = {
  lawyer: ['Юристу', formatLawyer, 'Структурированная карточка для юридической проверки.'],
  broker: ['Брокеру', formatBroker, 'Только банк, ипотека, объект, расходы и документы.'],
  docs: ['Документы', formatDocs, 'Список документов по продавцу, покупателю, банку.'],
  client: ['Клиенту', formatClient, 'Текст, который можно отправить клиенту.'],
  costs: ['Расходы', formatCosts, 'Памятка по госпошлинам, оценке, СБР и расходам.']
};

async function copyFormat(key) {
  const result = await currentResult();
  await navigator.clipboard.writeText(formats[key][1](result));
  alert('Скопировано: ' + formats[key][0]);
}
async function printFormat(key) {
  const result = await currentResult();
  const title = formats[key][0];
  const text = formats[key][1](result);
  const area = get('handoffPrintArea');
  area.innerHTML = '<div class="handoff-print-content"><h1>' + esc(title) + '</h1><div class="meta">Навигатор сделки СПН · ' + new Date().toLocaleString('ru-RU') + '</div>' + paragraphs(text) + '</div>';
  window.print();
}
function loadCss() {
  if (document.querySelector('link[href="./assets/css/print-formats.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/css/print-formats.css';
  document.head.appendChild(link);
}
function ensurePanel() {
  if (get('handoffPanel')) return;
  const resultPanel = document.querySelector('.panel.result');
  if (!resultPanel) return;
  const panel = document.createElement('div');
  panel.id = 'handoffPanel';
  panel.className = 'handoff-panel';
  panel.innerHTML = '<h2>📤 Передать / распечатать</h2><p class="small">Чистые форматы без лишнего интерфейса: для юриста, брокера, клиента, документов и расходов.</p><div class="handoff-grid">' + Object.entries(formats).map(([key, item]) => '<div class="handoff-card"><h3>' + esc(item[0]) + '</h3><p>' + esc(item[2]) + '</p><div class="handoff-actions"><button class="light" data-copy-format="' + key + '">Скопировать</button><button class="green" data-print-format="' + key + '">Печать</button></div></div>').join('') + '</div>';
  resultPanel.insertBefore(panel, resultPanel.firstChild);
  panel.querySelectorAll('[data-copy-format]').forEach((button) => button.onclick = () => copyFormat(button.dataset.copyFormat));
  panel.querySelectorAll('[data-print-format]').forEach((button) => button.onclick = () => printFormat(button.dataset.printFormat));

  const printArea = document.createElement('div');
  printArea.id = 'handoffPrintArea';
  printArea.className = 'handoff-print-area';
  document.body.appendChild(printArea);
}
function addTopButton() {
  const actions = document.querySelector('.topbar .actions');
  if (!actions || get('btnHandoff')) return;
  const button = document.createElement('button');
  button.id = 'btnHandoff';
  button.className = 'handoff-top-btn';
  button.textContent = 'Передать / печать';
  button.onclick = () => get('handoffPanel')?.scrollIntoView({ behavior: 'smooth' });
  actions.appendChild(button);
}
function start() {
  loadCss();
  ensurePanel();
  addTopButton();
}
let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (document.querySelector('.panel.result') && document.querySelector('.topbar .actions')) {
    clearInterval(timer);
    start();
  }
  if (attempts > 60) clearInterval(timer);
}, 200);
