import assert from 'node:assert/strict';
import { buildLegalPassportCardModel } from '../assets/js/nav-v2/deal-card-legal-passport-model-v1.js';

const canonical = buildLegalPassportCardModel({
  deal: {
    object_type: 'flat_mkd',
    address: 'Рабочий ориентир',
    seller_spn_id: 'spn-seller',
    buyer_spn_id: 'spn-buyer',
    wizard_snapshot: {
      deal: {
        legal_passport: {
          version: 1,
          request_type: 'check_power_of_attorney',
          requested_decision: 'Подтвердить полномочия на подписание и получение денег.',
          urgency: 'urgent',
          target_date: '2026-07-20',
          preparation_mode: 'prepare_deposit',
          stage: 'urgent_deposit',
          representation_model: 'both',
          object: { type: 'flat_mkd', address: 'Рабочий ориентир', cadastral_number_known: 'unknown' },
          confirmed_facts: [{ id: 'encumbrance', title: 'Нет подтверждённого обременения', value: 'no' }],
          client_reported_facts: [{ id: 'power_of_attorney', title: 'Кто-то действует по доверенности', value: 'yes' }],
          unknown_facts: [{ id: 'spouse', title: 'Нужно уточнить согласие супруга' }],
          risk_flags: [{ id: 'power_of_attorney', title: 'Проверить доверенность', level: 'yellow', blocks_deposit: true, blocks_deal: true }],
          documents: {
            available: [{ type: 'title_basis', title: 'Основание права', side: 'seller' }],
            requested: [{ type: 'power_of_attorney', title: 'Доверенность', side: 'seller' }],
            missing: [],
            problem: []
          },
          settlements: { status: 'agreed', known_terms: [] },
          expenses: { status: 'unknown', known_terms: [] },
          deposit: { required: true, amount_known: false, conditions_known: false },
          spn_next_action: 'Запросить доверенность.',
          lawyer_question: '',
          handoff_completeness: { state: 'ready', missing: [] }
        }
      }
    }
  },
  participants: [
    { user_id: 'spn-seller', display_name: 'СПН продавца' },
    { user_id: 'spn-buyer', display_name: 'СПН покупателя' }
  ]
});

assert.equal(canonical.source, 'passport_v1');
assert.equal(canonical.passport.request_title, 'Проверить доверенность');
assert.equal(canonical.passport.confirmed_facts.length, 1);
assert.equal(canonical.passport.client_reported_facts.length, 1);
assert.equal(canonical.passport.unknown_facts.length, 1);
assert.equal(canonical.passport.documents.requested[0].title, 'Доверенность');
assert.equal(canonical.spn_by_side.seller, 'СПН продавца');
assert.equal(canonical.spn_by_side.buyer, 'СПН покупателя');
assert.equal(canonical.has_specific_request, true);
assert.equal(canonical.has_stop_factors, true);

const legacy = buildLegalPassportCardModel({
  deal: {
    lawyer_needed: true,
    object_type: 'house_land',
    address: 'Старый рабочий ориентир',
    representation_model: 'seller',
    next_action: 'Уточнить пакет документов.',
    settlements_agreed: false,
    expenses_agreed: true,
    wizard_snapshot: { deal: { preparationMode: 'deposit', stage: 'object_chosen' } }
  },
  documents: [
    { title: 'Документы на землю', category: 'land', side: 'seller', status: 'requested' },
    { title: 'Выписка', category: 'object', side: 'seller', status: 'problem' }
  ],
  risks: [{ title: 'Границы участка не уточнены', level: 'red', blocks_deposit: true, is_resolved: false }]
});

assert.equal(legacy.source, 'legacy');
assert.equal(legacy.passport.version, 0);
assert.equal(legacy.passport.request_title, 'Провести первичную юридическую проверку');
assert.equal(legacy.passport.handoff_completeness.state, 'legacy_incomplete');
assert.equal(legacy.passport.unknown_facts.some((item) => item.id === 'legacy_source'), true);
assert.equal(legacy.passport.documents.requested[0].title, 'Документы на землю');
assert.equal(legacy.passport.documents.problem[0].title, 'Выписка');
assert.equal(legacy.passport.risk_flags[0].level, 'red');
assert.equal(legacy.passport.settlements.status, 'not_agreed');

const unsupported = buildLegalPassportCardModel({ deal: { wizard_snapshot: { legal_passport: { version: 9 } } } });
assert.equal(unsupported.source, 'legacy');
assert.equal(unsupported.passport.unknown_facts.some((item) => item.id === 'passport_version'), true);

const serialized = JSON.stringify({ canonical, legacy, unsupported });
for (const forbidden of ['passport_number', 'seller_phone', 'buyer_phone', 'bank_card', 'snils']) {
  assert.equal(serialized.includes(forbidden), false, `preview must not introduce ${forbidden}`);
}

console.log('Navigator v2 legal passport preview passed: canonical v1, honest legacy fallback, role-side SPN summary, documents, risks, gates and privacy');
