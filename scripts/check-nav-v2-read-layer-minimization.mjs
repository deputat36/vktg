import assert from 'node:assert/strict';
import {
  containsDirectClientIdentifiers,
  maskDealAddress,
  minimizeNavigatorReadPayload,
  neutralDealReference,
  shortDealId
} from '../assets/js/nav-v2/read-layer-minimization-model-v2.js';

const dealId = '12345678-1234-1234-1234-1234567890ab';
const source = {
  profile: {
    id: 'profile-1',
    full_name: 'Рабочий сотрудник',
    phone: '+7 900 000-00-00',
    role: 'spn'
  },
  deal: {
    id: dealId,
    title: 'Квартира — Иванов / Петров',
    display_title: 'Квартира — Иванов / Петров',
    object_type: 'flat_mkd',
    address: 'г. Борисоглебск, ул. Советская, д. 10, кв. 42',
    seller_name: 'Иванов Иван Иванович',
    buyerPhone: '+7 900 111-22-33',
    readiness_deposit: 55,
    wizard_snapshot: {
      sellerPhone: '+7 900 222-33-44',
      buyer_name: 'Петров Пётр Петрович',
      objectFacts: { floor: 3 }
    },
    spn_final: {
      handoff_text: 'Заголовок сделки: Иванов / Петров\nФИО продавца: Иванов И.И.\nСледующий шаг: запросить выписку'
    }
  },
  tasks: [{
    id: 'task-1',
    deal_id: dealId,
    deal_title: 'Иванов / Петров',
    title: 'Запросить выписку ЕГРН',
    description: 'Рабочая задача',
    status: 'open'
  }],
  manager: {
    items: [{
      deal_id: dealId,
      title: 'Иванов / Петров',
      card_url: `./deal-card-v2.html?id=${dealId}`,
      operational_readiness_percent: 40,
      manager_name: 'Алексей Ковтун'
    }]
  },
  mutation: {
    id: 'task-2',
    title: 'Не менять название рабочей задачи',
    status: 'done'
  }
};

const output = minimizeNavigatorReadPayload(source);

assert.notEqual(output, source, 'sanitizer must return a clone');
assert.equal(source.deal.seller_name, 'Иванов Иван Иванович', 'source object must remain unchanged');
assert.equal(containsDirectClientIdentifiers(output), false, 'direct identifiers must be removed recursively');
assert.equal(output.profile.full_name, 'Рабочий сотрудник', 'employee name must remain available');
assert.equal(output.profile.phone, '+7 900 000-00-00', 'employee phone must remain available');
assert.equal(output.deal.address, 'г. Борисоглебск, ул. Советская, д. 10', 'apartment must be removed from address');
assert.equal(output.deal.title, 'Квартира в МКД — г. Борисоглебск, ул. Советская, д. 10 · 12345678');
assert.equal(output.deal.display_title, output.deal.title);
assert.equal(output.deal.wizard_snapshot.objectFacts.floor, 3, 'working facts must survive recursive minimization');
assert.equal(output.deal.spn_final.handoff_text, 'Следующий шаг: запросить выписку', 'legacy identity handoff lines must be removed');
assert.equal(output.tasks[0].title, 'Запросить выписку ЕГРН', 'task title must not be replaced');
assert.equal(output.tasks[0].deal_title, 'Сделка · 12345678', 'deal title embedded in task must be neutral');
assert.equal(output.manager.items[0].title, 'Сделка · 12345678', 'manager queue title must be neutral');
assert.equal(output.manager.items[0].manager_name, 'Алексей Ковтун', 'responsible employee name must remain available');
assert.equal(output.mutation.title, 'Не менять название рабочей задачи', 'non-deal mutation result must not be rewritten');
assert.equal(maskDealAddress('ул. Бланская, 67А, офис 12'), 'ул. Бланская, 67А');
assert.equal(maskDealAddress('ул. Просторная, 4А'), 'ул. Просторная, 4А');
assert.equal(shortDealId('abcdef12-0000'), 'ABCDEF12');
assert.equal(neutralDealReference({ deal_id: dealId }), 'Сделка · 12345678');

console.log('Navigator v2 read-layer minimization semantic regression passed');
