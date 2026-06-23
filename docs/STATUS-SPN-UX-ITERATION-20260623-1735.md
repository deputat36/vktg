# SPN UX iteration 2026-06-23 17:35

Scope: SPN new deal wizard safety before CRM save.

## Changed

- Added `assets/js/nav-v2/spn-save-readiness-guard-v2.js`.
- Connected it in `spn-v2.html` before `spn-smart-v4.js` with cache version `20260623-1735`.
- Before the final `Сохранить и открыть карточку` action, the guard checks concrete critical gaps in the local draft:
  - missing preparation mode;
  - missing representation;
  - missing stage;
  - missing object type;
  - missing address when needed;
  - unclear buyer money source;
  - unsettled settlements or expenses for deposit scenarios;
  - missing next client step.
- If gaps exist, SPN sees the exact list and must explicitly confirm saving the weak draft.

## Why

The previous warning was mostly readiness-percent based. СПН needs concrete wording to understand what exactly is risky before creating a CRM deal.

## Safety

- CRM `Лидер` was not touched.
- No Supabase schema or data changes in this iteration.
- The guard only intercepts the browser click before the existing save RPC runs. If the user confirms, the existing save flow continues unchanged.
