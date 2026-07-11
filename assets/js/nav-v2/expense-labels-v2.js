const SIDE_LABELS = {
  seller: 'продавец',
  buyer: 'покупатель',
  both: 'обе стороны',
  company: 'компания',
  other_agency: 'партнер',
  external_party: 'внешняя сторона'
};

const CATEGORY_LABELS = {
  base: 'базовый расход',
  not_agreed: 'не согласовано',
  notary: 'нотариат',
  safe_settlement: 'безопасные расчеты',
  state_fee: 'госпошлина',
  valuation: 'оценка',
  registration: 'регистрация',
  bank: 'банк',
  mortgage: 'ипотека',
  insurance: 'страхование',
  commission: 'комиссия',
  certificate: 'справки',
  other: 'другое'
};

const PAYER_LABELS = {
  seller: 'продавец',
  buyer: 'покупатель',
  both: 'обе стороны',
  company: 'компания',
  agreed: 'согласован',
  not_agreed: 'не согласован'
};

function label(map, value, fallback) {
  const key = String(value || '').trim();
  return map[key] || key || fallback;
}

function normalizeExpenseMeta(node) {
  if (!node || node.dataset.expenseLabelsReady === '1') return;
  const text = node.textContent || '';
  const match = text.match(/^(.+?)\s\/\sсторона:\s(.+?)\s\/\sплательщик:\s(.+)$/);
  if (!match) return;

  const category = label(CATEGORY_LABELS, match[1], 'категория не указана');
  const side = label(SIDE_LABELS, match[2], 'сторона не указана');
  const payer = label(PAYER_LABELS, match[3], 'не указан');

  node.textContent = `${category} / сторона: ${side} / плательщик: ${payer}`;
  node.dataset.expenseLabelsReady = '1';
}

export function applyDealCardExpenseLabels() {
  try {
    document.querySelectorAll('span.small').forEach(normalizeExpenseMeta);
  } catch (_) {
    // Подписи расходов не должны ломать основную карточку сделки.
  }
}
