# Navigator v2 next steps — 2026-07-01

## Done now

- Role matrix added.
- Module map added.
- BAZA integration is accepted as a future read-only layer.
- PR #154 remains mergeable and the latest static GitHub Actions check is green.
- Repository search confirms frontend code uses `nav_v2_get_frontend_rpc_coverage_health`, not obsolete `nav_v2_get_frontend_coverage_health`.

## Current release blockers

1. Complete manual design and role QA before final merge.
2. Deploy live `nav-v2-deal-api` from the PR version after merge.
3. Re-run Navigator v2 health checks under an authenticated owner/admin session.
4. Validate the known Ovchinnikov deal-card timeout scenario.
5. Validate invite, login and password recovery flow for SPN users.

## Next autonomous work

1. Build role-based UX checklist.
2. Audit page visibility by role.
3. Audit old modules and patches.
4. Finish CSS cache-bust task.
5. Prepare data cleanup workflow.
6. Prepare Edge Function deploy task.
7. Prepare Security Advisor whitelist task.
8. Add minimal CI guards for obsolete RPC names and role-menu exposure.

## Product direction

Navigator v2 is the deal workspace.

BAZA is the knowledge source.

Future integration should show knowledge hints inside the deal card, without merging the two projects.
