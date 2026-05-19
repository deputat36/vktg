import { listDealTasks, addDealTask } from './tasks.js';
import { normalizeDeal } from '../core/dealSchema.js';

function tomorrow(days = 1) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function uniqTasks(tasks) {
  const seen = new Set();
  return tasks.filter((task) => {
    const key = normalize(task.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function task(title, description, priority = 'normal', days = 1, assignedRole = 'spn') {
  return { title, description, priority, due_date: tomorrow(days), assigned_role: assignedRole, status: 'open' };
}

function baseLegalTasks(decision, comment) {
  if (decision === 'needs_documents') {
    return [
      task('Запросить ЕГРН с ЭЦП', 'Получить полный комплект выписки: PDF + XML + SIG/архив с электронной подписью. Для банка и нотариуса одного PDF недостаточно.', 'high'),
      task('Запросить справку о зарегистрированных', 'Продавцу получить справку о зарегистрированных через Госуслуги/МФЦ/уполномоченный орган. Проверить, кто зарегистрирован и кто должен сняться с регистрации.', 'high'),
      task('Проверить документы основания', 'Загрузить и проверить все документы основания: договор купли-продажи, наследство, приватизация, дарение, решение суда и другие документы по объекту.', 'high')
    ];
  }

  if (decision === 'needs_correction') {
    return [
      task('Исправить условия сделки по замечанию юриста', 'Разобрать замечание юриста, согласовать с клиентами новый порядок действий, цену, сроки, состав участников или форму расчетов. Комментарий: ' + (comment || '—'), 'urgent'),
      task('Обновить карточку сделки после исправлений', 'После согласования изменений обновить карточку сделки и повторно сохранить ее в CRM.', 'high')
    ];
  }

  if (decision === 'stop_current_conditions') {
    return [
      task('Не брать задаток до устранения стоп-фактора', 'Поставить сделку на паузу. Не назначать задаток и не обещать клиентам дату сделки, пока юрист/менеджер не подтвердит возможность продолжения.', 'urgent', 0),
      task('Передать стоп-фактор менеджеру', 'Кратко описать проблему, приложить документы и получить управленческое решение. Комментарий: ' + (comment || '—'), 'urgent', 0, 'manager')
    ];
  }

  if (decision === 'manager_required') {
    return [task('Получить решение менеджера по сделке', 'Передать менеджеру карточку сделки, риск, замечание юриста/брокера и варианты решения. Комментарий: ' + (comment || '—'), 'high', 1, 'manager')];
  }

  if (decision === 'can_prepare_deposit') {
    return [task('Подготовить задаток после юридической проверки', 'Согласовать сумму, сроки, ответственность сторон, порядок расчетов и список документов, которые нужно донести до сделки.', 'normal', 2)];
  }

  if (decision === 'can_prepare_deal') {
    return [task('Подготовить финальный пакет к сделке', 'Проверить финальные документы, оплату госпошлины, способ расчетов, регистрацию, снятие с регистрационного учета и передачу ключей.', 'normal', 2)];
  }

  return [];
}

function brokerTasks(decision, comment) {
  if (decision === 'needs_documents') {
    return [
      task('Загрузить документы покупателя в банк / Домклик', 'Проверить паспорт, семейное положение, согласие супруга при необходимости, подтверждение дохода, сертификаты и ипотечное одобрение.', 'high', 1, 'broker'),
      task('Загрузить документы продавца и объекта в банк / Домклик', 'Проверить правоустанавливающие документы, ЕГРН с ЭЦП, справку о зарегистрированных, документы по объекту и продавцу.', 'high', 1, 'broker'),
      task('Заказать или проверить оценку объекта', 'Для квартиры ориентир 3–5 тыс. руб., для дома 6–9 тыс. руб. Проверить требования банка к оценочной компании.', 'normal', 2, 'broker')
    ];
  }

  if (decision === 'needs_correction') {
    return [
      task('Согласовать замечания банка / брокера', 'Разобрать замечание по ипотеке, объекту, оценке, сертификатам или платным услугам банка. Комментарий: ' + (comment || '—'), 'high', 1, 'broker'),
      task('Проконсультировать клиента по услугам банка', 'Объяснить, какие услуги обязательны, от каких можно отказаться, а какие могут быть выгодны с учетом ставки и условий банка.', 'normal', 2, 'broker')
    ];
  }

  if (decision === 'stop_current_conditions') return [task('Остановить ипотечную подготовку до решения проблемы', 'Не назначать дату сделки в банке, пока не устранены ограничения по объекту, документам, сертификатам или заемщику.', 'urgent', 0, 'broker')];
  if (decision === 'can_prepare_deal') return [task('Согласовать дату ипотечной сделки', 'Проверить одобрение объекта, загрузку документов, оценку, СБР/аккредитив, страховку и финальные условия банка.', 'normal', 2, 'broker')];
  return [];
}

function managerTasks(decision, comment) {
  if (decision === 'manager_required' || decision === 'stop_current_conditions' || decision === 'needs_correction') {
    return [task('Менеджеру принять решение по проблемной сделке', 'Оценить риск, обсудить с СПН и юристом/брокером, определить: продолжаем, меняем условия или ставим сделку на паузу. Комментарий: ' + (comment || '—'), 'urgent', 1, 'manager')];
  }
  return [];
}

function missingFieldTasks(schema) {
  const missing = schema?.required || [];
  const tasks = [];
  const has = (text) => missing.some((item) => item.toLowerCase().includes(text));
  if (has('адрес')) tasks.push(task('Указать точный адрес объекта', 'Без адреса юрист, брокер и менеджер не смогут предметно проверить сделку.', 'high'));
  if (has('кадастровый номер объекта')) tasks.push(task('Указать кадастровый номер объекта', 'Нужен для проверки ЕГРН, банка, юриста и корректного описания объекта в задатке/договоре.', 'high'));
  if (has('кадастровый номер земли')) tasks.push(task('Указать кадастровый номер земли', 'Для дома, СНТ, участка или части дома нужно проверить связку объекта и участка.', 'high'));
  if (has('папка документов')) tasks.push(task('Создать папку документов на Яндекс Диске', 'Каждый документ отдельным файлом: фамилия + название документа. Ссылку вставить в карточку сделки.', 'high'));
  if (has('егрн')) tasks.push(task('Загрузить ЕГРН с ЭЦП', 'Нужен комплект PDF + XML + SIG/архив. Один PDF не подходит для банка/нотариуса.', 'high'));
  if (has('справка о зарегистрированных')) tasks.push(task('Загрузить справку о зарегистрированных', 'Проверить взрослых и детей, кто зарегистрирован и когда должен сняться с учета.', 'high'));
  if (has('порядок расчетов')) tasks.push(task('Уточнить порядок расчетов', 'Отдельно от источника денег указать: СБР, аккредитив, ячейка, СФР, НИС, перевод после регистрации или иной порядок.', 'high'));
  if (has('документ-основание')) tasks.push(task('Запросить документ-основание права', 'Нужен сам договор/наследство/приватизация/решение суда и т.д., а не только выписка ЕГРН.', 'high'));
  if (has('участия детей')) tasks.push(task('Описать участие детей в сделке', 'Указать: ребенок собственник/покупатель/зарегистрирован, возраст, законный представитель, используются ли детские деньги или маткапитал.', 'urgent'));
  if (has('статус банка')) tasks.push(task('Уточнить статус ипотеки / Домклика / банка', 'Указать банк, одобрение, оценку, СБР/аккредитив и какие документы уже загружены.', 'high', 1, 'broker'));
  return tasks;
}

function schemaRiskTasks(schema) {
  const tasks = [];
  if (!schema) return tasks;
  if (schema.owners.hasMinorSeller) tasks.push(task('Проверить несовершеннолетнего собственника', 'До задатка юрист должен проверить документы ребенка, законного представителя и необходимость разрешения опеки.', 'urgent', 0, 'lawyer'));
  if (schema.owners.hasMinorBuyer) tasks.push(task('Проверить покупку на ребенка / выделение долей детям', 'Уточнить доли, представителей, документы ребенка и связь с маткапиталом/сертификатами.', 'high', 1, 'lawyer'));
  if (schema.owners.hasMinorRegistered) tasks.push(task('Проверить зарегистрированных детей', 'Запросить справку и согласовать сроки/порядок снятия с регистрационного учета.', 'high'));
  if (schema.money.hasMatcap) tasks.push(task('Проверить материнский капитал', 'Запросить сведения об остатке, условия СФР, порядок перечисления и выделение долей детям.', 'high', 1, 'lawyer'));
  if (schema.money.hasChildMoney) tasks.push(task('Разобрать детский номинальный счет / СВО-средства', 'До задатка проверить источник средств, разрешения, законного представителя и порядок перечисления.', 'urgent', 0, 'manager'));
  if (schema.property.isShare) tasks.push(task('Проверить долю / преимущественное право / нотариуса', 'Уточнить всех долевиков, порядок уведомлений, нотариальную форму и возможность ипотеки.', 'urgent', 0, 'lawyer'));
  if (schema.property.needsNspd) tasks.push(task('Проверить участок в НСПД', 'Ввести кадастровый номер участка, проверить отображение границ, категорию, ВРИ, подъезд и особые зоны.', 'high'));
  if (schema.money.hasMortgage) tasks.push(task('Проверить ипотечные требования банка', 'Брокеру проверить объект, оценку, документы продавца/покупателя, платные услуги банка и возможность сделки.', 'high', 1, 'broker'));
  if (schema.money.riskySettlement) tasks.push(task('Согласовать рискованный порядок расчетов с юристом', 'Деньги до регистрации или наличные под расписку нельзя проводить без безопасной схемы и письменного понимания рисков.', 'urgent', 0, 'lawyer'));
  if (schema.title.isUnknown) tasks.push(task('Устранить неясное основание права', 'Получить документ-основание и передать юристу до задатка.', 'urgent', 0, 'lawyer'));
  if (schema.title.isPrivatization) tasks.push(task('Проверить приватизацию и отказников', 'Проверить участников приватизации, отказников и возможное сохраненное право пользования.', 'high', 1, 'lawyer'));
  if (schema.title.isInheritance) tasks.push(task('Проверить наследство', 'Проверить наследственное основание, срок владения, круг наследников и возможные споры.', 'high', 1, 'lawyer'));
  return tasks;
}

export function suggestTasksForDeal(deal = {}) {
  const schema = normalizeDeal(deal);
  return uniqTasks([...missingFieldTasks(schema), ...schemaRiskTasks(schema)]).map((item) => ({ ...item, status: 'open' }));
}

export function suggestTasksForReview(role, decision, comment = '', deal = null) {
  let tasks = [];
  tasks = tasks.concat(baseLegalTasks(decision, comment));
  if (role === 'broker') tasks = tasks.concat(brokerTasks(decision, comment));
  if (role === 'manager' || role === 'admin') tasks = tasks.concat(managerTasks(decision, comment));
  if (deal) tasks = tasks.concat(suggestTasksForDeal(deal));

  if (comment && comment.trim()) {
    tasks.push(task('Разобрать комментарий по решению', comment.trim(), decision === 'stop_current_conditions' ? 'urgent' : 'normal', 2));
  }

  return uniqTasks(tasks).map((item) => ({ ...item, status: 'open' }));
}

export async function createTasksFromReview(dealId, role, decision, comment = '', deal = null) {
  const existing = await listDealTasks(dealId);
  const existingTitles = new Set(existing.map((item) => normalize(item.title)));
  const suggestions = suggestTasksForReview(role, decision, comment, deal).filter((item) => !existingTitles.has(normalize(item.title)));
  const created = [];

  for (const item of suggestions) created.push(await addDealTask(dealId, item));
  return created;
}
