# System check RPC permission hints

Date: 2026-06-27 04:15.

## Reason

The earlier user-visible incident was:

`permission denied for function nav_v2_get_deals_list`

Before this change, the system check could treat some RPC failures as possible transient timeouts when another section had already loaded. Permission-denied errors should be classified explicitly because they require grants, not waiting or refreshing.

## Change

Updated `assets/js/nav-v2/nav-system-check-v2.js`:

- detects `permission denied for function <name>`;
- shows a direct message that `EXECUTE` is missing for the RPC;
- points owner/admin to the `RPC права` check;
- prevents dashboard permission errors from being downgraded to transient warnings;
- applies the same classification to profile, dashboard, deals, team and RPC grant health checks.

Updated `nav-system-check-v2.html`:

`nav-system-check-v2.js?v=20260627-0415`

## Expected behavior

If a function grant is missing, diagnostics should show an error like:

`Нет EXECUTE на RPC nav_v2_get_deals_list. Это не таймаут: нужно восстановить grants для authenticated и проверить пункт «RPC права».`

## Verification

Healthy state remains green:

- RPC grants health: `true`
- profile: ok
- dashboard: ok
- deals list: ok

## Boundaries

CRM «Лидер» was not changed.
