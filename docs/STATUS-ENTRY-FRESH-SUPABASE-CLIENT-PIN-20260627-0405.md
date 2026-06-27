# Entry pages Supabase client pinning

Date: 2026-06-27 04:05.

## Reason

After pinning the main working, admin and queue pages to the fresh Supabase client, the remaining entry/diagnostic pages still needed review.

The goal is to avoid old browser-cached `supabase-v2.js` on login, clean login, invite acceptance, password recovery and diagnostics.

## Changed pages

Added importmap pinning to:

- `nav-v2.html`
- `nav-accept-invite-v2.html`
- `deal-card-diag-v2.html`

Each page maps:

- `./supabase-v2.js` -> `./assets/js/nav-v2/supabase-v2.js?v=20260625-1320`
- `./supabase-v2.js?v=20260625-1230` -> `./assets/js/nav-v2/supabase-v2.js?v=20260625-1320`

## Version bumps

- `start-v2.js?v=20260627-0405`
- `nav-accept-invite-v2.js?v=20260627-0405`
- `deal-card-check-v2.js?v=20260627-0405` on diagnostics page

## Reviewed but not changed

- `spn-v2-checklist.html`

Reason: it uses `spn-checklist-presets-v2.js`, which only prepares local draft presets for manual SPN training scenarios and does not import the Supabase client.

## Verification target

- Login / clean login page loads with fresh Supabase client.
- Invite acceptance / password recovery page loads with fresh Supabase client.
- Deal-card diagnostics page uses the same client mapping as safe/check card pages.
- Existing Supabase smoke checks remain green.

## Boundaries

CRM «Лидер» was not changed.
