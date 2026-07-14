# Navigator v2 — isolated authenticated E2E target

## Purpose

This runbook controls creation, use, evidence capture and deletion of the disposable Supabase branch required for authenticated desktop/mobile role testing.

The branch is not a staging environment and must not become a long-lived copy of production.

## Current blocker

Production project: `ofewxuqfjhamgerwzull`.

Only the production `main` branch currently exists. Authenticated E2E is therefore blocked and `authenticated-smoke=skipped` must not be interpreted as a pass.

The current Supabase branch price snapshot is recorded in `config/nav-v2-e2e-target-plan.json`:

- checked: 2026-07-14;
- starting compute price: USD 0.01344 per hour;
- planned maximum lifetime: 6 hours;
- planned compute ceiling: USD 0.08064;
- other usage such as egress or storage can add cost;
- preview branch usage is not protected by the Supabase Spend Cap.

The price must be rechecked immediately before creation. A changed price does not authorize creation automatically.

## Hard approval gate

Do not create the branch until all conditions are true:

1. The user explicitly confirms the current hourly cost.
2. Supabase `confirm_cost` returns a confirmation ID.
3. The confirmation ID is used once for the intended branch.
4. The target plan is changed from `approval_required` only in execution evidence, not by silently editing the repository config.
5. A responsible person is available to delete the branch after the run.

A generic instruction to continue project work is not cost approval.

## Branch creation contract

Requested name: `navigator-e2e`.

Creation rules:

- create from production project migrations;
- do not copy production rows;
- do not create a persistent branch;
- do not merge the branch back to production;
- use the returned branch project reference for all SQL, Auth and E2E configuration;
- verify the returned project reference is not `ofewxuqfjhamgerwzull`;
- verify the branch is healthy before seeding.

Supabase branches are separate environments with their own database, Auth, API and credentials. New branches are data-less unless explicitly seeded. Navigator must keep them data-less and add only synthetic fixtures.

## Synthetic fixture contract

Create only technical identities:

- email prefix: `nav-e2e`;
- profile name prefix: `[NAV E2E]`;
- required roles: admin, manager, spn, lawyer, broker, viewer;
- owner is optional and requires an additional explicit opt-in;
- test SPN must have a synthetic manager;
- no real staff mailbox, phone number, password or recovery link;
- no real customer, address, document, comment or transaction data.

Create at least two synthetic deals:

1. A deal visible to the test SPN.
2. A deal owned by another synthetic SPN or otherwise forbidden to the tested SPN.

The fixtures must include synthetic tasks, risks and documents sufficient to expose read and mutation controls.

## GitHub Environment contract

Environment: `navigator-e2e`.

Variables:

- `NAV_E2E_SUPABASE_URL`;
- `NAV_E2E_SPN_FORBIDDEN_DEAL_ID`.

Secrets:

- `NAV_E2E_SUPABASE_PUBLISHABLE_KEY`;
- `NAV_E2E_<ROLE>_EMAIL`;
- `NAV_E2E_<ROLE>_PASSWORD`.

Forbidden:

- production Supabase URL;
- service-role key;
- database password;
- access token;
- refresh token;
- real employee credentials.

The existing preflight must reject the production project reference and accounts without the `nav-e2e` prefix.

## Execution sequence

1. Recheck branch price.
2. Obtain explicit cost confirmation.
3. Create the disposable branch.
4. Record branch ID, project reference and creation timestamp.
5. Verify healthy status.
6. Retrieve only the branch publishable key and URL.
7. Apply synthetic fixtures.
8. Configure `navigator-e2e` Environment.
9. Run `Navigator v2 authenticated browser E2E` manually with target `authenticated` or `all`.
10. Keep owner disabled unless a disposable owner is separately approved.
11. Capture role artifacts, traces, screenshots and videos on failure.
12. Record PASS/FAIL for every mandatory role.
13. Delete the branch immediately after evidence capture.
14. Verify the branch no longer appears in the branch list.
15. Update issues #16, #159, #176 and #179 with evidence and cleanup status.

## Stop conditions

Stop the run and do not continue when:

- the returned project reference equals production;
- branch creation includes production data;
- any real account or client data is discovered;
- a required technical role is missing;
- environment secrets are incomplete;
- preflight fails;
- branch lifetime reaches 6 hours;
- cleanup cannot be verified.

A failed cleanup becomes a P0 issue. Do not create another branch until it is resolved.

## Evidence package

The run is complete only when the package contains:

- cost snapshot and explicit approval timestamp;
- branch ID and non-production project reference;
- creation and deletion timestamps;
- synthetic fixture manifest;
- workflow run URL;
- role-by-role result;
- browser artifacts;
- confirmation that production was not targeted;
- final branch-list evidence showing deletion.

## Current state

- Cost checked: USD 0.01344/hour.
- Explicit cost approval: absent.
- Branch created: no.
- GitHub Environment ready: no evidence.
- Technical accounts ready: no evidence.
- Authenticated role matrix: blocked.

No paid action is authorized by this document.
