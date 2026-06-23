# SPN UX iteration 2026-06-23 17:05

Scope: deal card readability for SPN.

## Changed

- Added `assets/js/nav-v2/readable-card-values-v2.js`.
- Connected it in `deal-card-v2.html` with cache version `20260623-1705`.
- The card now normalizes visible technical values after rendering:
  - representation model `both` -> `представляем обе стороны`;
  - `seller` / `buyer` representation values -> readable Russian text;
  - raw role labels in comments or badges such as `spn`, `lawyer`, `manager`, `broker` -> readable role names.

## Why

SPN should see operational language, not database enum values. This reduces training overhead and prevents mistakes when a user interprets a technical code as a business status.

## Safety

- CRM `Лидер` was not touched.
- No Supabase schema or data changes in this iteration.
- The module only post-processes already-rendered values in the deal card UI.
