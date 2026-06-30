# Navigator v2 audit — 2026-06-30

## Status

PR #154 is open and mergeable. Latest audited head: `6631c39b97fb0efd4c4b98b50c13922ef09298e6`.

Supabase project is ACTIVE_HEALTHY on PostgreSQL 17.6.1.

## What is green

- Frontend RPC coverage: ok=true, 38 items, 0 problems.
- RPC grant health: ok=true.
- Team profile quality: ok=true, 2 warnings, 0 errors.
- Data integrity: ok=true, 0 problems.
- Security hardening health: ok=true.
- RLS is enabled on all 10 Navigator v2 base tables.
- anon has no direct SELECT on Navigator v2 tables.
- PR review threads are empty.

## Main risks

1. Data quality is not clean enough for comfortable production use.
   - total deals: 21;
   - real deals: 16;
   - demo deals: 5;
   - deals with issue flags: 21;
   - open quality tasks: 44;
   - urgent quality tasks: 2.

2. Live Edge Function `nav-v2-deal-api` lags behind PR code.
   - live version: 3;
   - status: ACTIVE;
   - JWT: true;
   - PR contains safer RPC error parsing, but live deploy is still pending.

3. Supabase Advisor still has warnings.
   - Many callable SECURITY DEFINER RPCs need an explicit whitelist review.
   - Performance Advisor reports RLS policy and index cleanup work.

4. GitHub has no CI status checks for this PR.
   - Current verification is manual plus Supabase health RPCs.

5. CSS design hardening is in PR, but CSS cache-bust still needs follow-up.

## Existing follow-up issues

- #155 — RLS performance cleanup.
- #156 — data quality cleanup.
- #157 — team profile quality cleanup.
- #158 — deploy latest nav-v2-deal-api live code.
- #159 — design audit.
- #160 — CSS cache-bust after design changes.
- #161 — Supabase Advisor RPC review.

## Recommended order

### Before merge

1. Complete manual QA from `docs/NAV_V2_MANUAL_QA.md`.
2. Complete design audit from `docs/NAV_V2_DESIGN_AUDIT.md`.
3. Confirm cache behavior for updated `assets/css/nav-v2.css`.
4. Do not merge if design blockers or role-access blockers are found.

### Immediately after merge

1. Deploy live `nav-v2-deal-api` from PR.
2. Re-run Navigator health checks.
3. Start data cleanup for missing parties, address, SPN, lawyer and broker assignments.

### Next hardening sprint

1. Review SECURITY DEFINER RPC whitelist.
2. Reduce multiple permissive policies in Navigator v2 tables.
3. Add minimal GitHub Actions CI.
4. Add role matrix documentation.

## Assessment

Navigator v2 is technically close to merge-ready. The core release health is green and the PR is mergeable. The main remaining work is operational cleanup, live Edge Function sync, CSS cache-bust, Advisor hardening and CI.