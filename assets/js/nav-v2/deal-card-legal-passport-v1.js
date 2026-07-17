import { buildLegalPassportCardModel } from './deal-card-legal-passport-model-v1.js?v=20260717-01';

const BLOCK_ID = 'dealLegalPassportV1';

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function list(items, empty) {
  if (!items.length) return `<p class="muted">${esc(empty)}</p>`;
  return `<ul class="legal-passport-list">${items.map((item) => `<li>${esc(item.title)}</li>`).join('')}</ul>`;
}

function statusTitle(status) {
  return ({ agreed: 'согласовано', not_agreed: 'не согласовано', not_applicable: 'не относится', unknown: 'неизвестно' })[status] || status || 'неизвестно';
}

function booleanTitle(value) {
  return value === true ? 'да' : value === false ? 'нет' : 'неизвестно';
}

function documentSummary(documents) {
  const labels = { available: 'Получены', requested: 'Запрошены', missing: 'Отсутствуют', problem: 'Есть проблема' };
  const rows = Object.entries(documents).filter(([, items]) => items.length);
  if (!rows.length) return '<p class="muted">Статусы документов не переданы.</p>';
  return rows.map(([status, items]) => `<div class="legal-passport-document-row"><b>${labels[status]}</b><span>${items.map((item) => esc(item.title)).join(', ')}</span></div>`).join('');
}

function riskSummary(risks) {
  if (!risks.length) return '<p class="muted">Автоматические риски не переданы.</p>';
  return `<ul class="legal-passport-list">${risks.map((risk) => `<li><span class="pill ${risk.level === 'red' ? 'red' : risk.level === 'yellow' ? 'yellow' : 'blue'}">${esc(risk.level)}</span> ${esc(risk.title)}${risk.blocks_deposit ? ' · блокирует задаток' : ''}${risk.blocks_deal ? ' · блокирует сделку' : ''}</li>`).join('')}</ul>`;
}

function spnLine(spn) {
  const rows = [];
  if (spn.seller) rows.push(`Продавец: ${spn.seller}`);
  if (spn.buyer) rows.push(`Покупатель: ${spn.buyer}`);
  return rows.length ? rows.join(' · ') : 'СПН по сторонам не переданы карточке.';
}

function buildHtml(model) {
  const p = model.passport;
  const source = model.source === 'passport_v1'
    ? '<span class="pill green">Паспорт v1</span>'
    : '<span class="pill yellow">Старая карточка</span>';
  const completeness = p.handoff_completeness.state === 'ready'
    ? '<span class="pill green">передача полная</span>'
    : `<span class="pill yellow">${esc(p.handoff_completeness.state)}</span>`;
  return `<section id="${BLOCK_ID}" class="card legal-passport-card" aria-labelledby="legalPassportTitle">
    <div class="section-title legal-passport-head">
      <div><div class="legal-passport-kicker">${source} ${completeness}</div><h2 id="legalPassportTitle">${esc(p.request_title)}</h2><p class="muted">${esc(p.requested_decision || 'Ожидаемое решение пока не сформулировано.')}</p></div>
      <div class="legal-passport-deadline"><span>Ответ нужен</span><b>${esc(p.target_date || p.urgency || 'срок не указан')}</b></div>
    </div>
    ${model.source === 'legacy' ? '<div class="status warn"><b>Это старая карточка без юридического паспорта v1.</b> Экран показывает безопасную сводку из уже загруженных данных и явно отмечает неизвестное. Для решения может потребоваться уточнение у СПН.</div>' : ''}
    <div class="legal-passport-grid">
      <div class="legal-passport-section"><h3>Что готовится</h3><p><b>${esc(p.preparation_title || 'не указано')}</b> · ${esc(p.stage || 'стадия не указана')}</p><p>${esc(p.object.type || 'объект не указан')} · ${esc(p.object.address || 'адрес не указан')}</p><p class="small">Сопровождение: ${esc(p.representation_model || 'не указано')}</p></div>
      <div class="legal-passport-section"><h3>СПН по сторонам</h3><p>${esc(spnLine(model.spn_by_side))}</p><h3>Следующий шаг СПН</h3><p>${esc(p.spn_next_action || 'не указан')}</p></div>
      <div class="legal-passport-section"><h3>Подтверждено документом</h3>${list(p.confirmed_facts, 'Подтверждённых фактов нет.')}</div>
      <div class="legal-passport-section"><h3>Со слов клиента</h3>${list(p.client_reported_facts, 'Сообщённых клиентом фактов нет.')}</div>
      <div class="legal-passport-section"><h3>Пока неизвестно</h3>${list(p.unknown_facts, 'Неизвестных активных фактов нет.')}</div>
      <div class="legal-passport-section"><h3>Риски и стоп-факторы</h3>${riskSummary(p.risk_flags)}</div>
      <div class="legal-passport-section legal-passport-wide"><h3>Документы</h3>${documentSummary(p.documents)}</div>
      <div class="legal-passport-section legal-passport-wide"><h3>Условия</h3><div class="legal-passport-terms"><span><b>Расчёты:</b> ${esc(statusTitle(p.settlements.status))}</span><span><b>Расходы:</b> ${esc(statusTitle(p.expenses.status))}</span><span><b>Задаток нужен:</b> ${esc(booleanTitle(p.deposit.required))}</span><span><b>Сумма известна:</b> ${esc(booleanTitle(p.deposit.amount_known))}</span><span><b>Условия известны:</b> ${esc(booleanTitle(p.deposit.conditions_known))}</span></div></div>
    </div>
    <div class="legal-passport-actions" aria-label="Юридическое решение">
      <button class="btn green" type="button" data-legal-passport-action="checked">Можно двигаться дальше</button>
      <button class="btn light" type="button" data-legal-passport-action="return_spn">Нужна информация</button>
      <button class="btn light" type="button" data-legal-passport-action="need_documents">Нужны документы</button>
      <button class="btn red" type="button" data-legal-passport-action="stop_factor">Есть стоп-фактор</button>
    </div>
  </section>`;
}

function bindDecisionShortcuts(root) {
  root.querySelectorAll('[data-legal-passport-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = document.querySelector(`[data-legal-action="${button.dataset.legalPassportAction}"]`);
      if (target) target.click();
    });
  });
}

export function applyDealCardLegalPassport(data, profile) {
  document.getElementById(BLOCK_ID)?.remove();
  if ((profile?.role || data?.profile?.role) !== 'lawyer') return null;
  const main = document.querySelector('#app .nav-v2-shell');
  const hero = main?.querySelector('.hero');
  if (!main || !hero) return null;
  const model = buildLegalPassportCardModel(data);
  const host = document.createElement('div');
  host.innerHTML = buildHtml(model);
  const section = host.firstElementChild;
  const modePanel = hero.nextElementSibling;
  if (modePanel) modePanel.insertAdjacentElement('afterend', section);
  else hero.insertAdjacentElement('afterend', section);
  bindDecisionShortcuts(section);
  return model;
}
