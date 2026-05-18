const PRESETS = [
  {
    id: 'both_sides_two_spn',
    title: 'Два СПН: продавец и покупатель',
    hint: 'Классическая сделка: один СПН ведет продавца, второй — покупателя.',
    seller: 'our_spn',
    buyer: 'our_spn'
  },
  {
    id: 'both_sides_one_spn',
    title: 'Один СПН ведет обе стороны',
    hint: 'Один специалист представляет интересы обеих сторон внутри компании.',
    seller: 'our_spn',
    buyer: 'our_spn'
  },
  {
    id: 'seller_only',
    title: 'Мы представляем продавца',
    hint: 'Покупатель пришел сам или его ведет другое агентство.',
    seller: 'our_spn',
    buyer: 'client_self'
  },
  {
    id: 'buyer_only',
    title: 'Мы представляем покупателя',
    hint: 'Продавец сам или его ведет другое агентство.',
    seller: 'client_self',
    buyer: 'our_spn'
  },
  {
    id: 'external_agency',
    title: 'Сделка с другим агентством',
    hint: 'Одна из сторон или обе стороны взаимодействуют через партнера/другое агентство.',
    seller: 'external_agency',
    buyer: 'our_spn'
  }
];

function loadStylesheet() {
  if (document.querySelector('link[href="./assets/css/cooperation.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/css/cooperation.css';
  document.head.appendChild(link);
}

function get(id) { return document.getElementById(id); }
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function findMainSection() {
  return [...document.querySelectorAll('aside.panel.left > section')].find((section) => section.textContent.includes('Основное'));
}

function ensureSection() {
  if (get('cooperationModeSection')) return;
  const main = findMainSection();
  if (!main) return;

  const section = document.createElement('section');
  section.id = 'cooperationModeSection';
  section.className = 'cooperation-section';
  section.dataset.step = 'main';
  section.innerHTML = `
    <h2>🤝 Формат сделки</h2>
    <p class="small">Выберите простой вариант. Это нужно не для бюрократии, а чтобы юрист, брокер и второй СПН сразу понимали, кто кого ведет и кому что возвращать.</p>
    <input type="hidden" id="representationModel" value="both_sides_two_spn">
    <input type="hidden" id="sellerRepresentation" value="our_spn">
    <input type="hidden" id="buyerRepresentation" value="our_spn">
    <div class="cooperation-presets">
      ${PRESETS.map((preset) => `<button type="button" class="cooperation-preset" data-cooperation-preset="${preset.id}"><span><b>${esc(preset.title)}</b><br><small>${esc(preset.hint)}</small></span></button>`).join('')}
    </div>
    <button type="button" id="btnCooperationDetails" class="light">Уточнить детали</button>
    <div id="cooperationDetails" class="cooperation-details" hidden>
      <div class="row">
        <label>Кто отвечает за подготовку задатка/сделки<input id="preparationOwner" placeholder="по умолчанию: тот, кто заполняет"></label>
        <label>Кто отвечает за документы<input id="documentsOwner" placeholder="например: СПН продавца"></label>
      </div>
      <div class="row">
        <label>Если продавца ведет другое агентство<input id="sellerPartnerName" placeholder="название / контакт / агент"></label>
        <label>Если покупателя ведет другое агентство<input id="buyerPartnerName" placeholder="название / контакт / агент"></label>
      </div>
      <label>Комментарий по взаимодействию<textarea id="teamComment" placeholder="Например: покупателя ведет сторонний агент, документы продавца собирает СПН продавца, задаток готовит СПН покупателя..."></textarea></label>
    </div>
    <div id="cooperationHint" class="cooperation-help"></div>
  `;

  main.insertAdjacentElement('afterend', section);

  section.querySelectorAll('[data-cooperation-preset]').forEach((button) => {
    button.onclick = () => applyPreset(button.dataset.cooperationPreset);
  });
  get('btnCooperationDetails').onclick = () => {
    const details = get('cooperationDetails');
    details.hidden = !details.hidden;
    get('btnCooperationDetails').textContent = details.hidden ? 'Уточнить детали' : 'Скрыть детали';
  };
  applyPreset(get('representationModel').value || 'both_sides_two_spn');
}

function applyPreset(id) {
  const preset = PRESETS.find((item) => item.id === id) || PRESETS[0];
  get('representationModel').value = preset.id;
  get('sellerRepresentation').value = preset.seller;
  get('buyerRepresentation').value = preset.buyer;
  document.querySelectorAll('[data-cooperation-preset]').forEach((button) => button.classList.toggle('active', button.dataset.cooperationPreset === preset.id));
  get('cooperationHint').textContent = preset.hint + ' Подсказки, задачи и карточка юристу будут учитывать этот формат.';

  const buyerSpn = get('buyerSpn');
  const sellerSpn = get('sellerSpn');
  if (preset.id === 'both_sides_one_spn' && buyerSpn && sellerSpn) buyerSpn.value = sellerSpn.value;
}

function start() {
  loadStylesheet();
  ensureSection();
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (findMainSection()) {
    clearInterval(timer);
    start();
  }
  if (attempts > 60) clearInterval(timer);
}, 200);
