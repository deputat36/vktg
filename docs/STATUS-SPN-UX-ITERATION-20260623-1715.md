# SPN UX iteration 2026-06-23 17:15

Scope: SPN deals list usability.

## Changed

- Added `assets/js/nav-v2/deals-spn-priority-hints-v2.js`.
- Connected it in `deals-v2.html` with cache version `20260623-1715`.
- For SPN users, each visible deal card can now show a short `Первым делом СПН` block with up to three immediate actions:
  - close rework;
  - collect missing required documents;
  - agree settlements;
  - agree expenses;
  - pass risk cases to lawyer with a short comment;
  - check broker tasks.
- The module also prefers server-provided `display_title` when present.

## Why

The list of deals should not only show counts. SPN needs to understand what to do first without opening every card and manually interpreting all badges.

## Safety

- CRM `Лидер` was not touched.
- No Supabase schema or data changes in this iteration.
- The module reads `nav_v2_get_deals_list` and only enhances already-rendered list cards in the UI.
