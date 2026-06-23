# SPN UX iteration 2026-06-23 19:05

## Scope
- Improved duplicate-deal detection in the SPN wizard on `spn-v2.html`.
- CRM Lider was not changed.

## Change
- `assets/js/nav-v2/spn-duplicate-deal-guard-v2.js` now compares address signatures instead of only raw normalized strings.
- The signature removes common address words such as street, lane, house, building and apartment labels.
- This helps catch duplicates like `ул. Чкалова, д.4, кв.44` vs `Чкалова 4 кв 44`.
- Confirmation keys now include the normalized address signature used for matching.
- `spn-v2.html` now loads the updated helper with `?v=20260623-1905`.

## Why
SPN users often type addresses in different formats. Better normalization reduces duplicate CRM cards without blocking intentional new deals.

## Verification
- Supabase `nav_v2_get_deals_list` was checked as `a.k.ovchinnikov@borisoglebsk.etagi.com` / role `spn`.
- The RPC returned 3 deals, with 2 deals containing addresses for duplicate detection.
