# SPN UX iteration 2026-06-23 17:55

Scope: deal card stability after showing SPN handoff data.

## Changed

- Updated `assets/js/nav-v2/deal-card-spn-handoff-v2.js`.
- Bumped its cache version in `deal-card-v2.html` to `20260623-1755`.
- The handoff block now builds a stable view model and stores a `data-snapshot-key`.
- Existing block content is replaced only when the underlying handoff/readiness data changes.

## Why

The previous implementation could replace the handoff block every time the page `MutationObserver` reacted to DOM changes. That was unnecessary and could cause repeated self-triggered rerenders. The block is now stable after first render.

## Safety

- CRM `Лидер` was not touched.
- No Supabase schema or data changes in this iteration.
- Supabase was used only to verify that the tested SPN deal card still exposes `wizard_snapshot` through `nav_v2_get_deal_card`.
