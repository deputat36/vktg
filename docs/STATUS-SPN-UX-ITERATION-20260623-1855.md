# SPN UX iteration 2026-06-23 18:55

## Scope
- Tightened the duplicate-deal guard in the SPN wizard on `spn-v2.html`.
- CRM Lider was not changed.

## Change
- `assets/js/nav-v2/spn-duplicate-deal-guard-v2.js` now keys the warning and confirmation by:
  - normalized draft address;
  - draft object type;
  - matched deal ids;
  - whether the object type matches exactly.
- If SPN changes the object type while keeping the same address, the warning updates and save confirmation is required again.
- `spn-v2.html` now loads the updated helper with `?v=20260623-1855`.

## Why
This prevents stale duplicate warnings and stale confirmations when SPN changes meaningful deal data before saving.

## Verification
- Supabase `nav_v2_get_deals_list` was checked as `a.k.ovchinnikov@borisoglebsk.etagi.com` / role `spn`.
- The RPC still returns the address and object type fields required by duplicate detection.
