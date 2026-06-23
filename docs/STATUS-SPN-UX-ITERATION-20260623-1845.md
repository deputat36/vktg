# SPN UX iteration 2026-06-23 18:45

## Scope
- Added a duplicate-deal warning for the SPN wizard on `spn-v2.html`.
- CRM Lider was not changed.

## Change
- Added `assets/js/nav-v2/spn-duplicate-deal-guard-v2.js`.
- The wizard now checks the SPN-visible `nav_v2_get_deals_list` data for an existing deal with the same normalized address.
- If a likely duplicate exists, the page shows a warning with links to existing deal cards.
- If the SPN still clicks save, the wizard asks for explicit confirmation before creating another card.
- `spn-v2.html` now loads the helper with `?v=20260623-1845`.

## Why
This reduces duplicate CRM cards and helps SPN quickly find an already-created deal instead of re-entering the same object.

## Verification
- Supabase `nav_v2_get_deals_list` was checked as `a.k.ovchinnikov@borisoglebsk.etagi.com` / role `spn`.
- The RPC returns address and object type fields required for duplicate detection.
