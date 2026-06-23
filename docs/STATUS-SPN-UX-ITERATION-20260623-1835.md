# SPN UX iteration 2026-06-23 18:35

## Scope
- Improved the SPN wizard save readiness guard on `spn-v2.html`.
- CRM Lider was not changed.

## Change
- `assets/js/nav-v2/spn-save-readiness-guard-v2.js` now stores confirmation by the exact current list of critical gaps.
- If the SPN changes the draft after confirming save with gaps, the next save click requires a fresh confirmation.
- The warning in the page now shows each gap with the wizard step where it should be fixed.
- `spn-v2.html` now loads the updated helper with `?v=20260623-1835`.

## Why
This reduces accidental saves after the draft changed and makes it clearer for SPN where to correct missing data before creating a deal in CRM.

## Verification
- Client-side guard update only.
- Supabase role/list verification remains checked through `nav_v2_get_deals_list` for `a.k.ovchinnikov@borisoglebsk.etagi.com` / role `spn`.
