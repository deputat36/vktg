# SPN UX iteration 2026-06-23 16:45

Scope: deal card UX for SPN handoff preparation.

## Changed

- Updated `assets/js/nav-v2/handoff-detail-hints-v2.js` so the `Что закрыть перед передачей` block refreshes after SPN actions with documents, tasks, quick statuses, or the main deal status save button.
- Reworked the hint block rendering to update existing content by data version instead of appending stale duplicate blocks.
- Added request sequencing for `nav_v2_get_deal_card` reloads so late RPC responses cannot overwrite newer card data.
- Bumped the handoff hint module version in `deal-card-v2.html` to `20260623-1645`.

## Why

For SPN, the handoff block should be an operational checklist, not a static snapshot. After a document is marked received or a task is closed, the checklist must reflect the new state without requiring a full page reload.

## Safety

- CRM `Лидер` was not touched.
- No Supabase schema or data changes in this iteration.
- Existing Supabase RPC `nav_v2_get_deal_card` remains the single source of truth for the checklist.
