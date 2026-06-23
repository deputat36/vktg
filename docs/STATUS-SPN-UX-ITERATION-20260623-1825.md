# SPN UX iteration 2026-06-23 18:25

## Scope
- Improved the local draft guard on `spn-v2.html`.
- CRM Lider was not changed.

## Change
- `assets/js/nav-v2/spn-draft-guard-v2.js` now uses the same buyer/deposit logic as the save readiness guard for key missing fields.
- The draft panel no longer replaces itself when the visible draft summary did not change.
- The panel now warns about missing buyer money source when the route implies a buyer.
- `spn-v2.html` now loads the updated helper with `?v=20260623-1825`.

## Why
For SPN, a local browser draft must clearly show whether it is safe to continue or whether critical fields are still missing before saving to CRM.

## Verification
- The change is client-side only.
- Supabase profile checks remain based on `nav_v2_get_deals_list` for `a.k.ovchinnikov@borisoglebsk.etagi.com` / role `spn`.
