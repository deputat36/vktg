# SPN UX iteration 2026-06-23 19:25

## Scope
- Tightened the SPN wizard save readiness guard on `spn-v2.html`.
- CRM Lider was not changed.

## Change
- `assets/js/nav-v2/spn-save-readiness-guard-v2.js` now keys weak-card save confirmation by both:
  - the current critical gaps;
  - key draft fields such as scenario, representation, stage, object type, address, payments, agreement flags and next step.
- If SPN confirms saving with gaps and then changes meaningful draft data, the next save requires fresh confirmation.
- `spn-v2.html` now loads the updated helper with `?v=20260623-1925`.

## Why
This prevents stale confirmations from allowing a changed draft to be saved with unresolved critical gaps.

## Verification
- Supabase `nav_v2_get_deals_list` was checked as `a.k.ovchinnikov@borisoglebsk.etagi.com` / role `spn`.
- The RPC returned role `spn` and 3 available deals.
