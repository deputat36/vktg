const DRAFT_KEY = 'nav_deal_draft_v2';
const CARD_ID = 'spnWizardModeCard';
const STYLE_ID = 'spnWizardModeStyle';

const modes = {
  fast: {
    title: 'Быстро',
    level: 'expert',
    badge: 'опытный СПН',
    text: 'Минимум объяснений. Быстро заполнить ключевые поля, увидеть риски и передать дальше.'
  },
  guided: {
    title: 'С подсказками',
    level: 'novice',
    badge: 'новичок',
    text: 'Пошагово, с объяснениями: что спросить у клиента, почему это важно и что нельзя пропустить.'
  },
  legal: {
    title: 'Для юриста',
    level: 'standard',
    badge: 'юридическая передача',
    text: 'Собрать суть сделки, риски, пробелы и вопрос юристу до задатка или сложного условия.'
  },
  minimal: {
    title: 'Минимум',
    level: 'standard',
    badge: 'первичная заявка',
    text: 'Когда есть только клиент или неполная информация. Не перегружаем сделочной анкетой.'
  }
};

let scheduled = false;
let defaultModeSynced = false;

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function writeDraft(patch) {
  const draft = { ...readDraft(), ...patch };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  return draft;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function currentMode(draft = readDraft()) {
  return modes[draft.wizardMode] ? draft.wizardMode : 'guided';
}

function setCoreField(name, value) {
  let input = document.querySelector(`[data-spn-mode-core-field="${name}"]`);
  if (!input) {
    input = document.createElement('input');
    input.type = 'hidden';
    input.dataset.field = name;
    input.dataset.spnModeCoreField = name;
    document.body.appendChild(input);
  }
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function syncModeToCore(mode, config) {
  setCoreField('wizardMode', mode);
  setCoreField('spnExperienceLevel', config.level);
}

function saveMode(mode) {
  const config = modes[mode] || modes.guided;
  writeDraft({ wizardMode: mode, spnExperienceLevel: config.level });
  syncModeToCore(mode, config);
  applyBodyClass(mode);
  schedule();
}

function applyBodyClass(mode) {
  document.body.classList.remove('spn-mode-fast', 'spn-mode-guided', 'spn-mode-legal', 'spn-mode-minimal');
  document.body.classList.add(`spn-mode-${mode}`);
}

function boolText(value) {
  if (value === true) return 'да';
  if (value === false) return 'нет';
  return 'не указано';
}

function hasAny(draft, key) {
  return Array.isArray(draft[key]) && draft[key].length > 0;
}

function missingItems(draft) {
  const items = [];
  if (!draft.preparationMode) items.push('что готовим: консультацию, задаток, сделку или проверку документов');
  if (!draft.representation) items.push('кого сопровождаем: продавца, покупателя, обе стороны или партнёрскую сделку');
  if (!draft.stage) items.push('на какой стадии находится ситуация');
  if (!draft.objectType && draft.stage !== 'lead_only') items.push('тип объекта');
  if (!draft.address && draft.stage !== 'lead_only') items.push('адрес или ориентир');
  if (!draft.priceTotal && !['lead_only', 'legal_problem'].includes(draft.stage)) items.push('цену объекта или ориентир');
  if ((draft.hasSeller || ['seller', 'one_spn_both', 'both'].includes(draft.representation)) && !hasAny(draft, 'flags') && !hasAny(draft, 'basis') && !draft.sellerComment) items.push('продавца и основание права');
  if ((draft.hasBuyer || ['buyer', 'one_spn_both', 'both'].includes(draft.representation)) && !hasAny(draft, 'payments') && !draft.buyerComment) items.push('покупателя и источник денег');
  if ((draft.preparationMode === 'deposit' || draft.stage === 'urgent_deposit') && draft.expensesAgreed !== true && draft.expensesAgreed !== false) items.push('расходы сторон');
  if ((draft.preparationMode === 'deposit' || draft.stage === 'urgent_deposit') && draft.settlementsAgreed !== true && draft.settlementsAgreed !== false) items.push('порядок расчётов');
  return items;
}

function triggers(draft) {
  const flags = Array.isArray(draft.flags) ? draft.flags : [];
  const payments = Array.isArray(draft.payments) ? draft.payments : [];
  const basis = Array.isArray(draft.basis) ? draft.basis : [];
  const items = [];
  if (flags.some((item) => ['minorSeller', 'minorBuyer', 'minorRegistered'].includes(item)) || payments.some((item) => ['matcap', 'nominalChild', 'svoChildAccount'].includes(item))) items.push('дети, маткапитал или детские деньги — юрист до задатка');
  if (flags.includes('powerOfAttorney')) items.push('доверенность — проверить полномочия и право получения денег');
  if (flags.includes('shares') || draft.legalForm === 'share' || draft.objectType === 'share') items.push('доля — нотариус, сособственники, порядок пользования');
  if (basis.some((item) => ['inheritLaw', 'inheritWill', 'privat', 'court'].includes(item))) items.push('основание права требует юридической проверки');
  if (payments.some((item) => ['mortgage', 'militaryMortgage', 'matcap', 'certificate'].includes(item))) items.push('ипотека, сертификат или маткапитал — подключить брокера');
  if (Array.isArray(draft.settlements) && draft.settlements.includes('afterRegistration')) items.push('расчёт после регистрации — нужна защита продавца');
  if (draft.objectType === 'flat_ground') items.push('квартира на земле — проверить землю, вход, коммуникации и статус дома');
  if (draft.objectType === 'house_land') items.push('дом с участком — проверить дом и землю отдельно');
  return items;
}

function nextQuestion(draft, missing) {
  if (!missing.length) return 'Основная информация собрана. Проверьте итоговый экран и текст передачи.';
  const first = missing[0];
  if (first.includes('что готовим')) return 'Сначала определите цель: консультация, задаток, сделка или проверка документов.';
  if (first.includes('кого сопровождаем')) return 'Уточните, чью сторону ведём. От этого зависит, какие блоки показывать дальше.';
  if (first.includes('тип объекта')) return 'Выберите физический тип объекта. Долю отмечайте отдельно как юридическую форму, а не как тип недвижимости.';
  if (first.includes('продавца')) return 'Спросите, кто собственник, на каком основании владеет и кто будет подписывать документы.';
  if (first.includes('покупателя')) return 'Спросите, кто покупает, откуда деньги и есть ли ипотека, маткапитал или сертификат.';
  if (first.includes('расходы')) return 'До задатка зафиксируйте, кто оплачивает комиссию, нотариуса, банк, справки и госпошлину.';
  if (first.includes('расчётов')) return 'До задатка зафиксируйте, когда продавец получает деньги и как защищены стороны.';
  return `Уточните: ${first}.`;
}

function minimalChecklist(draft) {
  return [
    ['Кто клиент', draft.clientName || draft.sellerName || draft.buyerName],
    ['Телефон', draft.clientPhone || draft.sellerPhone || draft.buyerPhone],
    ['Что хочет', draft.clientRequest || draft.clientNextStep || draft.objectComment],
    ['Объект / район / бюджет', draft.address || draft.priceTotal],
    ['Следующий шаг', draft.clientNextStep]
  ];
}

function lawyerSummary(draft, missing, risks) {
  return [
    `Объект: ${draft.objectType || 'не указан'}${draft.address ? `, ${draft.address}` : ''}`,
    `Цена: ${draft.priceTotal || 'не указана'}`,
    `Продавец: ${draft.sellerComment || (hasAny(draft, 'basis') ? 'основание права отмечено' : 'нет подробностей')}`,
    `Покупатель / деньги: ${draft.moneyComment || (hasAny(draft, 'payments') ? 'источник денег отмечен' : 'нет подробностей')}`,
    `Расходы согласованы: ${boolText(draft.expensesAgreed)}`,
    `Расчёты согласованы: ${boolText(draft.settlementsAgreed)}`,
    risks.length ? `Риски: ${risks.join('; ')}` : 'Риски: критичные признаки пока не отмечены',
    missing.length ? `Пробелы: ${missing.join('; ')}` : 'Пробелы: ключевые поля заполнены',
    `Вопрос юристу: ${draft.lawyerQuestion || 'не указан'}`
  ].join('\n');
}

function modeAdvice(mode, draft, missing, risks) {
  if (mode === 'fast') {
    return `<div class="status ok"><b>Быстрый режим.</b> Заполните только то, что влияет на маршрут: объект, стороны, деньги, расходы, расчёты, риски. Подсказки ниже можно не читать.</div>
    ${missing.length ? `<div class="status warn"><b>Минимум перед сохранением:</b> ${esc(missing.slice(0, 4).join('; '))}</div>` : '<div class="status ok">Ключевой минимум собран. Проверьте итог и сохраняйте.</div>'}`;
  }

  if (mode === 'minimal') {
    const rows = minimalChecklist(draft).map(([label, value]) => `<div class="list-item"><b>${esc(label)}</b>${value ? `<span class="pill green">есть</span>` : '<span class="pill yellow">не заполнено</span>'}</div>`).join('');
    return `<div class="status warn"><b>Минимальная заявка.</b> Подходит, если ещё нет полной сделки. Не нужно заполнять всё — достаточно зафиксировать клиента и следующий шаг.</div><div class="list">${rows}</div>`;
  }

  if (mode === 'legal') {
    return `<div class="status warn"><b>Режим для юриста.</b> Главная задача — передать не поток мыслей, а короткую юридическую суть: объект, стороны, основание права, деньги, риски и вопрос.</div>
    <div class="field"><label>Вопрос юристу</label><textarea data-field="lawyerQuestion" placeholder="Например: можно ли идти к задатку при такой схеме расчётов / доле / детских деньгах?">${esc(draft.lawyerQuestion || '')}</textarea></div>
    <details class="status" open><summary><b>Черновик передачи юристу</b></summary><pre style="white-space:pre-wrap;margin:10px 0 0;font-family:inherit">${esc(lawyerSummary(draft, missing, risks))}</pre></details>`;
  }

  return `<div class="status ok"><b>Режим с подсказками.</b> Заполняйте по шагам. Если сомневаетесь — ориентируйтесь на следующий вопрос ниже.</div>
  <div class="status warn"><b>Что спросить сейчас:</b> ${esc(nextQuestion(draft, missing))}</div>
  ${risks.length ? `<div class="status warn"><b>На что обратить внимание:</b> ${esc(risks.join('; '))}</div>` : '<div class="status ok">Критичные признаки пока не отмечены. Продолжайте по шагам.</div>'}`;
}

function modeButtons(mode) {
  return Object.entries(modes).map(([key, item]) => `<button class="btn ${mode === key ? 'primary' : 'light'}" type="button" data-spn-wizard-mode="${key}">${esc(item.title)}</button>`).join('');
}

function progressLine(missing) {
  if (!missing.length) return '<span class="pill green">минимум собран</span>';
  if (missing.length <= 3) return `<span class="pill yellow">осталось: ${missing.length}</span>`;
  return `<span class="pill red">пробелов: ${missing.length}</span>`;
}

function html(draft) {
  const mode = currentMode(draft);
  const config = modes[mode];
  const missing = missingItems(draft);
  const risks = triggers(draft);
  return `<section class="card" id="${CARD_ID}" style="border:1px solid rgba(37,99,235,.22)">
    <div class="section-title">
      <div><span class="pill blue">Режим мастера</span><h2 style="margin:8px 0 4px">${esc(config.title)}</h2><p class="muted" style="margin:0">${esc(config.text)}</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end"><span class="pill green">${esc(config.badge)}</span>${progressLine(missing)}</div>
    </div>
    <div class="actions" style="justify-content:flex-start;margin:12px 0">${modeButtons(mode)}</div>
    <input type="hidden" data-field="wizardMode" data-spn-mode-core-field="wizardMode" value="${esc(mode)}">
    <input type="hidden" data-field="spnExperienceLevel" data-spn-mode-core-field="spnExperienceLevel" value="${esc(config.level)}">
    ${modeAdvice(mode, draft, missing, risks)}
  </section>`;
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .spn-mode-fast #app details.status:not(#spnWizardModeCard details) { display:none; }
    .spn-mode-fast #spnWizardModeCard details.status { display:block; }
    #spnWizardModeCard pre { background:rgba(15,23,42,.04); padding:12px; border-radius:12px; border:1px solid rgba(15,23,42,.08); }
    #spnWizardModeCard .btn.primary { box-shadow:0 0 0 2px rgba(37,99,235,.12); }
  `;
  document.head.appendChild(style);
}

function inject() {
  ensureStyle();
  const shell = document.querySelector('#app .nav-v2-shell');
  if (!shell) return;
  let draft = readDraft();
  const mode = currentMode(draft);
  const config = modes[mode];
  if (!defaultModeSynced && (!draft.wizardMode || !draft.spnExperienceLevel)) {
    defaultModeSynced = true;
    draft = writeDraft({ wizardMode: mode, spnExperienceLevel: config.level });
    syncModeToCore(mode, config);
  }
  applyBodyClass(mode);

  let card = document.getElementById(CARD_ID);
  const markup = html(draft);
  if (!card) {
    const hero = shell.querySelector('.hero');
    if (hero) hero.insertAdjacentHTML('afterend', markup);
    else shell.insertAdjacentHTML('afterbegin', markup);
  } else {
    card.outerHTML = markup;
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => { scheduled = false; inject(); }, 120);
}

document.addEventListener('click', (event) => {
  const modeButton = event.target?.closest?.('[data-spn-wizard-mode]');
  if (!modeButton) { schedule(); return; }
  event.preventDefault();
  event.stopPropagation();
  saveMode(modeButton.dataset.spnWizardMode);
}, true);

document.addEventListener('input', (event) => {
  if (event.target?.closest?.(`#${CARD_ID}`)) return;
  schedule();
}, true);
document.addEventListener('change', schedule, true);
window.addEventListener('storage', schedule);

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  inject();
  if (document.getElementById(CARD_ID) || attempts >= 40) clearInterval(timer);
}, 150);
