import assert from 'node:assert/strict';
import {
  clientDirectIdentifierKeys,
  hasDirectClientIdentifiers,
  neutralDealTitle,
  sanitizeClientDeal,
  sanitizeWizardResult
} from '../assets/js/nav-v2/client-data-minimization-model-v2.js';
import { wizardSubmissionFingerprint } from '../assets/js/nav-v2/spn-save-idempotency-model-v2.js';

const original = {
  objectType: 'flat_mkd',
  address: 'Северный район, дом 7',
  sellerName: 'Секретный продавец',
  sellerPhone: '+7 900 000-00-01',
  buyer_name: 'Секретный покупатель',
  buyer_phone: '+7 900 000-00-02',
  payments: ['mortgage'],
  flags: ['minorRegistered'],
  spn_final: {
    handoff_text: [
      'Заголовок сделки: Секретный продавец / Секретный покупатель',
      'Телефон продавца: +7 900 000-00-01',
      'Объект: квартира',
      'Следующий шаг: запросить документы'
    ].join('\n')
  }
};

assert.equal(hasDirectClientIdentifiers(original), true);
const sanitized = sanitizeClientDeal(original);
for (const key of clientDirectIdentifierKeys()) assert.equal(Object.hasOwn(sanitized, key), false, key);
assert.deepEqual(sanitized.payments, ['mortgage']);
assert.deepEqual(sanitized.flags, ['minorRegistered']);
assert.match(sanitized.spn_final.handoff_text, /Объект: квартира/);
assert.doesNotMatch(sanitized.spn_final.handoff_text, /Секретный|Телефон продавца|Заголовок сделки/);
assert.equal(hasDirectClientIdentifiers(sanitized), false);

const result = sanitizeWizardResult({ deal: original, source: 'spn-smart-v4', demo: false });
assert.equal(result.source, 'spn-smart-v4');
assert.equal(result.demo, false);
assert.equal(result.deal.sellerName, undefined);
assert.equal(result.deal.buyer_phone, undefined);
assert.equal(neutralDealTitle(result.deal), 'Квартира в МКД — Северный район, дом 7');

const fingerprintA = wizardSubmissionFingerprint(original, 'user-1');
const fingerprintB = wizardSubmissionFingerprint({
  ...original,
  sellerName: 'Другое имя',
  sellerPhone: '+7 999 999-99-99',
  buyer_name: 'Ещё одно имя',
  buyer_phone: '+7 988 888-88-88'
}, 'user-1');
assert.equal(fingerprintA, fingerprintB);
assert.notEqual(fingerprintA, wizardSubmissionFingerprint({ ...sanitized, address: 'Другой объект' }, 'user-1'));

console.log('Navigator v2 client data minimization semantic regression passed');
