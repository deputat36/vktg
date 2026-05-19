function get(id) { return document.getElementById(id); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
function leftPanel() { return document.querySelector('aside.panel.left'); }
function sections() { return [...document.querySelectorAll('aside.panel.left > section')]; }
function byTitle(text) { return sections().find((section) => section.querySelector('h2')?.textContent?.trim()?.includes(text)); }

const CONFIG = [
  {
    key: 'main',
    title: '1. Участники и ответственность',
    match: 'Основное',
    purpose: 'Кто ведет сделку, кто отвечает за продавца/покупателя, кому юрист и менеджер возвращают замечания.'
  },
  {
    key: 'parties',
    title: '2. Стороны сделки',
    match: 'Стороны сделки',
    purpose: 'Кто подписывает документы, кто получает деньги, есть ли представители, несколько сторон, супруги, дети или особенности по стороне.'
  },
  {
    key: 'object',
    title: '3. Объект и условия передачи',
    match: 'Объект',
    purpose: 'Что продаем по документам, какой кадастровый номер, есть ли земля, какая цена, что остается, когда передаются ключи.'
  },
  {
    key: 'finance',
    title: '4. Комиссии и расходы',
    match: 'Финансы',
    purpose: 'Чтобы до задатка не было спора по комиссии, госпошлине, оценке, СБР, нотариусу, страховкам и прочим расходам.'
  },
  {
    key: 'conditions',
    title: '5. Основания, деньги, расчеты и риски',
    match: 'Основания',
    purpose: 'Главный юридический блок: на каком основании право, за какие средства покупают, как рассчитываются, какие сертификаты, банк и стоп-факторы.'
  },
  {
    key: 'docs',
    title: '6. Документы и вопрос юристу',
    match: 'Документы',
    purpose: 'Статус ЕГРН, справки о зарегистрированных, папки документов и конкретного вопроса юристу.'
  }
];

function sectionByKey(key) {
  const cfg = CONFIG.find((item) => item.key === key);
  return cfg ? byTitle(cfg.match) : null;
}

function ensureMap() {
  if (get('detailedFormMap')) return;
  const panel = leftPanel();
  const firstDetail = byTitle('Основное');
  if (!panel || !firstDetail) return;
  const map = document.createElement('div');
  map.id = 'detailedFormMap';
  map.className = 'detailed-form-map';
  map.innerHTML = `
    <h2>Подробные поля</h2>
    <p>Резервный режим для сложных случаев. Новичку лучше идти по мастеру, опытный СПН может быстро открыть нужный блок.</p>
    <div class="detail-nav">
      ${CONFIG.map((item) => `<button type="button" data-detail-jump="${esc(item.key)}">${esc(item.title)}</button>`).join('')}
    </div>
    <div class="detail-details-actions">
      <button type="button" id="btnDetailCollapseHints">Скрыть подсказки</button>
      <button type="button" id="btnDetailShowHints">Показать подсказки</button>
      <button type="button" id="btnDetailToWizard">Вернуться к мастеру</button>
    </div>
  `;
  firstDetail.insertAdjacentElement('beforebegin', map);
  map.querySelectorAll('[data-detail-jump]').forEach((button) => {
    button.onclick = () => jumpTo(button.dataset.detailJump);
  });
  get('btnDetailCollapseHints').onclick = () => document.body.dataset.detailHints = '0';
  get('btnDetailShowHints').onclick = () => document.body.dataset.detailHints = '1';
  get('btnDetailToWizard').onclick = () => {
    document.body.dataset.smartFlow = 'simple';
    const note = get('smartModeNote');
    if (note) note.textContent = 'Режим: простой';
    get('smartDealIntake')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

function jumpTo(key) {
  const section = sectionByKey(key);
  if (!section) return;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  sections().forEach((item) => item.classList.remove('flash'));
  section.classList.add('flash');
  document.querySelectorAll('[data-detail-jump]').forEach((button) => button.classList.toggle('active', button.dataset.detailJump === key));
  setTimeout(() => section.classList.remove('flash'), 1200);
}

function decorateSections() {
  CONFIG.forEach((cfg, index) => {
    const section = byTitle(cfg.match);
    if (!section || section.dataset.detailOrganized) return;
    section.dataset.detailOrganized = '1';
    section.dataset.detailKey = cfg.key;
    section.classList.add('detail-organized');
    const h2 = section.querySelector('h2');
    if (h2) {
      const head = document.createElement('div');
      head.className = 'detail-section-head';
      head.innerHTML = `<div><h2>${esc(cfg.title)}</h2></div><span class="detail-order">${index + 1}</span>`;
      h2.replaceWith(head);
    }
    const purpose = document.createElement('div');
    purpose.className = 'detail-purpose';
    purpose.innerHTML = `<b>Зачем этот блок:</b> ${esc(cfg.purpose)}`;
    const insertAfter = section.querySelector('.detail-section-head') || section.firstElementChild;
    insertAfter?.insertAdjacentElement('afterend', purpose);
  });
}

function wrapBetween(section, startHeaderText, cls, help) {
  if (!section) return;
  const headers = [...section.querySelectorAll(':scope > h3')];
  const header = headers.find((h) => h.textContent.trim().includes(startHeaderText));
  if (!header || header.parentElement.classList.contains('detail-subgroup')) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'detail-subgroup ' + (cls || '');
  header.insertAdjacentElement('beforebegin', wrapper);
  wrapper.appendChild(header);
  if (help) {
    const p = document.createElement('div');
    p.className = 'detail-subgroup-help';
    p.textContent = help;
    wrapper.appendChild(p);
  }
  let next = wrapper.nextSibling;
  while (next) {
    const current = next;
    next = next.nextSibling;
    if (current.nodeType === 1 && current.tagName === 'H3') break;
    wrapper.appendChild(current);
  }
}

function organizeConditionSection() {
  const section = byTitle('Основания');
  if (!section || section.dataset.subgroupsReady) return;
  section.dataset.subgroupsReady = '1';
  wrapBetween(section, 'Основания', 'blue', 'Документ основания показывает, как продавец получил право. Не заменяйте его одной выпиской ЕГРН.');
  wrapBetween(section, 'Расчет', 'good', 'Источник денег: свои средства, ипотека, маткапитал, субсидии, НИС, детские средства.');
  wrapBetween(section, 'Сертификаты', 'warning', 'Сертификаты и субсидии влияют на сроки, договор, требования к объекту и порядок перечисления.');
  wrapBetween(section, 'Особенности', 'danger', 'Отмечайте все риски: дети, доверенность, обременение, доли, цена, зарегистрированные, банкротство.');

  const bankType = get('bankType')?.closest('label');
  const bankInfo = get('bankInfo')?.closest('label');
  const certGroup = [...section.querySelectorAll('.detail-subgroup')].find((group) => group.textContent.includes('Сертификаты'));
  if (certGroup && bankType && bankType.parentElement !== certGroup) certGroup.appendChild(bankType);
  if (certGroup && bankInfo && bankInfo.parentElement !== certGroup) certGroup.appendChild(bankInfo);
}

function organizeFinanceSection() {
  const section = byTitle('Финансы');
  if (!section || section.dataset.subgroupsReady) return;
  section.dataset.subgroupsReady = '1';
  wrapBetween(section, 'Комиссии', 'good', 'Комиссия и распределение должны быть понятны до задатка, особенно если в сделке два СПН.');
  wrapBetween(section, 'Расходы сделки', 'warning', 'Расходы лучше проговорить до сделки: госпошлина, земля, оценка, СБР, нотариус, страховки, прочее.');
}

function organizeDocsSection() {
  const section = byTitle('Документы');
  if (!section || section.dataset.docsOrganized) return;
  section.dataset.docsOrganized = '1';
  const group = document.createElement('div');
  group.className = 'detail-subgroup blue';
  group.innerHTML = '<h3>Статус документов</h3><div class="detail-subgroup-help">Для юриста важно не только наличие документа, но и статус: запрошено, получено, проверено, не подходит.</div>';
  const labels = [...section.querySelectorAll(':scope > label')];
  if (labels.length) {
    labels[0].insertAdjacentElement('beforebegin', group);
    labels.forEach((label) => group.appendChild(label));
  }
}

function bindScrollSpy() {
  if (window.__detailScrollSpyBound) return;
  window.__detailScrollSpyBound = true;
  window.addEventListener('scroll', () => {
    let active = null;
    CONFIG.forEach((cfg) => {
      const section = byTitle(cfg.match);
      if (section && section.getBoundingClientRect().top < 180) active = cfg.key;
    });
    document.querySelectorAll('[data-detail-jump]').forEach((button) => button.classList.toggle('active', button.dataset.detailJump === active));
  }, { passive: true });
}

function start() {
  ensureMap();
  decorateSections();
  organizeFinanceSection();
  organizeConditionSection();
  organizeDocsSection();
  bindScrollSpy();
  if (!document.body.dataset.detailHints) document.body.dataset.detailHints = '1';
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (leftPanel() && get('objectType') && get('basisBox') && get('stEgrn')) {
    clearInterval(timer);
    start();
  }
  if (attempts > 80) clearInterval(timer);
}, 200);
