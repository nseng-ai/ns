# Dispatch live evidence

## Contract

This is the append-only ledger of witnessed cloud-execution facts. It records what happened,
where to inspect it, what it proves, and what it does not prove. Living topic references in
this directory own current engineering truth.

Do not silently rewrite prior observations. Add an explicit correction or supersession
entry. Never include secret values, decrypted Workflow inputs, private keys, installation
tokens, landing credentials, OIDC JWTs, or model credentials.

## 2026-07-13 — private-repository Sandbox checkout

### Locators

- Revision: `5308b3d45ba520fd530d5a288e3de4ab32914b05`.
- Repository: `nseng-ai/ns`.

### Observation

The production mint route accepted Development OIDC on the dispatch-owned header, minted a
clone-purpose GitHub App installation token without outputting it, created a non-persistent
Node 24 Sandbox, checked out the private repository at the exact requested SHA, produced the
fixed marker and matching HEAD, and cleaned up successfully.

### Bounded claim

Proves the package/project/OIDC/App/private-checkout boundary and controlled cleanup. Does
not prove Workflow supervision, the Pi harness, or anchor landing.

### Topic owners

- `dispatch-credentials-and-trust.md`
- `dispatch-workflow-and-sandbox-runtime.md`
- `dispatch-setup-and-preflight.md`

## 2026-07-14 — Workflow probes on proof deployment

### Locators

- Hello: `wrun_01KXFVZ9QJ5M8NHJB034YNS3JP`.
- Private-repository Sandbox Workflow:
  `wrun_01KXFVZYEFN23G79G38DGW7YRG`.
- Checked-out revision: `946907af2429470dc2de6f9febb72583f761ab9b`.
- 15-second supervision smoke:
  `wrun_01KXFW0NCR93B316X0NERCNBPY`.
- 840-second supervision proof:
  `wrun_01KXFW232K09QFBPSP82HTF6NX`.

### Observation

Once the deployed inventory contained the Workflow consumers and hermetic API functions:

- hello completed through Queue-delivered flow/step consumers;
- in-process App minting supported private checkout in Workflow steps;
- detached supervision completed a short smoke;
- the 840-second command completed after 873 seconds through poll/sleep supervision.

### Bounded claim

Proves Workflow/Queue execution, private Sandbox creation from steps, and supervision beyond
a single Function invocation ceiling. The deployment used a proof-only manual CommonJS
rebundle and did not yet prove a source-controlled deployment path or prompt dispatch.

### Topic owners

- `dispatch-deployment-contract.md`
- `dispatch-workflow-and-sandbox-runtime.md`
- `vercel-workflow-deployment-feedback-report.md`

## 2026-07-14 — malformed preflight run ID

### Observation

The first read-only dispatch identity preflight reached production but returned 502
`run-status-read-failed`. Vercel logs showed only the GET invocation. A differential request
established:

- `ns-dispatch-identity-preflight` → 502;
- `wrun_00000000000000000000000000` → 404 `run-not-found`.

### Bounded claim

Proves the caller identity reached the authenticated run-status adapter and that the Workflow
SDK requires a valid-shaped run ID even when the resource is deliberately nonexistent. Does
not indicate deployment or OIDC failure.

### Topic owners

- `dispatch-debugging-and-observability.md`
- `dispatch-setup-and-preflight.md`

## 2026-07-14 — durable hermetic production deployment

### Locators

- Deployment: `dpl_He9jnMkZmH7fTYg9K3DcHp1mKbds`.
- Deployment URL:
  `https://ns-dispatch-vpfcd9lom-schrockns-projects.vercel.app`.
- Stable alias: `https://ns-dispatch.vercel.app`.
- Hello run: `wrun_01KXFYJS9N6D2JNTKA6D3B2MYP`.

### Observation

The source-controlled build bundled all four API handlers as CommonJS, removed their
`filePathMap` values, retained Workflow flow/step/webhook/manifest artifacts, merged routes,
and deployed the relocated complete Build Output with `--prebuilt`. Vercel inspection showed
the expected API and Workflow inventory. All four dispatch preflight checks passed. The
hello Workflow completed on this exact deployment.

### Bounded claim

Proves the durable deployment and authenticated preflight path. Does not by itself prove the
prompt harness or git landing.

### Topic owners

- `dispatch-deployment-contract.md`
- `dispatch-setup-and-preflight.md`
- `dispatch-debugging-and-observability.md`

## 2026-07-14 — failed anchor PR initialization

### Locators

- Source branch: `cloud-dispatch/hermetic-deployable`.
- Orphan anchor:
  `dispatch/cloud-dispatch-hermetic-deployable-269efe79`.

### Observation

The authorized command pushed source and anchor branches. GitHub rejected PR creation with
“No commits between” because both refs pointed to the same commit. No Workflow run started.
The orphan branch was later deleted with explicit authorization.

### Bounded claim

Proves that an up-front GitHub PR requires the anchor to contain a commit ahead of its base.
It does not test Workflow execution.

### Resulting contract change

The anchor now starts with a metadata-only empty child commit. See
`dispatch-anchor-and-landing.md`.

## 2026-07-14 — first completed prompt dispatch

### Locators

- Source revision: `d053069a89a017cc3c20d3116dc77580a09af80e`.
- Source branch: `cloud-dispatch/initialize-anchor-pr`.
- Anchor branch:
  `dispatch/cloud-dispatch-initialize-anchor-pr-c5a86a32`.
- Anchor PR: <https://github.com/nseng-ai/ns/pull/3612>.
- Workflow run: `wrun_01KXFZ14SBRCGTSPP5PEH19C3T`.
- Deployment: `dpl_He9jnMkZmH7fTYg9K3DcHp1mKbds`.
- Landed commit: `4e6f8629924c3a7f8227e8ad92dfaf220dd29816`.
- PR-only landed artifact (not present on the local source branch):
  `.ns/objectives/cloud-execution/references/remote-dispatch-steel-thread-proof.md`.

### Observation

The command pushed the source, created a metadata-only anchor commit, opened PR #3612,
stamped the Workflow run ID, and started the dispatch. The Workflow completed. Pi read and
wrote the requested file, and its decision log was published into the PR body. Every Bash
call was blocked because `HARNESS_SESSION_ID` had not been initialized. A task-subagent
attempt separately failed with `spawn pi ENOENT`. Pi therefore did not validate or commit.
The supervisor detected the dirty checkout, created a fallback App-bot commit, and landed the
one requested file.

### Bounded claim

Proves the full production route through anchor creation, Workflow/Sandbox supervision, Pi
model and filesystem work, fallback landing, run-ID traceability, and decision-log
publication. Does not prove healthy Pi Bash, agent-created commits, checkout-local subagent
spawning, or the normal landing path.

### Resulting contract changes

- Bind Pi extensions and await `session_start` before prompting.
- Prepend `ts/packages/capabilities/vercel/node_modules/.bin` to child `PATH`.
- Require one controlled rerun before declaring the Pi steel thread healthy.

### Topic owners

- `dispatch-anchor-and-landing.md`
- `dispatch-pi-runner.md`
- `dispatch-workflow-and-sandbox-runtime.md`
- `dispatch-debugging-and-observability.md`

## Pending evidence

A controlled runner-verification dispatch should record:

- first Bash call succeeds;
- formatting or harmless validation runs;
- the agent creates its own commit;
- a task subagent resolves checkout-local `pi`;
- landing uses agent-produced history rather than the fallback commit.
