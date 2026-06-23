# SPN UX iteration 2026-06-23 19:15

## Scope
- Improved duplicate-deal warning clarity in the SPN wizard on `spn-v2.html`.
- CRM Lider was not changed.

## Change
- `assets/js/nav-v2/spn-duplicate-deal-guard-v2.js` now explains why a duplicate warning appears.
- The page warning distinguishes between:
  - address and object type match;
  - address match after normalization only.
- The save confirmation dialog includes the same reason before allowing SPN to create another card.
- `spn-v2.html` now loads the updated helper with `?v=20260623-1915`.

## Why
SPN should understand whether the system found a strong duplicate or only a same-address risk, and what to verify before intentionally saving another card.

## Verification
- Supabase `nav_v2_get_deals_list` was checked as `a.k.ovchinnikov@borisoglebsk.etagi.com` / role `spn`.
- The RPC returned 3 deals, with 2 deals containing addresses for duplicate detection.
