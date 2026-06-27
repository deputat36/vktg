# Fresh Supabase client pinning

Date: 2026-06-27 03:45.

## Reason

After the RPC grant incident, the main working pages should not depend on an old browser-cached `supabase-v2.js` module.

`supabase-v2.js?v=20260625-1320` contains the current protections:

- longer RPC timeout;
- RPC deduplication for read calls;
- refresh-token deduplication;
- wizard save recovery logic.

## Change

Added importmap pinning for the main working entry pages:

- `deals-v2.html`
- `dashboard-v2.html`
- `spn-v2.html`
- `nav-system-check-v2.html`

Each page now maps module imports from `./assets/js/nav-v2/`:

- `./supabase-v2.js` -> `./assets/js/nav-v2/supabase-v2.js?v=20260625-1320`
- `./supabase-v2.js?v=20260625-1230` -> `./assets/js/nav-v2/supabase-v2.js?v=20260625-1320`

## Version bumps

- `deals-v2.js?v=20260627-0345`
- `dashboard-v2.js?v=20260627-0345`
- `spn-smart-v4.js?v=20260627-0345`
- `nav-system-check-v2.js?v=20260627-0345`

## Verification target

Owner/admin smoke path:

- dashboard loads;
- deals list loads;
- system check loads;
- RPC grants health remains green.

SPN smoke path:

- new deal form loads;
- save-related modules use the same fresh Supabase client.

## Boundaries

CRM «Лидер» was not changed.
