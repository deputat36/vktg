import './deal-card-spn-responsibility-v2.js';
import { esc } from './supabase-v2.js';

let cardData = null;

const LABELS = {
  preparationMode: {
    consult: 'консультация',
    deposit: 'подготовка к задатку',
    deal: 'подготовка сделки',
    check_docs: 'проверка документов',
    rework: 'доработка заявки'
  },
  representation: {
    seller: 'продавец',
    buyer: 'покупатель',
    one_spn_both: 'обе стороны, один СПН',
    both: 'обе стороны, два СПН',
    partner_agency: 'партнерская сделка',
    unknown: 'пока не ясно'
  },
  stage: {
    lead_only: 'только клиент',
    object_chosen: 'объект выбран',
    terms_discussed: 'условия обсуждены',
    urgent_deposit: 'срочно готовим задаток',
    deposit_exists: 'задаток уже был',
    main_deal: 'готовим основную сделку',
    legal_problem: 'нужен юрист'
  },
  objectType: {
    flat_mkd: 'квартира в МКД',
    flat_ground: 'квартира на земле',
    room: 'комната',
    share: 'доля',
    share_room: 'доля / комната',
    house_land: 'дом с участком',
    house: 'дом',
    land: 'земельный участок',
    new_building: 'новостройка / ДДУ / уступка',
    commercial: 'коммерция'
  }
};

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

function label(group, value) {
  return LABELS[group]?.[value] || clean(value) || 'не указано';
}

function legacyHandoffText(deal) {
  const snapshot = snapshotDeal();
  if (!Object.keys(snapshot).length) return '';

  const lines = [
    'Передача заявки от СПН',
    '',
    `Что готовим: ${label('preparationMode', snapshot.preparationMode || deal?.preparation_mode)}`,
    `Кого сопровождаем: ${label('representation', snapshot.representation || deal?.representation_model)}`,
    `Стадия: ${label('stage', snapshot.stage)}`,
    `Объект: ${label('objectType', snapshot.objectType || deal?.object_type)}`,
    `Адрес: ${clean(snapshot.address || deal?.address) || 'не указан'}`,
    `Цена: ${clean(snapshot.priceTotal || deal?.price_total) || 'не указана'}`,
    `Задаток/аванс: ${clean(snapshot.depositAmount || deal?.deposit_amount) || 'не указан'}`,
    '',
    `Ближайший шаг: ${clean(snapshot.clientNextStep || deal?.next_action) || 'не указан'}`,
    `Комментарий СПН: ${clean(snapshot.spnFinalComment || snapshot.riskComment || snapshot.stageComment) || 'нет'}`
  ];

  return lines.join('\n');
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

function snapshotViewModel() {
  const deal = cardData?.deal || {};
  const final = spnFinal();
  const readiness = readinessLocal();
  const explicitHandoff = clean(final.handoff_text);
  const handoffText = explicitHandoff || legacyHandoffText(deal);

  return {
    isLegacy: !explicitHandoff && Boolean(handoffText),
    handoffText,
    nextStep: clean(final.next_step || snapshotDeal().clientNextStep || deal.next_action),
    comment: clean(final.comment || snapshotDeal().spnFinalComment || snapshotDeal().riskComment || snapshotDeal().stageComment),
    missing: arrayOf(readiness.missing),
    blockers: arrayOf(readiness.blockers),
    notes: arrayOf(readiness.notes),
    readinessCard: Number(readiness.card || 0)
  };
}

function snapshotKey(view) {
  return JSON.stringify(view);
}

function blockHtml(view) {
  if (!view.handoffText && !view.nextStep && !view.comment && !view.missing.length && !view.blockers.length && !view.notes.length) return '';

  return `<section class="card" data-spn-handoff-snapshot="true" data-snapshot-key="${esc(snapshotKey(view))}" style="border:2px solid rgba(59,130,246,.18)">
    <div class="section-title">
      <div>
        <h2>Текст передачи СПН</h2>
        <p class="muted">${view.isLegacy ? 'Сформировано из сохранённых ответов старого мастера.' : 'Это итог, который СПН сформировал в мастере при создании сделки.'}</p>
      </div>
      ${view.readinessCard ? `<span class="pill ${view.readinessCard >= 80 ? 'green' : view.readinessCard >= 60 ? 'yellow' : 'red'}">готовность ${esc(view.readinessCard)}%</span>` : ''}
    </div>
    ${view.nextStep ? `<div class="status"><b>Ближайший шаг:</b> ${esc(view.nextStep)}</div>` : ''}
    ${view.comment ? `<p><b>Комментарий СПН:</b> ${esc(view.comment)}</p>` : ''}
    ${view.handoffText ? `<div class="field"><label>Готовый текст передачи</label><textarea readonly style="min-height:220px">${esc(view.handoffText)}</textarea></div>
      <div class="actions" style="justify-content:flex-start"><button class="btn light" type="button" data-copy-spn-handoff="1">Скопировать текст</button></div>` : ''}
    <div class="side-by-side">
      ${buildList('Не хватает', view.missing, 'yellow')}
      ${buildList('Стоп-факторы', view.blockers, 'red')}
    </div>
    ${buildList('Замечания', view.notes, 'blue')}
  </section>`;
}

function bindCopy() {
  const button = document.querySelector('[data-copy-spn-handoff]');
  if (!button || button.dataset.bound === '1') return;
  button.dataset.bound = '1';
  button.addEventListener('click', () => {
    const text = clean(snapshotViewModel().handoffText);
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
  const existing = document.querySelector('[data-spn-handoff-snapshot]');
  const view = snapshotViewModel();
  const key = snapshotKey(view);
  const html = blockHtml(view);

  if (!html) {
    existing?.remove();
    return;
  }

  if (existing) {
    if (existing.dataset.snapshotKey !== key) existing.outerHTML = html;
    bindCopy();
    return;
  }

  const target = findInsertTarget();
  if (!target) return;
  if (target.mode === 'after') target.node.insertAdjacentHTML('afterend', html);
  else target.node.insertAdjacentHTML('afterbegin', html);
  bindCopy();
}

export function applyDealCardSpnHandoff(data) {
  try {
    cardData = data;
    render();
  } catch (_) {
    // Этот helper является необязательным дополнением и не должен ломать карточку.
  }
}
