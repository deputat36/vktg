const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:^|[^\d])((?:\+7|8)[\s()\-]*\d{3}[\s()\-]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2})(?!\d)/g;
const PASSPORT_RE = /\b\d{4}[\s-]+\d{6}\b/g;
const SNILS_RE = /\b\d{3}-\d{3}-\d{3}[\s-]+\d{2}\b/g;
const CARD_CANDIDATE_RE = /(?:^|[^\d])((?:\d[ -]?){13,19})(?!\d)/g;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function matches(text, pattern, group = 0) {
  pattern.lastIndex = 0;
  const result = [];
  let match;
  while ((match = pattern.exec(text))) {
    result.push(String(match[group] || match[0] || '').trim());
    if (match[0] === '') pattern.lastIndex += 1;
  }
  pattern.lastIndex = 0;
  return unique(result);
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function luhnValid(value) {
  const number = digits(value);
  if (number.length < 13 || number.length > 19 || /^(\d)\1+$/.test(number)) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let index = number.length - 1; index >= 0; index -= 1) {
    let digit = Number(number[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function cardMatches(text) {
  return matches(text, CARD_CANDIDATE_RE, 1)
    .filter((candidate) => luhnValid(candidate));
}

export function detectSensitiveFreeText(value) {
  const text = String(value || '');
  if (!text.trim()) return [];
  const findings = [];
  const add = (type, label, values) => {
    if (!values.length) return;
    findings.push({ type, label, count: values.length });
  };
  add('email', 'email клиента', matches(text, EMAIL_RE));
  add('phone', 'телефон клиента', matches(text, PHONE_RE, 1));
  add('passport', 'серия и номер паспорта', matches(text, PASSPORT_RE));
  add('snils', 'СНИЛС', matches(text, SNILS_RE));
  add('bank_card', 'номер банковской карты', cardMatches(text));
  return findings;
}

export function sensitiveFreeTextMessage(findings) {
  const labels = unique((findings || []).map((item) => item?.label));
  if (!labels.length) return '';
  return `Не сохраняйте здесь ${labels.join(', ')}. Оставьте только рабочий факт, статус или следующий шаг без идентификации клиента.`;
}

export function hasSensitiveFreeText(value) {
  return detectSensitiveFreeText(value).length > 0;
}
