# Dispatch setup and preflight

## Ownership

This living procedure owns the ordered path for configuring and verifying a repository for
Vercel-native dispatch. It composes the topic contracts rather than duplicating their full
rationale.

- Deployment details: `dispatch-deployment-contract.md`.
- Credentials and secret custody: `dispatch-credentials-and-trust.md`.
- Workflow/Sandbox runtime: `dispatch-workflow-and-sandbox-runtime.md`.
- Anchor and landing: `dispatch-anchor-and-landing.md`.
- Pi host: `dispatch-pi-runner.md`.
- Diagnosis: `dispatch-debugging-and-observability.md`.

The future reusable setup skill must implement this procedure while keeping
`README-draft.md` as the user-facing contract.

## Product boundaries

Setup configures one repo-local, Vercel-native execution spine. It does not create:

- a backend-agnostic executor;
- cloud slots;
- an Eve chassis;
- agent logic in Workflow steps;
- cross-repository dispatch;
- automatic merge or landing without human review.

The implemented remote harness is Pi only.

## Phase 1: discover without mutation

Resolve and verify:

- repository root;
- GitHub `owner/repo` from the intended remote;
- package root `ts/packages/capabilities/vercel`;
- repo-root `ns.toml` `[dispatch]` table;
- linked Vercel project/team IDs;
- Vercel Root Directory;
- exact `ts/package.json#packageManager` declaration;
- whether the GitHub App and repository installation already exist.

Do not guess issuer, audience, team, project, repository, or trust URLs from names.

## Phase 2: human GitHub App boundary

Guide the human through App creation or existing-App key rotation. Read-only checks verify:

- App identity;
- installation ID;
- selected repository;
- required permission names.

The App private key is sensitive. Existing-App key rotation remains a GitHub UI action.
Before wider deployment, remove prototype-only excess `actions: write` and
`workflows: write` permissions.

Detailed custody rules are in `dispatch-credentials-and-trust.md`.

## Phase 3: link Vercel and configure variables

From `ts/packages/capabilities/vercel`:

1. `vercel link` to the intended project if package `.vercel/project.json` is absent.
2. Pull Development environment to ignored `.env.local`.
3. Inspect only non-secret OIDC claims.
4. Configure required GitHub App, repository, and OIDC trust variables by name and
   sensitivity.
5. Keep `.env.local` narrowly ignored; do not accept an accidental `.env*` broadening.

Vercel sensitive values cannot be read back or renamed. Replacement requires fresh secret
material, parallel verification, then cleanup of the superseded value.

## Phase 4: build the exact deployable

From the package directory:

```sh
pnpm build:deployable
```

The gate must prove:

- native typecheck;
- no tolerated Vercel TypeScript diagnostics;
- expected API function inventory;
- hermetic CommonJS API handlers;
- no API `filePathMap`;
- emitted relative-module closure;
- Workflow flow, step, webhook, and manifest artifacts;
- Queue triggers;
- every `"use workflow"` source discovered;
- every route-started Workflow ID present;
- merged Build Output routes.

Do not proceed from a local source-only or partial Workflow build.

## Phase 5: promote from the correct boundary

Materialize the complete package-local `.vercel/output` at the repository deployment
boundary with the linked project metadata. From the repository root:

```sh
vercel deploy --prebuilt --scope <team-slug> --prod --yes
```

After upload, inspect the exact deployment before retrying any ambiguous transport failure.
Verify the production alias points to the intended deployment inventory.

## Phase 6: verify in increasing-cost order

1. Production health route.
2. Safe unauthenticated rejection.
3. Authenticated read-only dispatch identity preflight.
4. Hello Workflow and Queue delivery.
5. Explicit human consent for the first billable private-repository Sandbox probe unless
   current Objective policy pre-authorizes it.
6. Exact-SHA marker/HEAD verification and mandatory cleanup.
7. Short supervision smoke.
8. Long-run supervision proof where required.
9. Explicit per-action consent for source/anchor pushes and PR mutation before a real
   dispatch.

Never create a Sandbox after a cheaper preflight failure.

## Controlled private-repository probe

The probe takes a full remote SHA, not an arbitrary repository input. It must verify:

- configured repository;
- clone-only token mint without token output;
- non-persistent Node 24 Sandbox;
- shallow checkout;
- fixed marker command;
- exact requested/observed HEAD equality;
- cleanup on success and every post-creation failure.

Cleanup failure makes the probe failed and requires manual remediation guidance.

## Per-dispatch local preflight

Before any source/anchor mutation, `ns dispatch prompt` checks:

- repository and attached branch are usable;
- worktree is clean;
- `[dispatch]` exists and contains a supported harness and stable deployment URL;
- `ts/package.json#packageManager` declares an exact supported pnpm version;
- Development OIDC token is available by name;
- the production run-status route accepts the Development identity using a valid-shaped
  nonexistent Workflow run ID.

After preflight, the command reads remote source freshness and pushes when missing/behind.
Source and anchor pushes plus PR creation/stamping remain explicit-consent actions under the
Objective policy.

Preflight reports names, categories, and safe non-secret mismatches—never values.

## Failure categories and remediation

- dirty tree: commit or stash before dispatch;
- detached/unusable source: check out a branch and repair local git state;
- source not remotely reachable: push under explicit consent;
- missing/expired Development token: rerun link/env pull;
- 401: credential absent, malformed, expired, or unverifiable;
- 403: verified identity fails exact trust policy;
- deployment misconfiguration: report only the invalid variable name;
- function import failure: inspect final Build Output before credentials;
- pending run with `run_created` only: inspect Workflow consumers and Queue registration;
- Sandbox phase failure: report create/checkout/command/revision/cleanup phase;
- harness failure: inspect Pi lifecycle, tools, child PATH, and result protocol;
- anchor PR “No commits between”: use metadata-only initialization commit;
- ambiguous deployment polling failure: inspect the returned deployment before retry;
- orphan branch after failed PR creation: report it and delete only with authorization.

The full diagnostic ladder is in `dispatch-debugging-and-observability.md`.

## Cleanup after proof

Only after the replacement path succeeds:

- remove old variable names;
- revoke superseded App keys;
- delete downloaded PEM material;
- remove orphan dispatch branches under explicit authorization;
- retain evidence locators without secret values.

The inert deployed `NS_DISPATCH_SANDBOX_MINT_SECRET` still awaits human cleanup. It is not
part of new setup.

## Setup completion bar

Setup is complete only when:

- the durable deployment contract passes locally;
- the exact promoted inventory is Ready;
- authenticated preflight passes;
- hello Workflow completes;
- controlled private checkout proves exact SHA and cleanup;
- one controlled dispatch proves the current harness, anchor, landing, and reporting path;
- any degraded result is recorded as such in `dispatch-live-evidence.md`.

The first completed dispatch proved fallback landing but exposed Pi lifecycle and child-PATH
defects. One rerun remains required before calling the Pi setup path fully healthy.
