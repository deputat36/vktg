const STEPS = [
  {
    title: 'Что готовим?',
    help: 'Определяем цель: задаток, сделка, проверка или ипотечный сценарий.',
    training: {
      why: ['Задаток, сделка и предварительная проверка требуют разной глубины подготовки.', 'Если цель выбрана неверно, юрист получит неправильный уровень срочности.'],
      ask: ['Мы сейчас только проверяем объект или уже планируем задаток?', 'Есть ли уже договоренность по цене и срокам?', 'Есть ли ипотека, сертификаты или другие сложные деньги?'],
      mistake: ['Новички часто обещают задаток до проверки документов.', 'Путают “хочу купить” и “готов выйти на задаток”.'],
      call: ['Юриста — если уже планируется задаток.', 'Брокера — если есть ипотека или банк.', 'Менеджера — если есть конфликт, дети, сложные деньги или нестандартный объект.']
    }
  },
  {
    title: 'Кого представляем?',
    help: 'Это определяет ответственность, доступы, задачи и кому юрист возвращает замечания.',
    training: {
      why: ['В одной сделке может быть два СПН: один со стороны продавца, другой со стороны покупателя.', 'Важно сразу понимать, за какую сторону отвечает компания и кто собирает документы.'],
      ask: ['Мы ведем продавца, покупателя или обе стороны?', 'Есть ли другое агентство?', 'Кто будет передавать документы юристу?', 'Кому юрист должен вернуть замечания?'],
      mistake: ['Не фиксируют ответственного, и потом юрист не понимает, кому задавать вопросы.', 'Оба СПН думают, что документы собирает другой.'],
      call: ['Менеджера — если ответственность между СПН не определена.', 'Юриста — если другая сторона отказывается давать документы или спорит по условиям.']
    }
  },
  {
    title: 'Что продаем по документам?',
    help: 'Выбирайте не бытовое название, а то, что ближе к документам: квартира, доля, дом+земля, СНТ, уступка.',
    training: {
      why: ['Тип объекта определяет документы, банк, риски, регистрацию и возможность задатка.', 'Дом без земли, квартира в частном секторе и доля — это не обычные квартиры.'],
      ask: ['Что указано в ЕГРН?', 'Есть ли отдельный кадастровый номер земли?', 'Это целый объект или доля/часть?', 'Объект жилой или нежилой?'],
      mistake: ['Называют объект “домом”, а по документам это доля или квартира.', 'Забывают про земельный участок при продаже дома.'],
      call: ['Юриста — если доля, часть дома, квартира в частном секторе, СНТ, уступка, коммерция.', 'Брокера — если объект покупают в ипотеку и статус объекта нестандартный.']
    }
  },
  {
    title: 'Кто собственники?',
    help: 'Самый важный шаг для риска: взрослые, супруги, несколько собственников, дети, наследство.',
    training: {
      why: ['Собственники определяют, кто подписывает документы, дает согласие и получает деньги.', 'Дети, супруги, доверенности и наследники могут полностью поменять порядок сделки.'],
      ask: ['Сколько собственников?', 'Есть ли несовершеннолетние?', 'Кто состоит в браке?', 'Кто будет присутствовать на задатке и сделке?', 'Есть ли доверенность?'],
      mistake: ['Смотрят только на одного продавца, который общается, но не проверяют всех собственников.', 'Не уточняют супруга и детей до задатка.'],
      call: ['Юриста — если есть дети, доверенность, несколько собственников, наследство.', 'Менеджера — если один из собственников против или не выходит на связь.']
    }
  },
  {
    title: 'Документы основания',
    help: 'От основания права зависят риски: наследство, приватизация, суд, ДДУ, уступка, рента.',
    training: {
      why: ['Документ основания показывает, как продавец получил право собственности.', 'Некоторые основания требуют более глубокой проверки: наследство, приватизация, рента, суд, дарение.'],
      ask: ['Как объект достался продавцу?', 'Документ есть на руках?', 'Есть ли только выписка ЕГРН или сам договор тоже есть?', 'Были ли отказники, наследники, суды?'],
      mistake: ['Считают, что ЕГРН заменяет документ основания.', 'Не запрашивают приватизацию, наследство или решение суда заранее.'],
      call: ['Юриста — если основание неизвестно, наследство, приватизация, рента, суд, уступка.', 'Менеджера — если клиент не хочет предоставлять документы до задатка.']
    }
  },
  {
    title: 'Источник денег',
    help: 'Откуда деньги покупателя: свои, ипотека, маткапитал, субсидия, детские средства, НИС.',
    training: {
      why: ['Источник денег влияет на сроки, документы, банк, СФР, опеку и условия договора.', 'Маткапитал, НИС, субсидии и детские деньги — это не просто “безнал”.'],
      ask: ['Свои деньги или ипотека?', 'Есть ли маткапитал, субсидия, НИС?', 'Деньги лежат на обычном счете или на детском/номинальном?', 'Кто фактически платит?'],
      mistake: ['Пишут “наличные”, хотя часть денег идет маткапиталом.', 'Не уточняют остаток сертификата и сроки перечисления.'],
      call: ['Брокера — если ипотека, Сбер, Домклик, оценка.', 'Юриста и менеджера — если детский номинальный счет или СВО-средства детей.']
    }
  },
  {
    title: 'Порядок расчетов',
    help: 'Как именно будут передаваться деньги: СБР, аккредитив, ячейка, СФР, НИС, перевод после регистрации.',
    training: {
      why: ['Источник денег и порядок расчетов — разные вещи.', 'Безопасный расчет защищает стороны и снижает конфликт на сделке.'],
      ask: ['Деньги передаются до регистрации или после?', 'Будет СБР, аккредитив, ячейка или прямой перевод?', 'Если сертификат — кто и когда перечисляет?', 'Кто оплачивает СБР/ячейку/аккредитив?'],
      mistake: ['Путают “маткапитал” с порядком расчетов.', 'Соглашаются на деньги до регистрации без оценки рисков.'],
      call: ['Юриста — если деньги до регистрации, рассрочка, несколько этапов.', 'Брокера — если расчет через банк или ипотеку.']
    }
  },
  {
    title: 'Дети в сделке',
    help: 'Отмечайте детей как собственников, покупателей, зарегистрированных или участников маткапитала/детских средств.',
    training: {
      why: ['Дети могут быть собственниками, покупателями, зарегистрированными или участниками маткапитала.', 'Ошибки по детям часто блокируют задаток, банк, опеку или регистрацию.'],
      ask: ['Есть ли дети среди собственников?', 'Будут ли дети получать доли?', 'Есть ли маткапитал в текущей или прошлой сделке?', 'Есть ли детский номинальный счет или выплаты на счетах детей?', 'Кто законный представитель?'],
      mistake: ['Отмечают только “маткапитал”, но не отмечают детей-покупателей.', 'Не запрашивают свидетельства о рождении и документы представителей.'],
      call: ['Юриста — всегда, если ребенок собственник или используются детские деньги.', 'Менеджера — если детские деньги/СВО-средства или непонятен источник.', 'Опеку — если ребенок собственник или требуется разрешение.']
    }
  },
  {
    title: 'Особенности',
    help: 'Доверенность, обременение, цена отличается, перепланировка, приватизация, банкротство и прочее.',
    training: {
      why: ['Особенности — это то, что может резко изменить сделку даже при обычной квартире.', 'Лучше отметить лишний риск и снять его, чем пропустить проблему до задатка.'],
      ask: ['Есть ли обременение, ипотека продавца, арест?', 'Есть ли доверенность?', 'Цена в договоре будет такой же?', 'Есть ли перепланировка, долги, зарегистрированные, отказники?'],
      mistake: ['Боятся отмечать риски, чтобы “не усложнять”. Наоборот: отметка помогает юристу быстрее помочь.', 'Не фиксируют отличие цены в договоре от фактической.'],
      call: ['Юриста — по любому юридическому риску.', 'Менеджера — если риск влияет на репутацию, деньги, конфликт или сроки.']
    }
  },
  {
    title: 'Минимум данных',
    help: 'Адрес, цена и контакты — чтобы карточка была рабочей, а не абстрактной.',
    training: {
      why: ['Без адреса, цены, телефонов и кадастровых номеров юрист и брокер не смогут работать предметно.', 'Минимум данных нужен для понятной карточки, а не для бюрократии.'],
      ask: ['Точный адрес?', 'Кадастровый номер есть?', 'Цена фактическая и цена в договоре совпадают?', 'Телефоны сторон актуальны?', 'Где папка с документами?'],
      mistake: ['Передают юристу “примерную” сделку без адреса и документов.', 'Не делают отдельную папку с документами.'],
      call: ['Юриста — когда есть адрес, объект, стороны и хотя бы минимальные документы.', 'Брокера — когда понятны цена, объект и источник денег.']
    }
  },
  {
    title: 'Нужные уточнения',
    help: 'Система показывает только детали, которые нужны именно по выбранному сценарию.',
    training: {
      why: ['Этот шаг превращает выбранный сценарий в рабочую карточку для юриста, брокера и менеджера.', 'Здесь важно закрыть не все возможные поля, а только то, что влияет на решение.'],
      ask: ['Чего не хватает до задатка?', 'Что должен проверить юрист?', 'Кому вернуть замечания?', 'Что можно отправить клиенту?', 'Какие документы лежат в папке?'],
      mistake: ['Оставляют поле “вопрос юристу” пустым при сложной сделке.', 'Смешивают сообщение клиенту и внутреннюю карточку юристу.'],
      call: ['Юриста — после заполнения нужных уточнений.', 'Менеджера — если есть стоп-факторы.', 'Брокера — если есть ипотека, Сбер, сертификаты или банк.']
    }
  }
];

let current = Number(localStorage.getItem('smart_wizard_step') || '0');
let enabled = localStorage.getItem('smart_wizard_enabled') !== '0';
let trainingVisible = localStorage.getItem('smart_wizard_training') !== '0';

function get(id) { return document.getElementById(id); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
function loadCss() {
  if (document.querySelector('link[href="./assets/css/smart-wizard.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/css/smart-wizard.css';
  document.head.appendChild(link);
}
function stages() {
  const box = get('smartDealIntake');
  if (!box) return [];
  return [...box.querySelectorAll('.smart-stage'), get('smartNeededDetails')].filter(Boolean);
}
function clampStep() {
  const max = Math.max(0, stages().length - 1);
  current = Math.max(0, Math.min(current, max));
}
function progress() {
  const count = stages().length || STEPS.length;
  return Math.round(((current + 1) / count) * 100);
}
function tipBlock(title, items, cls) {
  return `<div class="smart-wizard-tip ${cls}"><b>${esc(title)}</b><ul>${(items || []).map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div>`;
}
function trainingHtml(step) {
  const t = step.training || {};
  return `
    <div id="smartWizardTraining" class="smart-wizard-training ${trainingVisible ? '' : 'hidden'}">
      <div class="smart-wizard-training-head">
        <div class="smart-wizard-training-title">🎓 Подсказки для новичка</div>
        <button id="btnSmartWizardTrainingToggle" type="button" class="smart-wizard-training-toggle">${trainingVisible ? 'Скрыть обучение' : 'Показать обучение'}</button>
      </div>
      <div class="smart-wizard-training-grid">
        ${tipBlock('Зачем это нужно', t.why, 'good')}
        ${tipBlock('Что спросить у клиента', t.ask, 'action')}
        ${tipBlock('Частая ошибка', t.mistake, 'warning')}
        ${tipBlock('Когда кого подключать', t.call, 'danger')}
      </div>
    </div>
    <button id="btnSmartWizardTrainingToggleOutside" type="button" class="smart-wizard-training-toggle" style="${trainingVisible ? 'display:none' : ''};margin-top:10px">Показать обучение</button>
  `;
}
function ensureShell() {
  if (get('smartWizardShell')) return;
  const intake = get('smartDealIntake');
  if (!intake) return;
  const shell = document.createElement('div');
  shell.id = 'smartWizardShell';
  shell.className = 'smart-wizard-shell';
  shell.innerHTML = `
    <div class="smart-wizard-top">
      <div>
        <div id="smartWizardTitle" class="smart-wizard-title"></div>
        <div id="smartWizardHelp" class="smart-wizard-help"></div>
      </div>
      <div id="smartWizardCounter" class="smart-wizard-counter"></div>
    </div>
    <div class="smart-wizard-progress"><div id="smartWizardProgress" class="smart-wizard-progress-bar"></div></div>
    <div id="smartWizardDots" class="smart-wizard-dots"></div>
    <div id="smartWizardJump" class="smart-wizard-jump"></div>
    <div id="smartWizardTrainingSlot"></div>
    <div class="smart-wizard-controls">
      <div class="left">
        <button id="btnSmartWizardToggle" type="button" class="light">Обычный вид</button>
        <button id="btnSmartWizardStart" type="button" class="light">В начало</button>
      </div>
      <div class="right">
        <button id="btnSmartWizardPrev" type="button" class="light">Назад</button>
        <button id="btnSmartWizardNext" type="button" class="green">Далее</button>
      </div>
    </div>
    <div id="smartWizardFinalActions" class="smart-wizard-final-actions">
      <button id="btnSmartWizardGenerate" type="button" class="green">Сформировать результат</button>
      <button id="btnSmartWizardOpenDetails" type="button" class="light">Открыть все поля</button>
    </div>
  `;
  const intro = intake.querySelector('.smart-compact-row');
  if (intro) intro.insertAdjacentElement('afterend', shell);
  bindShell();
}
function bindShell() {
  get('btnSmartWizardPrev').onclick = () => go(current - 1);
  get('btnSmartWizardNext').onclick = () => go(current + 1);
  get('btnSmartWizardStart').onclick = () => go(0);
  get('btnSmartWizardToggle').onclick = () => {
    enabled = !enabled;
    localStorage.setItem('smart_wizard_enabled', enabled ? '1' : '0');
    render();
  };
  get('btnSmartWizardGenerate').onclick = () => get('btnSmartApply')?.click();
  get('btnSmartWizardOpenDetails').onclick = () => get('btnSmartDetails')?.click();
}
function bindTrainingButtons() {
  const toggle = () => {
    trainingVisible = !trainingVisible;
    localStorage.setItem('smart_wizard_training', trainingVisible ? '1' : '0');
    render();
  };
  const inside = get('btnSmartWizardTrainingToggle');
  const outside = get('btnSmartWizardTrainingToggleOutside');
  if (inside) inside.onclick = toggle;
  if (outside) outside.onclick = toggle;
}
function go(step) {
  current = step;
  clampStep();
  localStorage.setItem('smart_wizard_step', String(current));
  render();
  get('smartDealIntake')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderJumps(count) {
  const box = get('smartWizardJump');
  if (!box) return;
  box.innerHTML = STEPS.slice(0, count).map((step, index) => `<button type="button" data-wizard-jump="${index}" class="${index === current ? 'active' : ''}">${index + 1}. ${step.title}</button>`).join('');
  box.querySelectorAll('[data-wizard-jump]').forEach((button) => button.onclick = () => go(Number(button.dataset.wizardJump)));
}
function renderDots(count) {
  const box = get('smartWizardDots');
  if (!box) return;
  box.innerHTML = Array.from({ length: count }, (_, index) => `<span class="smart-wizard-dot ${index < current ? 'done' : ''} ${index === current ? 'active' : ''}"></span>`).join('');
}
function render() {
  const list = stages();
  if (!list.length) return;
  clampStep();
  document.body.dataset.smartWizard = enabled ? '1' : '0';
  get('btnSmartWizardToggle').textContent = enabled ? 'Обычный вид' : 'Пошаговый вид';

  list.forEach((stage, index) => stage.classList.toggle('wizard-active', !enabled || index === current));
  const step = STEPS[current] || { title: 'Шаг', help: '', training: {} };
  get('smartWizardTitle').textContent = step.title;
  get('smartWizardHelp').textContent = step.help;
  get('smartWizardCounter').textContent = `Шаг ${current + 1} из ${list.length}`;
  get('smartWizardProgress').style.width = `${progress()}%`;
  get('smartWizardTrainingSlot').innerHTML = trainingHtml(step);
  bindTrainingButtons();
  renderDots(list.length);
  renderJumps(list.length);

  get('btnSmartWizardPrev').disabled = current === 0;
  get('btnSmartWizardNext').textContent = current >= list.length - 1 ? 'Готово' : 'Далее';
  get('btnSmartWizardNext').onclick = () => current >= list.length - 1 ? get('btnSmartApply')?.click() : go(current + 1);
  get('smartWizardFinalActions').classList.toggle('active', current >= list.length - 1);
}
function start() {
  loadCss();
  ensureShell();
  render();
  document.addEventListener('click', (event) => {
    if (event.target?.matches('[data-smart-key],[data-smart-list],[data-smart-feature],#btnSmartReset')) setTimeout(render, 120);
  });
  document.addEventListener('input', () => setTimeout(render, 120));
  document.addEventListener('change', () => setTimeout(render, 120));
}
let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (get('smartDealIntake') && get('smartNeededDetails')) {
    clearInterval(timer);
    start();
  }
  if (attempts > 80) clearInterval(timer);
}, 200);
