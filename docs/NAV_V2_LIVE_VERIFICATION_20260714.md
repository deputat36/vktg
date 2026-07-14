# Navigator v2 — live verification 2026-07-14

## Scope

Read-only verification after PR #284. No Supabase branch, migration, Edge deployment, Auth user, production row or GitHub Environment secret was created or changed.

This document records connector-equivalent evidence. It does not replace:

- manual GitHub Actions workflow `navigator-production-readonly` with `allow_drift=false`;
- isolated authenticated E2E on a disposable `navigator-e2e` branch;
- owner evidence packages for duplicate cleanup, pilot execution or responsibility correction.

## GitHub baseline

- repository: `deputat36/vktg`;
- main after PR #284: `febb409f76ff6140b09b05dd7682f37524b28288`;
- release baseline latest migration: `20260714125054`;
- canonical migration: `20260714130000_nav_v2_exact_duplicate_review_pack.sql`;
- canonical source blob: `cd6c0962b7f3bfcce5bc3b51fe717fbfca100a14`;
- live alias `20260714125054` points to canonical `20260714130000`;
- reverse canonical mapping points back to live `20260714125054`.

## Supabase migration verification

`Supabase.list_migrations` returned latest production migration:

`20260714125054_nav_v2_exact_duplicate_review_pack`

Result:

- baseline latest equals production latest;
- live alias exists;
- reviewed canonical source exists;
- no newer unrecorded Navigator migration was detected.

## Navigator Edge verification

### nav-invite-user

- production version: 10;
- status: ACTIVE;
- `verify_jwt=true`;
- live bundle SHA-256: `14020dac054cadf3ca86d19313cf2bc2b012aca9d634e76e8dd0ffde11b05a5f`;
- repository source blob: `e914cd0c54fbdb296434b47fd28fa6cfd327fff8`.

### nav-v2-deal-api

- production version: 4;
- status: ACTIVE;
- `verify_jwt=true`;
- live bundle SHA-256: `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`;
- repository source blob: `071b70584365a52519e8a15a8c8d2c956247d1f4`.

Result: Navigator Edge versions, status, JWT policy, live bundle hashes and repository source blobs match the release baseline.

Other Edge Functions in the shared Supabase project are outside the Navigator-only baseline and were not modified.

## Marked no-JWT probes — PR #284

PR #284 changed only the diagnostic client script and CI contract.

Each expected unauthenticated Edge request now contains:

- query marker `nav_v2_probe=nav-v2-edge-auth-smoke`;
- random `probe_id`;
- diagnostic headers and body markers without credentials.

Production log evidence:

- `nav-invite-user?...nav_v2_probe=nav-v2-edge-auth-smoke&probe_id=...` returned HTTP 401;
- `nav-v2-deal-api?...nav_v2_probe=nav-v2-edge-auth-smoke&probe_id=...` returned HTTP 401.

The expected security result remains unchanged: both functions reject requests without JWT. The marker only separates scheduled/PR probes from unrelated unauthorized traffic.

Checks:

- dedicated Edge auth observability contract: PASS;
- Python compilation: PASS;
- live Pages smoke: PASS;
- live Edge no-JWT smoke: PASS;
- live RPC auth smoke: PASS;
- review threads: 0.

## Auth log evidence

Production Auth logs show the following real sequence for an existing employee account:

1. one password attempt returned `invalid_credentials`;
2. `/recover` returned HTTP 200;
3. a later password login returned HTTP 200;
4. subsequent refresh-token logins returned HTTP 200.

This is useful evidence that production recovery and login operated for that account on 2026-07-14.

It is not invite/recovery E2E PASS because:

- production account and production Auth were involved;
- the whole flow was not controlled by disposable test fixtures;
- email delivery, action-link consumption and role matrix were not captured as one isolated test;
- negative role/mutation cases were not executed.

## Platform notices

Auth logs include Supabase GoTrue deprecation notices for platform environment settings:

- `GOTRUE_JWT_ADMIN_GROUP_NAME`;
- `GOTRUE_JWT_DEFAULT_GROUP_NAME`.

No application code change was made because these notices are emitted by the managed Auth service configuration and no project-level remediation was validated through the available tools.

## Production state

- profiles: 5;
- deals: 23;
- tasks: 98;
- risks: 53;
- documents: 198;
- events: 118;
- latest migration: `20260714125054`;
- Supabase branches: production `main` only;
- preview branches: 0.

## Remaining gates

- Manual production-readonly drift workflow with `allow_drift=false` is still not recorded as PASS.
- Issue #282 has no explicit cost approval; do not call `confirm_cost` and do not create `navigator-e2e`.
- Issue #273 still requires owner decisions for four duplicate groups.
- Six pilot files have not been supplied.
- Four responsibility evidence files have not been supplied.
- `authenticated-smoke=skipped` remains not PASS.

## Next permitted actions

1. If issue #282 receives the exact approval phrase, recheck cost before `confirm_cost`, create only the disposable no-production-data branch, run the role matrix and delete the branch immediately after evidence capture.
2. If a valid duplicate owner decision is supplied, prepare only fresh read-only revalidation and cleanup preview for one group.
3. If pilot or responsibility artifacts are supplied, validate the complete chain before any mutation.
4. Without new evidence, keep production rows unchanged.
