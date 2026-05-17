const LOCAL_KEY = 'navigator_v7_deal';

export function saveDealLocal(deal) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(deal));
}

export function restoreDealLocal() {
  const raw = localStorage.getItem(LOCAL_KEY);
  return raw ? JSON.parse(raw) : null;
}
