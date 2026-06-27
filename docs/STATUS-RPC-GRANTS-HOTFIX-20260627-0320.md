# RPC grants hotfix

Date: 2026-06-27 03:20.

## Problem

User `deputat36@gmail.com` saw this error in Navigator v2:

`permission denied for function nav_v2_get_deals_list`

The page chrome loaded, but the deals list could not load.

## Cause

`authenticated` did not have `EXECUTE` on `public.nav_v2_get_deals_list(integer)`. Several other client RPC functions also had no explicit `EXECUTE` grant for `authenticated`.

## Fix

Restored `EXECUTE` grants for the Navigator v2 client RPC functions to `authenticated` only.

`anon` access was not opened.

Migration added:

`supabase/migrations/20260627032000_nav_v2_restore_authenticated_rpc_grants.sql`

## Verification

Checked user:

- email: `deputat36@gmail.com`
- role: `owner`
- active: `true`

Smoke test with this user JWT context:

- `nav_v2_get_my_profile()` ok
- `nav_v2_get_deals_list(50)` returned `21` deals
- `nav_v2_get_dashboard()` ok

## Boundaries

CRM «Лидер» was not changed.
