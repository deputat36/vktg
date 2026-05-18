import { listDealTasks, addDealTask } from './tasks.js';

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

function baseLegalTasks(decision, comment) {
  if (decision === 'needs_documents') {
    return [
      {
        title: 'Запросить ЕГРН с ЭЦП',
        description: 'Получить полный комплект выписки: PDF + XML + SIG/архив с электронной подписью. Для банка и нотариуса одного PDF недостаточно.',
        priority: 'high',
        due_date: tomorrow(1)
      },
      {
        title: 'Запросить справку о зарегистрированных',
        description: 'Продавцу получить справку о зарегистрированных через Госуслуги/МФЦ/уполномоченный орган. Проверить, кто зарегистрирован и кто должен сняться с регистрации.',
        priority: 'high',
        due_date: tomorrow(1)
      },
      {
        title: 'Проверить документы основания',
        description: 'Загрузить и проверить все документы основания: договор купли-продажи, наследство, приватизация, дарение, решение суда и другие документы по объекту.',
        priority: 'high',
        due_date: tomorrow(1)
      }
    ];
  }

  if (decision === 'needs_correction') {
    return [
      {
        title: 'Исправить условия сделки по замечанию юриста',
        description: 'Разобрать замечание юриста, согласовать с клиентами новый порядок действий, цену, сроки, состав участников или форму расчетов. Комментарий: ' + (comment || '—'),
        priority: 'urgent',
        due_date: tomorrow(1)
      },
      {
        title: 'Обновить карточку сделки после исправлений',
        description: 'После согласования изменений обновить карточку сделки и повторно сохранить ее в CRM.',
        priority: 'high',
        due_date: tomorrow(1)
      }
    ];
  }

  if (decision === 'stop_current_conditions') {
    return [
      {
        title: 'Не брать задаток до устранения стоп-фактора',
        description: 'Поставить сделку на паузу. Не назначать задаток и не обещать клиентам дату сделки, пока юрист/менеджер не подтвердит возможность продолжения.',
        priority: 'urgent',
        due_date: tomorrow(0)
      },
      {
        title: 'Передать стоп-фактор менеджеру',
        description: 'Кратко описать проблему, приложить документы и получить управленческое решение. Комментарий: ' + (comment || '—'),
        priority: 'urgent',
        due_date: tomorrow(0)
      }
    ];
  }

  if (decision === 'manager_required') {
    return [
      {
        title: 'Получить решение менеджера по сделке',
        description: 'Передать менеджеру карточку сделки, риск, замечание юриста/брокера и варианты решения. Комментарий: ' + (comment || '—'),
        priority: 'high',
        due_date: tomorrow(1)
      }
    ];
  }

  if (decision === 'can_prepare_deposit') {
    return [
      {
        title: 'Подготовить задаток после юридической проверки',
        description: 'Согласовать сумму, сроки, ответственность сторон, порядок расчетов и список документов, которые нужно донести до сделки.',
        priority: 'normal',
        due_date: tomorrow(2)
      }
    ];
  }

  if (decision === 'can_prepare_deal') {
    return [
      {
        title: 'Подготовить финальный пакет к сделке',
        description: 'Проверить финальные документы, оплату госпошлины, способ расчетов, регистрацию, снятие с регистрационного учета и передачу ключей.',
        priority: 'normal',
        due_date: tomorrow(2)
      }
    ];
  }

  return [];
}

function brokerTasks(decision, comment) {
  if (decision === 'needs_documents') {
    return [
      {
        title: 'Загрузить документы покупателя в банк / Домклик',
        description: 'Проверить паспорт, семейное положение, согласие супруга при необходимости, подтверждение дохода, сертификаты и ипотечное одобрение.',
        priority: 'high',
        due_date: tomorrow(1)
      },
      {
        title: 'Загрузить документы продавца и объекта в банк / Домклик',
        description: 'Проверить правоустанавливающие документы, ЕГРН с ЭЦП, справку о зарегистрированных, документы по объекту и продавцу.',
        priority: 'high',
        due_date: tomorrow(1)
      },
      {
        title: 'Заказать или проверить оценку объекта',
        description: 'Для квартиры ориентир 3–5 тыс. руб., для дома 6–9 тыс. руб. Проверить требования банка к оценочной компании.',
        priority: 'normal',
        due_date: tomorrow(2)
      }
    ];
  }

  if (decision === 'needs_correction') {
    return [
      {
        title: 'Согласовать замечания банка / брокера',
        description: 'Разобрать замечание по ипотеке, объекту, оценке, сертификатам или платным услугам банка. Комментарий: ' + (comment || '—'),
        priority: 'high',
        due_date: tomorrow(1)
      },
      {
        title: 'Проконсультировать клиента по услугам банка',
        description: 'Объяснить, какие услуги обязательны, от каких можно отказаться, а какие могут быть выгодны с учетом ставки и условий банка.',
        priority: 'normal',
        due_date: tomorrow(2)
      }
    ];
  }

  if (decision === 'stop_current_conditions') {
    return [
      {
        title: 'Остановить ипотечную подготовку до решения проблемы',
        description: 'Не назначать дату сделки в банке, пока не устранены ограничения по объекту, документам, сертификатам или заемщику.',
        priority: 'urgent',
        due_date: tomorrow(0)
      }
    ];
  }

  if (decision === 'can_prepare_deal') {
    return [
      {
        title: 'Согласовать дату ипотечной сделки',
        description: 'Проверить одобрение объекта, загрузку документов, оценку, СБР/аккредитив, страховку и финальные условия банка.',
        priority: 'normal',
        due_date: tomorrow(2)
      }
    ];
  }

  return [];
}

function managerTasks(decision, comment) {
  if (decision === 'manager_required' || decision === 'stop_current_conditions' || decision === 'needs_correction') {
    return [
      {
        title: 'Менеджеру принять решение по проблемной сделке',
        description: 'Оценить риск, обсудить с СПН и юристом/брокером, определить: продолжаем, меняем условия или ставим сделку на паузу. Комментарий: ' + (comment || '—'),
        priority: 'urgent',
        due_date: tomorrow(1)
      }
    ];
  }

  return [];
}

export function suggestTasksForReview(role, decision, comment = '') {
  let tasks = [];
  tasks = tasks.concat(baseLegalTasks(decision, comment));

  if (role === 'broker') tasks = tasks.concat(brokerTasks(decision, comment));
  if (role === 'manager' || role === 'admin') tasks = tasks.concat(managerTasks(decision, comment));

  if (comment && comment.trim()) {
    tasks.push({
      title: 'Разобрать комментарий по решению',
      description: comment.trim(),
      priority: decision === 'stop_current_conditions' ? 'urgent' : 'normal',
      due_date: tomorrow(2)
    });
  }

  return uniqTasks(tasks).map((task) => ({ ...task, status: 'open' }));
}

export async function createTasksFromReview(dealId, role, decision, comment = '') {
  const existing = await listDealTasks(dealId);
  const existingTitles = new Set(existing.map((task) => normalize(task.title)));
  const suggestions = suggestTasksForReview(role, decision, comment).filter((task) => !existingTitles.has(normalize(task.title)));
  const created = [];

  for (const task of suggestions) {
    created.push(await addDealTask(dealId, task));
  }

  return created;
}
