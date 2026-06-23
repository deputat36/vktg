# SPN UX iteration 2026-06-23 19:35

## Scope
- Refined duplicate-deal detection in the SPN wizard on `spn-v2.html`.
- CRM Lider was not changed.

## Change
- `assets/js/nav-v2/spn-duplicate-deal-guard-v2.js` now ignores demo deals when checking possible duplicates.
- Demo detection supports `deal_summary.demo`, `wizard_snapshot.demo`, and titles starting with `ДЕМО:`.
- `spn-v2.html` now loads the updated helper with `?v=20260623-1935`.

## Why
SPN should not be blocked or distracted by demo cards when creating real working deals.

## Verification
- Supabase `nav_v2_get_deals_list` was checked as `a.k.ovchinnikov@borisoglebsk.etagi.com` / role `spn`.
- The current list returned 3 deals, 2 with addresses, and 0 demo deals.
