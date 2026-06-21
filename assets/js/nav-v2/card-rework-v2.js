import { rpc, esc } from './supabase-v2.js';

const dealId = new URLSearchParams(location.search).get('id');
const PANEL_ID = 'spnReworkPanelV2';

function arr(value) { return Array.isArray(value) ? value : []; }
function missingDocs(docs) { return docs.filter((doc) => doc.is_required && !['received', 'checked'].includes(doc.status)).length; }
function redRisks(risks) { return risks.filter((risk) => risk.level === 'red' && risk.is_resolved !== true).length; }
function snapshot(deal) { return deal?.wizard_snapshot || {}; }
function isLawyerProfile(data) { return data?.profile?.role === 'lawyer'; }

const reasons = [
  ['docs', 'Не хватает документов', 'Добавьте недостающие документы или отметьте, какие документы уже запросили у клиента.'],
  ['risks', 'Есть красный риск / стоп-фактор', 'Уточните обстоятельства риска и не двигайтесь к задатку, пока юрист не даст решение.'],
  ['settlements', 'Не согласованы расчёты', 'Уточните, когда и как продавец получает деньги, какая сумма до/после регистрации и чем защищены стороны.'],
  ['expenses', 'Не согласованы расходы', 'Зафиксируйте, кто оплачивает комиссию, нотариуса, банк, справки, госпошлину и дополнительные расходы.'],
  ['object', 'Не хватает данных по объекту', 'Добавьте точный тип объекта, адрес, площадь, кадастровые данные и важные особенности объекта.'],
  ['seller', 'Не хватает данных по продавцу / праву', 'Уточните собственников, основание права, супруга, доверенность, доли, обременения и зарегистрированных лиц.'],
  ['buyer', 'Не хватает данных по покупателю / деньгам', 'Уточните покупателя, источник денег, ипотеку, маткапитал, сертификаты и сроки готовности денег.'],
  ['deposit', 'Нельзя готовить задаток', 'Сначала согласуйте критичные условия: сумма, сроки, возврат/невозврат, документы, расчёты, освобождение и ответственность сторон.'],
  ['lawyerQuestion', 'Нет конкретного вопроса юристу', 'Сформулируйте, что именно нужно проверить или решить юристу по этой сделке.']
];

function suggestedKeys(data) {
  const deal = data?.deal || {};
  const docs = arr(data?.documents);
  const risks = arr(data?.risks);
  const s = snapshot(deal);
  const keys = [];
  if (missingDocs(docs) > 0) keys.push('docs');
  if (redRisks(risks) > 0 || deal.risk_level === 'red') keys.push('risks');
  if (!deal.settlements_agreed) keys.push('settlements');
  if (!deal.expenses_agreed) keys.push('expenses');
  if (!deal.object_type || !deal.address) keys.push('object');
  if ((deal.lawyer_needed || deal.has_children || deal.has_matcap) && !s.lawyerQuestion) keys.push('lawyerQuestion');
  if ((deal.readiness_deposit || 0) < 70 && ['ready_for_deposit', 'need_lawyer'].includes(deal.status)) keys.push('deposit');
  return keys;
}

function buildText(data, selectedKeys) {
  const deal = data?.deal || {};
  const docs = arr(data?.documents);
  const risks = arr(data?.risks);
  const s = snapshot(deal);
  const selected = reasons.filter(([key]) => selectedKeys.includes(key));
  const lines = [];
  lines.push('Юрист вернул карточку СПН на доработку.');
  lines.push('');
  lines.push(`Сделка: ${deal.title || deal.address || deal.id || 'без названия'}`);
  if (deal.address) lines.push(`Адрес: ${deal.address}`);
  if (deal.object_type) lines.push(`Тип объекта: ${deal.object_type}`);
  lines.push('');
  lines.push('Что нужно доработать:');
  if (selected.length) {
    selected.forEach(([, title, text], index) => lines.push(`${index + 1}. ${title}. ${text}`));
  } else {
    lines.push('1. Уточните данные по сделке и обновите карточку перед повторной проверкой.');
  }
  lines.push('');
  lines.push('Контрольные показатели сейчас:');
  lines.push(`- Не хватает документов: ${missingDocs(docs)}`);
  lines.push(`- Красные риски: ${redRisks(risks)}`);
  lines.push(`- Готовность к задатку: ${deal.readiness_deposit || 0}%`);
  lines.push(`- Готовность к сделке: ${deal.readiness_deal || 0}%`);
  lines.push(`- Расходы согласованы: ${deal.expenses_agreed ? 'да' : 'нет'}`);
  lines.push(`- Расчёты согласованы: ${deal.settlements_agreed ? 'да' : 'нет'}`);
  lines.push('');
  lines.push(`Вопрос СПН юристу: ${s.lawyerQuestion || 'не указан'}`);
  lines.push('');
  lines.push('После доработки обновите карточку и отправьте сделку на повторную юридическую проверку.');
  return lines.join('\n');
}

function html(data) {
  const suggested = suggestedKeys(data);
  const text = buildText(data, suggested);
  return `<section class="card" id="${PANEL_ID}" style="border:2px solid rgba(245,158,11,.32)">
    <div class="section-title">
      <div>
        <span class="pill yellow">возврат СПН</span>
        <h2 style="margin:8px 0 4px">Вернуть СПН на доработку</h2>
        <p class="muted" style="margin:0">Юрист выбирает причины, а система формирует понятное сообщение СПН и переводит сделку в доработку.</p>
      </div>
      <span class="pill ${suggested.length ? 'yellow' : 'green'}">${suggested.length ? 'есть замечания' : 'без авто-замечаний'}</span>
    </div>
    <div class="grid">
      <div class="card" style="box-shadow:none">
        <h3>Причины возврата</h3>
        <div class="list">
          ${reasons.map(([key, title, text]) => `<label class="list-item" style="cursor:pointer"><span><input type="checkbox" data-rework-reason="${key}" ${suggested.includes(key) ? 'checked' : ''}> <b>${esc(title)}</b></span><span class="small">${esc(text)}</span></label>`).join('')}
        </div>
      </div>
      <div class="card" style="box-shadow:none">
        <h3>Сообщение СПН</h3>
        <div class="field"><label>Текст возврата</label><textarea id="reworkTextV2" style="min-height:300px">${esc(text)}</textarea></div>
        <div id="reworkStatusV2" class="status">Проверьте текст и нажмите «Вернуть СПН».</div>
        <div class="actions" style="justify-content:flex-start">
          <button class="btn light" id="copyReworkTextV2" type="button">Скопировать текст</button>
          <button class="btn red" id="sendReworkV2" type="button">Вернуть СПН</button>
        </div>
      </div>
    </div>
  </section>`;
}

function selectedKeys() {
  return Array.from(document.querySelectorAll('[data-rework-reason]:checked')).map((input) => input.dataset.reworkReason);
}

function bind(data) {
  const updateText = () => {
    const textarea = document.getElementById('reworkTextV2');
    if (textarea) textarea.value = buildText(data, selectedKeys());
  };
  document.querySelectorAll('[data-rework-reason]').forEach((input) => input.onchange = updateText);
  const copy = document.getElementById('copyReworkTextV2');
  if (copy) copy.onclick = async () => {
    const text = document.getElementById('reworkTextV2')?.value || '';
    try { await navigator.clipboard.writeText(text); document.getElementById('reworkStatusV2').textContent = 'Текст скопирован.'; }
    catch (_) { document.getElementById('reworkStatusV2').textContent = 'Не удалось скопировать автоматически. Выделите текст вручную.'; }
  };
  const send = document.getElementById('sendReworkV2');
  if (send) send.onclick = async () => {
    const body = document.getElementById('reworkTextV2')?.value.trim();
    if (!body) { document.getElementById('reworkStatusV2').className = 'status error'; document.getElementById('reworkStatusV2').textContent = 'Текст возврата пустой.'; return; }
    if (!confirm('Вернуть сделку СПН на доработку?')) return;
    send.disabled = true;
    document.getElementById('reworkStatusV2').className = 'status warn';
    document.getElementById('reworkStatusV2').textContent = 'Возвращаю СПН на доработку...';
    try {
      await rpc('nav_v2_return_spn_rework', { p_deal_id: dealId, p_body: body }, 15000);
      document.getElementById('reworkStatusV2').className = 'status ok';
      document.getElementById('reworkStatusV2').textContent = 'Сделка возвращена СПН. Обновляю карточку...';
      setTimeout(() => location.reload(), 700);
    } catch (error) {
      send.disabled = false;
      document.getElementById('reworkStatusV2').className = 'status error';
      document.getElementById('reworkStatusV2').textContent = error.message || String(error);
    }
  };
}

async function load() {
  if (!dealId) return;
  try {
    const data = await rpc('nav_v2_get_deal_card', { p_deal_id: dealId }, 45000);
    if (!isLawyerProfile(data)) return;
    if (document.getElementById(PANEL_ID)) return;
    const main = document.querySelector('#app main');
    if (!main) return;
    const summary = document.getElementById('legalSummaryV2');
    if (summary) summary.insertAdjacentHTML('afterend', html(data));
    else main.insertAdjacentHTML('beforeend', html(data));
    bind(data);
  } catch (error) {
    console.warn('SPN rework panel skipped', error);
  }
}

let tries = 0;
const timer = setInterval(() => {
  tries += 1;
  if (document.querySelector('#app main')) { clearInterval(timer); load(); }
  if (tries > 40) clearInterval(timer);
}, 150);
