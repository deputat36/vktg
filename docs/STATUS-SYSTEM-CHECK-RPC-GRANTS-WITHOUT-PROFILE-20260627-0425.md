# System check: RPC grants without profile

Date: 2026-06-27 04:25.

## Reason

If profile/dashboard/deals RPC fail because of missing grants, the system check may not know the user's role yet. Previously `RPC права` could be skipped as if the role was not owner/admin.

That is unsafe for diagnostics: owner/admin needs the grants health check exactly when profile or list RPC are broken.

## Change

Updated `assets/js/nav-v2/nav-system-check-v2.js`:

- `RPC права` now attempts `nav_v2_get_rpc_grant_health` even when `currentProfile.role` is still unknown;
- if owner/admin, the real grants health result is shown;
- if the user is not owner/admin and role is unknown, the check shows a warning instead of a false OK;
- grant health rendering was extracted into `renderRpcGrantHealth(data)`;
- existing explicit handling of `permission denied for function ...` remains.

Updated `nav-system-check-v2.html`:

`nav-system-check-v2.js?v=20260627-0425`

## Verification target

Owner/admin:

- profile loads;
- RPC grants health runs and remains green.

SPN:

- normal profile/dashboard/list checks still work;
- grants check does not expose admin-only data.

## Boundaries

CRM «Лидер» was not changed.
