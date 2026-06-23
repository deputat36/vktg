# SPN UX iteration 2026-06-23 17:45

Scope: deal card visibility of SPN handoff data.

## Changed

- Added `assets/js/nav-v2/deal-card-spn-handoff-v2.js`.
- Connected it in `deal-card-v2.html` with cache version `20260623-1745`.
- The deal card now reads `deal.wizard_snapshot.deal.spn_final` and `deal.wizard_snapshot.deal.readiness_local` from `nav_v2_get_deal_card` and renders a visible `Текст передачи СПН` block when data exists.
- The block can show:
  - readiness percent from the wizard;
  - next client step;
  - SPN final comment;
  - handoff text with copy button;
  - missing items, blockers and notes from local readiness.

## Why

SPN already prepares a useful handoff text in the wizard, and the database stores it in `wizard_snapshot`. It should be visible in the deal card so lawyers, managers and СПН do not need to reconstruct context manually.

## Safety

- CRM `Лидер` was not touched.
- No Supabase schema or data changes in this iteration.
- A rollback test confirmed that `spn_final.handoff_text` and `readiness_local` are stored in `wizard_snapshot` and exposed through `nav_v2_get_deal_card`.
