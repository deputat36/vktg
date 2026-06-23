# SPN UX iteration 2026-06-23 18:15

## Scope
- Improved the SPN deals list helper on `deals-v2.html`.
- CRM Lider was not changed.

## Change
- `assets/js/nav-v2/deals-spn-priority-hints-v2.js` now refreshes its `nav_v2_get_deals_list` data after the user clicks `#reloadDeals`.
- The helper avoids replacing identical hint blocks and identical readable titles, reducing MutationObserver churn.
- The deal id selector now has a fallback for browsers without `CSS.escape`.
- `deals-v2.html` now loads the updated helper with `?v=20260623-1815`.

## Why
For the SPN profile, the deals list must stay understandable after reloads: each card should keep a readable title and a short "Первым делом СПН" block without stale data or excessive rerendering.

## Verification
- Supabase `nav_v2_get_deals_list` was checked as `a.k.ovchinnikov@borisoglebsk.etagi.com` / role `spn`.
- The RPC returned role `spn` and 3 available deals for the profile.
