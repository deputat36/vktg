# Admin and queue Supabase client pinning

Date: 2026-06-27 03:55.

## Reason

The main working pages were already pinned to the fresh `supabase-v2.js?v=20260625-1320` client. The remaining owner/admin and queue entry pages still loaded modules through bare `./supabase-v2.js` imports and could use an older browser-cached client.

## Change

Added importmap pinning to:

- `admin-v2.html`
- `nav-access-v2.html`
- `nav-access-audit-v2.html`
- `queue-v2.html`

Each page maps:

- `./supabase-v2.js` -> `./assets/js/nav-v2/supabase-v2.js?v=20260625-1320`
- `./supabase-v2.js?v=20260625-1230` -> `./assets/js/nav-v2/supabase-v2.js?v=20260625-1320`

## Version bumps

- `admin-loader-v2.js?v=20260627-0355`
- `queue-v2.js?v=20260627-0355`

## Verification target

Owner/admin:

- team page loads;
- access page loads;
- access audit loads;
- RPC grants health remains green.

Lawyer:

- lawyer queue loads using the same fresh Supabase client.

## Boundaries

CRM «Лидер» was not changed.
