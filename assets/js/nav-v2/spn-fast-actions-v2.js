const SELECTOR = '[data-click], [data-step], #prevBtn, #nextBtn, #saveDraftBtn, #clearDraft, #copyHandoff, #saveDealBtn';

function findAction(target) {
  return target?.closest?.(SELECTOR) || null;
}

document.addEventListener('pointerup', (event) => {
  if (event.defaultPrevented) return;
  if (event.button !== undefined && event.button !== 0) return;
  const element = findAction(event.target);
  if (!element || element.disabled) return;

  event.preventDefault();
  event.stopPropagation();

  if (typeof element.onclick === 'function') {
    element.onclick.call(element, event);
    return;
  }

  element.click();
}, true);
