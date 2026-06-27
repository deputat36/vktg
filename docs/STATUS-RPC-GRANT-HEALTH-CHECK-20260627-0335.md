# RPC grant health check

Date: 2026-06-27 03:35.

## Problem addressed

After the `nav_v2_get_deals_list` permission incident, the system needed a visible diagnostic that catches missing RPC `EXECUTE` grants before users report broken pages.

## Change

Added admin-only RPC:

`public.nav_v2_get_rpc_grant_health()`

It checks the Navigator v2 client RPC set and returns:

- whether every expected client RPC exists;
- whether `authenticated` has `EXECUTE`;
- whether `anon` has accidental `EXECUTE` access.

The function is callable by `authenticated`, but the body allows only active `owner`/`admin` profiles.

## UI

Updated the system check page:

- `assets/js/nav-v2/nav-system-check-v2.js`
- `nav-system-check-v2.html`

New check item:

`RPC права`

Expected healthy result for owner/admin:

`Проверено RPC: 30. authenticated имеет EXECUTE, anon закрыт.`

For non-admin roles, the check is skipped as normal.

## Migration

`supabase/migrations/20260627033500_nav_v2_rpc_grant_health_check.sql`

## Verification

Checked under `deputat36@gmail.com` / role `owner`:

- `ok = true`
- `missing_authenticated_count = 0`
- `anon_open_count = 0`
- checked RPC items: `30`

Checked function grants:

- `authenticated`: `true`
- `anon`: `false`
- `public`: `false`

Checked under СПН profile:

- function rejects access with owner/admin-only error.

## Boundaries

CRM «Лидер» was not changed.
