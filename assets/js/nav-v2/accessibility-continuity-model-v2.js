const TAB_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function sortOperationalRegions(items, compact = false) {
  return [...(Array.isArray(items) ? items : [])].sort((left, right) => {
    if (compact) {
      const byVisualOrder = number(left?.visualOrder) - number(right?.visualOrder);
      if (byVisualOrder) return byVisualOrder;
    }
    return number(left?.sourceOrder) - number(right?.sourceOrder);
  });
}

export function nextTabIndex(currentIndex, key, count) {
  const size = Math.max(0, number(count));
  if (!size || !TAB_KEYS.has(key)) return -1;
  const current = Math.min(size - 1, Math.max(0, number(currentIndex)));
  if (key === 'Home') return 0;
  if (key === 'End') return size - 1;
  if (key === 'ArrowRight') return (current + 1) % size;
  return (current - 1 + size) % size;
}

export function focusModeForControl(controlType) {
  if (controlType === 'tab') return 'tab';
  if (['tab_shortcut', 'action_focus', 'completion_next', 'spn_rework'].includes(controlType)) return 'panel';
  return '';
}
