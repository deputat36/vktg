import assert from 'node:assert/strict';
import {
  detectSensitiveFreeText,
  hasSensitiveFreeText,
  luhnValid,
  redactSensitiveFreeText,
  sensitiveFreeTextMessage
} from '../assets/js/nav-v2/sensitive-free-text-model-v2.js';

function types(value) {
  return detectSensitiveFreeText(value).map((item) => item.type).sort();
}

assert.deepEqual(types('Написать клиенту на client@example.ru'), ['email']);
assert.deepEqual(types('Позвонить +7 (903) 857-67-10 после 17:00'), ['phone']);
assert.deepEqual(types('Телефон 8 903 857 67 10'), ['phone']);
assert.deepEqual(types('Паспорт 1234 567890 нужно сверить вне Навигатора'), ['passport']);
assert.deepEqual(types('СНИЛС 123-456-789 01'), ['snils']);
assert.equal(luhnValid('4111 1111 1111 1111'), true);
assert.deepEqual(types('Карта 4111 1111 1111 1111'), ['bank_card']);
assert.equal(luhnValid('4111 1111 1111 1112'), false);
assert.deepEqual(types('Карта 4111 1111 1111 1112'), []);

for (const safe of [
  'Цена сделки 4 500 000 рублей, задаток 100 000 рублей.',
  'Срок выхода на сделку: 18.07.2026.',
  'Задача TASK-20260715-001 передана юристу.',
  'Кадастровый номер проверяется в основной CRM.',
  'Объект 36:04:0101010:125, требуется сверка статуса.',
  'Документ получен, подпись не читается.',
  'Позвонить клиенту завтра без указания номера.',
  'Риск 3 из 5, срок 10 дней.'
]) {
  assert.equal(hasSensitiveFreeText(safe), false, safe);
  assert.equal(redactSensitiveFreeText(safe), safe, `safe text changed: ${safe}`);
}

const mixedSource = 'Email test@example.ru, телефон +7 900 111-22-33, паспорт 1234 567890, СНИЛС 123-456-789 01, карта 4111 1111 1111 1111.';
const mixed = detectSensitiveFreeText(mixedSource);
assert.deepEqual(mixed.map((item) => item.type).sort(), ['bank_card', 'email', 'passport', 'phone', 'snils']);
assert.match(sensitiveFreeTextMessage(mixed), /email клиента/);
assert.match(sensitiveFreeTextMessage(mixed), /телефон клиента/);
assert.match(sensitiveFreeTextMessage(mixed), /серия и номер паспорта/);
assert.doesNotMatch(sensitiveFreeTextMessage(mixed), /test@example/);
assert.equal(sensitiveFreeTextMessage([]), '');

const redacted = redactSensitiveFreeText(mixedSource);
assert.equal(redacted.includes('[email клиента скрыт]'), true);
assert.equal(redacted.includes('[телефон клиента скрыт]'), true);
assert.equal(redacted.includes('[паспортные данные скрыты]'), true);
assert.equal(redacted.includes('[СНИЛС скрыт]'), true);
assert.equal(redacted.includes('[номер карты скрыт]'), true);
assert.doesNotMatch(redacted, /test@example\.ru/);
assert.doesNotMatch(redacted, /900 111-22-33/);
assert.doesNotMatch(redacted, /1234 567890/);
assert.doesNotMatch(redacted, /123-456-789 01/);
assert.doesNotMatch(redacted, /4111 1111 1111 1111/);
assert.equal(redactSensitiveFreeText('Карта 4111 1111 1111 1112'), 'Карта 4111 1111 1111 1112');

console.log('Navigator v2 sensitive free-text semantic regression passed');
