import { rpc, esc, getCachedUser, getMyProfile } from './supabase-v2.js';

const dealId = new URLSearchParams(location.search).get('id');
let handoffText = '';
let readiness = null;
let userRole = '';
let dealStatus = '';
let loaded = false;

function snapshotOf(cardData) {
  return cardData?.deal?.wizard_snapshot || {};
}

function readHandoffText(cardData) {
  const snapshot = snapshotOf(cardData);
  return snapshot?.deal?.spn_final?.handoff_text
    || snapshot?.deal?.handoff_text
    || snapshot?.spn_final?.handoff_text
    || '';
}

function readReadiness(cardData) {
  const snapshot = snapshotOf(cardData);
  const local = snapshot?.deal?.readiness_local || snapshot?.readiness_local || null;
  if (!local) return null;
  return {
    lawyer: Number(local.lawyer || 0),
    deposit: Number(local.deposit || 0),
    missing: Array.isArray(local.missing) ? local.missing : [],
    blockers: Array.isArray(local.blockers) ? local.blockers : []
  };
}

function hasRework() {
  return Boolean(readiness && (readiness.blockers.length || readiness.missing.length));
}

function canManageRework() {
  return ['owner', 'admin', 'manager', 'lawyer'].includes(String(userRole || '').toLowerCase());
}

function reworkText() {
  if (!readiness) return '';
  const lines = [
    'Что нужно доработать по заявке перед юристом/задатком',
    '',
    `Готовность к юристу: ${readiness.lawyer}%`,
    `Готовность к задатку: ${readiness.deposit}%`
  ];

  if (readiness.blockers.length) {
    lines.push('', 'Стоп-вопросы:');
    readiness.blockers.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  }

  if (readiness.missing.length) {
    lines.push('', 'Что нужно дозаполнить:');
    readiness.missing.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  }

  if (!hasRework()) {
    lines.push('', 'Ключевых пробелов по анкете СПН не найдено.');
    return lines.join('\n');
  }

  lines.push('', 'После доработки обнови карточку и добавь комментарий, что именно исправлено.');
  return lines.join('\n');
}

function readinessActionsHtml() {
  if (!hasRework()) {
    return '<div class="status ok">По сохраненной анкете СПН нет пробелов для возврата на доработку.</div>';
  }
  const managerActions = canManageRework() ? `
    <button id="insertCardReworkComment" class="btn light" type="button">Вставить доработки в комментарий</button>
    <button id="sendCardReworkComment" class="btn light" type="button">Сразу добавить комментарий</button>
    <button id="returnSpnWithRework" class="btn red" type="button">Вернуть СПН на доработку</button>` : '';
  const roleNote = canManageRework() ? '' : '<div class="status warn">У вас есть список пробелов, но возврат СПН на доработку доступен только юристу, менеджеру, админу или владельцу.</div>';
  return `${roleNote}<div class="actions" style="justify-content:flex-start">
    <button id="copyCardReworkList" class="btn light" type="button">Скопировать список доработок</button>
    ${managerActions}
  </div>`;
}

function readinessHtml() {
  if (!readiness) return '';
  const lawyerCls = readiness.lawyer >= 70 ? 'green' : 'yellow';
  const depositCls = readiness.deposit >= 80 && !readiness.blockers.length ? 'green' : 'yellow';
  return `<div class="card" style="box-shadow:none;margin-top:12px;background:#f8fafc">
    <h3>Что было не готово при сохранении СПН</h3>
    <div class="kpi-row">
      <div class="metric ${lawyerCls}"><span>К юристу</span><b>${readiness.lawyer}%</b></div>
      <div class="metric ${depositCls}"><span>К задатку</span><b>${readiness.deposit}%</b></div>
      <div class="metric ${readiness.blockers.length ? 'red' : 'green'}"><span>Стоп-вопросы</span><b>${readiness.blockers.length}</b></div>
      <div class="metric ${readiness.missing.length ? 'yellow' : 'green'}"><span>Пробелы</span><b>${readiness.missing.length}</b></div>
    </div>
    ${readiness.blockers.length ? `<div class="status error"><b>Стоп-вопросы:</b><br>${readiness.blockers.map((item) => `• ${esc(item)}`).join('<br>')}</div>` : '<div class="status ok">Стоп-вопросов по анкете СПН при сохранении не было.</div>'}
    ${readiness.missing.length ? `<div class="list"><div class="list-item"><b>Что СПН не дозаполнил:</b><p class="muted">${esc(readiness.missing.join(' / '))}</p></div></div>` : '<div class="list"><div class="list-item"><b>Ключевые поля анкеты были заполнены</b></div></div>'}
    ${readinessActionsHtml()}
  </div>`;
}

function reworkTopAlertHtml() {
  if (dealStatus !== 'need_info' || !hasRework()) return '';
  return `<section id="spnReworkTopAlert" class="card" style="border:2px solid rgba(220,38,38,.28);background:#fff7f7">
    <div class="section-title">
      <div>
        <h2>Сделка возвращена на доработку</h2>
        <p class="muted">Карточка находится в статусе «Нужно дозаполнить». Исправьте пробелы ниже, затем добавьте комментарий, что именно доработано.</p>
      </div>
      <span class="pill red">нужно дозаполнить</span>
    </div>
    ${readiness.blockers.length ? `<div class="status error"><b>Стоп-вопросы:</b><br>${readiness.blockers.map((item) => `• ${esc(item)}`).join('<br>')}</div>` : ''}
    ${readiness.missing.length ? `<div class="list"><div class="list-item"><b>Что исправить:</b><p class="muted">${esc(readiness.missing.join(' / '))}</p></div></div>` : ''}
    <div class="actions" style="justify-content:flex-start">
      <button id="copyTopReworkList" class="btn light" type="button">Скопировать список доработок</button>
      <button id="scrollToHandoffPanel" class="btn primary" type="button">Перейти к подробностям</button>
    </div>
  </section>`;
}

function panelHtml(text) {
  const textBlock = text ? `<textarea id="cardHandoffText" readonly style="min-height:220px">${esc(text)}</textarea>
    <div class="actions" style="justify-content:flex-start">
      <button id="copyCardHandoffText" class="btn primary" type="button">Скопировать текст</button>
      <button id="openCardComments" class="btn light" type="button">Открыть комментарии</button>
    </div>` : '<div class="status warn">Текст передачи не найден. Возможно, сделка создана до появления финального текста в мастере.</div>';
  return `<section id="handoffTextPanel" class="card" style="border:2px solid rgba(37,99,235,.16)">
    <div class="section-title">
      <div>
        <h2>Передача от СПН юристу</h2>
        <p class="muted">Выжимка из мастера и качество заполнения на момент сохранения заявки. Это помогает юристу и менеджеру быстро понять, что СПН уже собрал, а что осталось неясным.</p>
      </div>
      <span class="pill blue">из мастера СПН</span>
    </div>
    ${readinessHtml()}
    <h3>Текст передачи юристу от СПН</h3>
    ${textBlock}
  </section>`;
}

function openCommentsTab() {
  const tab = document.querySelector('[data-tab="comments"]');
  if (tab) {
    tab.click();
    setTimeout(() => document.querySelector('#addComment, #newComment')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    return;
  }
  location.hash = 'comments';
  location.reload();
}

function setCommentText(text) {
  if (!canManageRework()) return;
  openCommentsTab();
  setTimeout(() => {
    const field = document.getElementById('newComment');
    if (!field) return;
    const current = field.value.trim();
    field.value = current ? `${current}\n\n${text}` : text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 180);
}

async function addReworkComment(button) {
  const text = reworkText();
  if (!canManageRework() || !hasRework() || !text.trim()) return;
  if (!confirm('Сразу добавить список доработок в комментарии к сделке?')) return;
  const defaultText = button.textContent;
  try {
    button.disabled = true;
    button.textContent = 'Добавляю...';
    await rpc('nav_v2_add_comment', { p_deal_id: dealId, p_body: text, p_visibility: 'team' }, 12000);
    button.textContent = 'Комментарий добавлен';
    setTimeout(() => location.reload(), 800);
  } catch (e) {
    button.disabled = false;
    button.textContent = defaultText;
    alert('Не удалось добавить комментарий: ' + e.message);
  }
}

async function returnSpnToRework(button) {
  const text = reworkText();
  if (!canManageRework() || !hasRework() || !text.trim()) return;
  if (!confirm('Добавить список доработок в комментарии и перевести сделку в статус «Нужно дозаполнить»?')) return;
  const defaultText = button.textContent;
  try {
    button.disabled = true;
    button.textContent = 'Возвращаю...';
    await rpc('nav_v2_return_spn_rework', { p_deal_id: dealId, p_body: text }, 12000);
    button.textContent = 'Возвращено СПН';
    setTimeout(() => location.reload(), 800);
  } catch (e) {
    button.disabled = false;
    button.textContent = defaultText;
    alert('Не удалось вернуть на доработку: ' + e.message);
  }
}

async function copyToClipboard(text, button, defaultText) {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Скопировано';
    setTimeout(() => button.textContent = defaultText, 1500);
  } catch (_) {
    button.textContent = 'Не удалось скопировать';
    setTimeout(() => button.textContent = defaultText, 1800);
  }
}

function bindPanelActions() {
  const copy = document.getElementById('copyCardHandoffText');
  if (copy && !copy.dataset.bound) {
    copy.dataset.bound = '1';
    copy.onclick = async () => {
      const field = document.getElementById('cardHandoffText');
      if (!handoffText && field) handoffText = field.value;
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

  const copyRework = document.getElementById('copyCardReworkList');
  if (copyRework && !copyRework.dataset.bound) {
    copyRework.dataset.bound = '1';
    copyRework.onclick = () => copyToClipboard(reworkText(), copyRework, 'Скопировать список доработок');
  }

  const copyTop = document.getElementById('copyTopReworkList');
  if (copyTop && !copyTop.dataset.bound) {
    copyTop.dataset.bound = '1';
    copyTop.onclick = () => copyToClipboard(reworkText(), copyTop, 'Скопировать список доработок');
  }

  const scrollDetails = document.getElementById('scrollToHandoffPanel');
  if (scrollDetails && !scrollDetails.dataset.bound) {
    scrollDetails.dataset.bound = '1';
    scrollDetails.onclick = () => document.getElementById('handoffTextPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const insertRework = document.getElementById('insertCardReworkComment');
  if (insertRework && !insertRework.dataset.bound) {
    insertRework.dataset.bound = '1';
    insertRework.onclick = () => setCommentText(reworkText());
  }

  const sendRework = document.getElementById('sendCardReworkComment');
  if (sendRework && !sendRework.dataset.bound) {
    sendRework.dataset.bound = '1';
    sendRework.onclick = () => addReworkComment(sendRework);
  }

  const returnRework = document.getElementById('returnSpnWithRework');
  if (returnRework && !returnRework.dataset.bound) {
    returnRework.dataset.bound = '1';
    returnRework.onclick = () => returnSpnToRework(returnRework);
  }

  const comments = document.getElementById('openCardComments');
  if (comments && !comments.dataset.bound) {
    comments.dataset.bound = '1';
    comments.onclick = openCommentsTab;
  }
}

function placeTopAlert(main) {
  if (document.getElementById('spnReworkTopAlert')) return;
  const html = reworkTopAlertHtml();
  if (!html) return;
  const anchor = main.querySelector('.hero') || main.firstElementChild;
  if (anchor) anchor.insertAdjacentHTML('afterend', html);
}

function placePanel() {
  if (!handoffText && !readiness) return;
  const main = document.querySelector('main.nav-v2-shell');
  if (!main) return;
  placeTopAlert(main);
  const existing = document.getElementById('handoffTextPanel');
  if (existing) {
    bindPanelActions();
    return;
  }

  const rows = main.querySelectorAll(':scope > .kpi-row');
  const anchor = rows.length ? rows[rows.length - 1] : main.querySelector('.hero');
  if (!anchor) return;
  anchor.insertAdjacentHTML('afterend', panelHtml(handoffText));
  bindPanelActions();
}

async function loadHandoffText() {
  if (loaded || !dealId || !getCachedUser()) return;
  loaded = true;
  try {
    const [cardData, profile] = await Promise.all([
      rpc('nav_v2_get_deal_card', { p_deal_id: dealId }, 12000),
      getMyProfile({ timeout: 6000 }).catch(() => null)
    ]);
    userRole = profile?.role || '';
    dealStatus = cardData?.deal?.status || '';
    handoffText = readHandoffText(cardData);
    readiness = readReadiness(cardData);
    placePanel();
  } catch (_) {
    // Карточка сама покажет ошибку загрузки, если она есть. Helper не должен ломать страницу.
  }
}

new MutationObserver(placePanel).observe(document.body, { childList: true, subtree: true });
loadHandoffText();
