# SPN UX iteration 2026-06-23 18:05

Scope: deal card visibility for older SPN-created deals.

## Changed

- Updated `assets/js/nav-v2/deal-card-spn-handoff-v2.js`.
- Bumped its cache version in `deal-card-v2.html` to `20260623-1805`.
- Added fallback handoff generation for older deals that have `wizard_snapshot.deal` but do not have `spn_final.handoff_text` yet.
- The fallback builds a concise transfer text from saved wizard fields:
  - preparation mode;
  - representation;
  - stage;
  - object type;
  - address;
  - price and deposit;
  - next action;
  - SPN comments if present.

## Why

New deals can store an explicit `spn_final` block, but existing SPN deals were created before that structure. They still contain enough wizard snapshot data to show useful context in the card.

## Safety

- CRM `Лидер` was not touched.
- No Supabase schema or data changes in this iteration.
- Supabase check confirmed the current Ovchinnikov test deal has `wizard_snapshot.deal` fields but no `spn_final.handoff_text`, so this fallback is needed for current production data.
