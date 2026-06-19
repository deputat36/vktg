const GUIDE_ID = 'spnScenarioGuide';

const scenarios = [
  {
    title: 'Первичный клиент / консультация',
    route: 'Что готовим → консультация. Стадия → есть только клиент.',
    ask: 'Зафиксировать запрос, контакт, бюджет/ожидание и следующий шаг. Не грузить сделочной анкетой.'
  },
  {
    title: 'Срочный задаток',
    route: 'Что готовим → задаток. Стадия → срочно готовим задаток.',
    ask: 'Цена, сумма, дата, кто получает деньги, расходы, расчёты и стоп-факторы до подписания.'
  },
  {
    title: 'Сопровождаем обе стороны',
    route: 'Кого сопровождаем → покупателя и продавца.',
    ask: 'Заполнить и продавца, и покупателя: право, деньги, условия, расходы, расчёты, кто принимает решения.'
  },
  {
    title: 'Только продавец',
    route: 'Кого сопровождаем → только продавца.',
    ask: 'Собственники, основание права, супруг, дети, доли, доверенность, документы и готовность к задатку.'
  },
  {
    title: 'Только покупатель',
    route: 'Кого сопровождаем → только покупателя.',
    ask: 'Деньги покупателя, ипотека, маткапитал, сертификат, цепочка продажи своего объекта, сроки.'
  },
  {
    title: 'Доля',
    route: 'Объект → доля.',
    ask: 'Размер доли, сособственники, уведомления/отказы, нотариус, кто платит расходы.'
  },
  {
    title: 'Комната',
    route: 'Объект → комната.',
    ask: 'Не путать с долей: статус комнаты, места общего пользования, соседи, зарегистрированные лица.'
  },
  {
    title: 'Квартира на земле',
    route: 'Объект → квартира → квартира на земле.',
    ask: 'Земля, статус дома, отдельный вход, коммуникации, порядок пользования, документы на участок.'
  }
];

function cardHtml(item) {
  return `<details class="status" style="margin:8px 0 0">
    <summary><b>${item.title}</b></summary>
    <div style="margin-top:8px;line-height:1.5">
      <p style="margin:0 0 6px"><b>Как выбрать:</b> ${item.route}</p>
      <p style="margin:0"><b>Что выяснить:</b> ${item.ask}</p>
    </div>
  </details>`;
}

function injectGuide() {
  const appShell = document.querySelector('#app .nav-v2-shell');
  if (!appShell) return;
  if (document.getElementById(GUIDE_ID)) return;

  const guide = document.createElement('section');
  guide.id = GUIDE_ID;
  guide.className = 'card';
  guide.innerHTML = `<div class="section-title">
    <div>
      <span class="pill blue">Памятка</span>
      <h2>Как выбирать сценарий</h2>
      <p class="muted" style="margin:6px 0 0">Короткие подсказки для типовых ситуаций. Можно открыть только нужный пункт.</p>
    </div>
  </div>${scenarios.map(cardHtml).join('')}`;

  const hero = appShell.querySelector('.hero');
  if (hero && hero.nextSibling) appShell.insertBefore(guide, hero.nextSibling);
  else appShell.prepend(guide);
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  injectGuide();
  if (document.getElementById(GUIDE_ID) || attempts >= 30) clearInterval(timer);
}, 150);

document.addEventListener('click', () => setTimeout(injectGuide, 80), true);
