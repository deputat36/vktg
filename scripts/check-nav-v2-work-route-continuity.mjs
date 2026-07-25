import assert from 'node:assert/strict';
import {
  hrefWithWorkTab,
  workRouteLabel,
  workTargetFromAction,
  workTargetFromDeal
} from '../assets/js/nav-v2/work-route-continuity-v1.js';

const assignedDeal = {
  open_tasks_count: 3,
  overdue_tasks_count: 1,
  red_risks_count: 2,
  missing_documents_count: 4,
  seller_spn: 'СПН',
  manager: 'Менеджер'
};

assert.equal(workTargetFromDeal(assignedDeal, 'spn'), 'tasks', 'SPN with open tasks must enter the task tab');
assert.equal(workTargetFromDeal(assignedDeal, 'lawyer'), 'risks', 'Lawyer with red risks must enter the risk tab');
assert.equal(workTargetFromDeal(assignedDeal, 'manager'), 'risks', 'Manager without responsibility gaps must enter the strongest blocker');
assert.equal(workTargetFromDeal({ ...assignedDeal, manager: '' }, 'manager'), 'overview', 'Missing responsibility must stay on overview');
assert.equal(workTargetFromDeal(assignedDeal, 'spn', 'docs'), 'docs', 'Explicit document filter must preserve document context');
assert.equal(workTargetFromDeal(assignedDeal, 'spn', 'red'), 'risks', 'Explicit red-risk filter must preserve risk context');
assert.equal(workTargetFromDeal(assignedDeal, 'spn', 'overdue'), 'tasks', 'Explicit overdue filter must preserve task context');

assert.equal(workTargetFromAction('Снять просрочку', ['Просроченных задач: 2']), 'tasks');
assert.equal(workTargetFromAction('Проверить стоп-фактор', ['Красных рисков: 1']), 'risks');
assert.equal(workTargetFromAction('Проверить документы', ['Не хватает документов: 3']), 'docs');
assert.equal(workTargetFromAction('Назначить ответственного', ['Не назначен менеджер']), 'overview');
assert.equal(workTargetFromAction('Посмотреть причину', ['Красных рисков: 1']), 'risks');

assert.equal(workRouteLabel('tasks'), 'Открыть задачи');
assert.equal(workRouteLabel('risks'), 'Открыть риски');
assert.equal(workRouteLabel('docs'), 'Открыть документы');
assert.equal(workRouteLabel('unknown'), 'Открыть карточку');

assert.equal(
  hrefWithWorkTab('./deal-card-v2.html?id=deal-1', 'tasks', 'https://example.test/dashboard-v2.html'),
  './deal-card-v2.html?id=deal-1#tasks'
);
assert.equal(
  hrefWithWorkTab('./deal-card-v2.html?id=deal-1#risks', 'docs', 'https://example.test/deals-v2.html'),
  './deal-card-v2.html?id=deal-1#docs'
);
assert.equal(
  hrefWithWorkTab('./deal-card-v2.html?id=deal-1#tasks', 'overview', 'https://example.test/deals-v2.html'),
  './deal-card-v2.html?id=deal-1'
);
assert.equal(
  hrefWithWorkTab('./other.html?id=deal-1', 'tasks', 'https://example.test/deals-v2.html'),
  './other.html?id=deal-1'
);

console.log('Navigator v2 work route continuity semantic checks passed');
