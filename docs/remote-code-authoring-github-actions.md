# GitHub Actions Remote Code Authoring: Erk Ground-Truth Survey

This report summarizes a source-code survey of `/Users/schrockn/code/erk` focused on GitHub Actions dispatching as a remote code-authoring substrate. The goal is not to describe Erk's documented intent; it is to extract ground-truth implementation lessons for building a higher-quality version in `asdl-tools`.

The investigation used source files, workflow YAML, and tests as evidence. It deliberately treats documentation as secondary.

## Executive Summary

Erk uses GitHub Actions as a remote agent queue:

1. A CLI command creates or updates a branch and draft PR.
2. The CLI dispatches a `workflow_dispatch` run.
3. A workflow installs Erk and Claude Code, checks out the branch, runs a Claude command, commits and pushes changes, updates PR metadata, and persists session context.
4. The CLI and TUI track runs, logs, cancellation, retries, and lifecycle status through GitHub API calls and PR metadata.

The system is powerful, but its correctness depends on many implicit contracts between Python, GitHub Actions YAML, shell snippets, PR-body metadata, branch files, and workflow run names.

The main design lessons for `asdl-tools` are:

- Treat workflow dispatch as a typed domain operation, not a loose API call.
- Make dispatch correlation IDs first-class and impossible to override accidentally.
- Validate CLI-supplied workflow inputs against workflow manifests.
- Make local and no-clone remote backends pass the same conformance tests.
- Move business logic out of YAML shell into tested exec commands.
- Make dry-run output an exact representation of the real mutation plan.
- Store remote authoring state as typed events and projections rather than scattered PR-body/comment/branch conventions.

## Source Map

### GitHub Gateways

Local `gh` / local clone backend:

- `/Users/schrockn/code/erk/packages/erk-shared/src/erk_shared/gateway/github/real.py`
  - `RealLocalGitHub._dispatch_workflow_impl()`
  - `RealLocalGitHub.trigger_workflow()`
  - `list_workflow_runs()`
  - `get_workflow_run()`
  - `get_run_logs()`
  - `cancel_workflow_run()`
  - `rerun_workflow_run()`

No-local-clone REST backend:

- `/Users/schrockn/code/erk/packages/erk-shared/src/erk_shared/gateway/remote_github/abc.py`
- `/Users/schrockn/code/erk/packages/erk-shared/src/erk_shared/gateway/remote_github/real.py`
  - `RealRemoteGitHub.dispatch_workflow()`
  - `create_ref()`
  - `create_file_commit()`
  - `create_pull_request()`
  - `update_pull_request_body()`
  - `add_labels()`
  - `add_issue_comment()`
- `/Users/schrockn/code/erk/packages/erk-shared/src/erk_shared/gateway/http/auth.py`
  - `fetch_github_token()`
  - `fetch_github_token_or_none()`

### User-Facing Orchestration

- `/Users/schrockn/code/erk/src/erk/cli/commands/pr/dispatch_cmd.py`
  - `erk pr dispatch`
  - local planned-PR dispatch
  - remote `--repo` planned-PR dispatch
- `/Users/schrockn/code/erk/src/erk/cli/commands/one_shot_remote_dispatch.py`
  - no-clone one-shot PR creation and dispatch
- `/Users/schrockn/code/erk/src/erk/cli/commands/one_shot/operation.py`
  - `erk one-shot`
- `/Users/schrockn/code/erk/src/erk/cli/commands/launch_cmd.py`
  - `erk launch pr-address|pr-rebase|pr-rewrite|learn|one-shot|consolidate-learn-plans`
- `/Users/schrockn/code/erk/src/erk/cli/commands/objective/plan_cmd.py`
  - objective-driven one-shot dispatch
- `/Users/schrockn/code/erk/src/erk/cli/commands/run/`
  - workflow run list/log/cancel/retry commands

### GitHub Actions Workflows

Dispatchable remote-authoring workflows:

- `/Users/schrockn/code/erk/.github/workflows/one-shot.yml`
- `/Users/schrockn/code/erk/.github/workflows/plan-implement.yml`
- `/Users/schrockn/code/erk/.github/workflows/pr-address.yml`
- `/Users/schrockn/code/erk/.github/workflows/pr-rebase.yml`
- `/Users/schrockn/code/erk/.github/workflows/pr-rewrite.yml`
- `/Users/schrockn/code/erk/.github/workflows/learn.yml`
- `/Users/schrockn/code/erk/.github/workflows/consolidate-learn-plans.yml`

Workflow setup actions:

- `/Users/schrockn/code/erk/.github/actions/erk-remote-setup/action.yml`
- `/Users/schrockn/code/erk/.github/actions/setup-claude-code/action.yml`

### Metadata and Sessions

- `/Users/schrockn/code/erk/packages/erk-shared/src/erk_shared/gateway/github/metadata/schemas.py`
- `/Users/schrockn/code/erk/packages/erk-shared/src/erk_shared/gateway/github/metadata/plan_header_data.py`
- `/Users/schrockn/code/erk/packages/erk-shared/src/erk_shared/pr_store/planned_pr.py`
- `/Users/schrockn/code/erk/src/erk/cli/commands/exec/scripts/push_session.py`
- `/Users/schrockn/code/erk/src/erk/cli/commands/exec/scripts/fetch_sessions.py`
- `/Users/schrockn/code/erk/packages/erk-shared/src/erk_shared/sessions/manifest.py`

## How Dispatch Works

Erk has two dispatch backends with the same core shape.

### Local Clone + `gh api`

`RealLocalGitHub.trigger_workflow()` dispatches a workflow by shelling out to `gh api`:

```text
POST repos/{owner}/{repo}/actions/workflows/{workflow}/dispatches
```

It sends a payload shaped like:

```json
{
  "ref": "<branch-or-default-branch>",
  "inputs": {
    "distinct_id": "<generated-correlation-id>",
    "...": "..."
  }
}
```

Then it polls:

```text
GET repos/{owner}/{repo}/actions/workflows/{workflow}/runs?per_page=10
```

and returns the run whose `display_title` contains `:<distinct_id>`.

Failure behavior includes:

- `RuntimeError` for `gh` subprocess failures.
- `RuntimeError` if the workflow runs response is not a JSON list.
- `RuntimeError` if a matched run is `skipped` or `cancelled`.
- `RuntimeError` after 11 polling attempts if no matching run appears.

### No-Clone REST Dispatch

`RealRemoteGitHub.dispatch_workflow()` performs the same operation through Erk's `HttpClient` rather than `gh api` subprocesses.

It also posts to:

```text
repos/{owner}/{repo}/actions/workflows/{workflow}/dispatches
```

and polls:

```text
repos/{owner}/{repo}/actions/workflows/{workflow}/runs?per_page=10
```

The remote backend supports enough REST operations to author code without a local clone:

- get default branch name and SHA;
- create refs;
- commit file contents;
- create draft PRs;
- update PR bodies;
- add labels;
- post comments;
- dispatch workflows.

The remote backend currently does not expose full no-clone parity for run logs, cancellation, rerun, or GraphQL node ID lookup.

## Correlation Contract and Its Risks

The dispatch correlation contract is central:

1. Generate a six-character base36 `distinct_id`.
2. Include that value as a workflow input.
3. Require the workflow `run-name` to include `:${{ inputs.distinct_id }}`.
4. Poll recent runs and find the first `display_title` containing `:<distinct_id>`.

Examples:

```yaml
# plan-implement.yml
run-name: "${{ inputs.dispatch_type == 'incremental' && '[incremental] ' || '' }}${{ inputs.branch_name }} (#${{ inputs.impl_pr_number }}):${{ inputs.distinct_id }}"
```

```yaml
# one-shot.yml
run-name: "one-shot${{ inputs.plan_only && '(plan)' || '' }}:#${{ inputs.pr_number }}:${{ inputs.distinct_id }}"
```

This is clever, but fragile.

### Specific Risks

- Polling only checks `per_page=10`; high dispatch volume can push the target run out of the window.
- Matching is by substring in `display_title`, not by a structured API field.
- Polling does not filter by event, actor, head branch, dispatch time, or ref.
- A workflow YAML edit that removes `distinct_id` from `run-name` makes run discovery fail even though dispatch succeeded.
- A caller-provided `inputs["distinct_id"]` can override the generated ID in the actual workflow input while polling still searches for the generated ID.
- A rare six-character ID collision could match the wrong recent run.
- Workflows skipped by `vars.CLAUDE_ENABLED != 'false'` only surface after the run is found.

### Rebuild Recommendation

Create a typed `WorkflowDispatchCorrelation` value:

```text
correlation_id
created_after
workflow
ref
head_branch
actor
reserved_input_name
```

Then centralize dispatch so reserved inputs cannot be overwritten. Poll with a stronger query strategy:

- workflow ID;
- event = `workflow_dispatch`;
- created after dispatch time;
- branch/ref when applicable;
- actor when known;
- correlation ID in run name as a final check;
- pagination until a time boundary.

## Remote Authoring Flows

### `erk pr dispatch`

Primary source:

- `/Users/schrockn/code/erk/src/erk/cli/commands/pr/dispatch_cmd.py`

This dispatches an existing planned PR for implementation.

#### Local Path

The local path:

1. Validates the PR exists and is open.
2. Requires the title to start with `[erk-pr]` or `[erk-learn]`.
3. Fetches plan content from the planned-PR backend.
4. Syncs the local branch ref to `origin/<branch>` without checkout.
5. Commits `.erk/impl-context/plan.md` and `.erk/impl-context/ref.json` directly to the branch through git plumbing.
6. Pushes the branch.
7. Dispatches `plan-implement.yml`.
8. Writes dispatch metadata to the PR body:
   - `last_dispatched_run_id`
   - `last_dispatched_node_id`
   - `last_dispatched_at`
9. Appends a workflow link and posts a queued event comment best-effort.

#### Remote Path

The remote `--repo` path:

1. Requires explicit PR numbers.
2. Fetches the PR/issue through REST.
3. Validates title and state.
4. Extracts branch metadata from the PR body.
5. Extracts plan content from the PR body.
6. Commits `.erk/impl-context/plan.md` and `.erk/impl-context/ref.json` via repeated Contents API calls.
7. Dispatches `plan-implement.yml`.
8. Appends a workflow link and posts a queued comment best-effort.

Important parity gap: remote dispatch does not write the same `last_dispatched_*` metadata as the local path.

### `erk one-shot`

Primary source:

- `/Users/schrockn/code/erk/src/erk/cli/commands/one_shot_remote_dispatch.py`

The one-shot path creates a draft PR from a prompt and dispatches `one-shot.yml`.

Flow:

1. Get authenticated user.
2. Get default branch name and SHA.
3. Generate a `plnd/...` branch name.
4. Create a branch from trunk.
5. Commit `.erk/impl-context/prompt.md`.
6. Create a draft PR whose body contains plan-header metadata and placeholder plan content.
7. Add an `erk-pr` label.
8. Dispatch `one-shot.yml`.
9. Post a queued event comment best-effort.

Workflow-side, `one-shot.yml`:

1. Checks out the branch.
2. Runs remote setup.
3. Runs a Claude planning command.
4. Requires `.erk/impl-context/plan.md` and `.erk/impl-context/plan-result.json`.
5. Registers the produced plan.
6. If not `plan_only`, calls reusable `plan-implement.yml`.

Subtle inconsistency: one-shot dry-run shows an `oneshot-...` branch name, while real dispatch creates a `plnd/...` branch. A high-quality dry-run should be an exact mutation plan, not an approximation.

### `erk launch ...`

Primary source:

- `/Users/schrockn/code/erk/src/erk/cli/commands/launch_cmd.py`

Supported workflows:

- `pr-address`
- `pr-rebase`
- `pr-rewrite`
- `learn`
- `one-shot`
- `consolidate-learn-plans`

`launch` uses `RemoteGitHub` broadly, even when a local repo is present. Local repo presence is used for inference, not necessarily for mutation.

Important hidden contracts:

- `launch one-shot` means dispatch against an existing PR, while `erk one-shot` means create a new branch and draft PR from a prompt.
- `learn.yml` requires `learn_branch`, but `erk launch learn` appears to dispatch only `pr_number`; tests currently do not catch this mismatch.
- `plan-implement` is rejected from `launch`; users are told to use `erk pr dispatch`.

### `erk objective plan --repo --one-shot`

Primary source:

- `/Users/schrockn/code/erk/src/erk/cli/commands/objective/plan_cmd.py`

This path selects roadmap nodes from an objective issue, builds a one-shot implementation prompt, calls the same one-shot remote dispatcher, and updates objective roadmap metadata with the created draft PR.

The interesting design point is that objective dispatch composes with one-shot dispatch by adding workflow inputs such as:

- `objective_issue`
- `node_id`

This is a good pattern: higher-level workflows should compose through typed extra inputs rather than bespoke dispatch implementations. In Erk those extra inputs are still loose dictionaries; a rebuild should make them typed.

## Workflow Behavior

### Shared Remote Setup

Primary action:

- `/Users/schrockn/code/erk/.github/actions/erk-remote-setup/action.yml`

It validates:

- `ERK_QUEUE_GH_PAT`
- either `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`

It installs:

- `uv`
- Erk
- Claude Code
- Prettier

It configures git identity for workflow commits.

Most remote-authoring jobs are gated by:

```yaml
if: vars.CLAUDE_ENABLED != 'false'
```

That means dispatch can succeed but the matched run can be skipped.

### `plan-implement.yml`

This is the core remote implementation workflow.

It performs these operations:

1. Validate secrets.
2. Checkout the implementation branch with `ERK_QUEUE_GH_PAT`.
3. Ensure implementation context exists.
4. Post workflow-started and remote-execution-note comments.
5. Write run info into `.erk/impl-context/run-info.json`.
6. Remove `.erk/impl-context/` from git tracking while leaving files available to Claude.
7. Run Claude with `/erk:plan-implement`.
8. Capture Claude session info.
9. Push session context to `planned-pr-context/<pr>`.
10. Update plan header metadata.
11. Detect changed files and new commits.
12. Push implementation changes.
13. Attempt conflict resolution/rebase when needed.
14. Mark PR ready.
15. Clean staging directories.
16. Update PR body.
17. Trigger CI by empty commit.

This workflow contains a lot of business logic in shell. A rebuild should move the semantics into tested exec commands and leave YAML as a thin orchestrator.

### PR Address / Rebase / Rewrite

- `pr-address.yml` checks out the PR, runs Claude `/erk:pr-address --pr`, pushes fixes, captures session, updates plan header, and posts a summary.
- `pr-rebase.yml` optionally squashes, rebases with AI conflict resolution, posts status, and updates metadata.
- `pr-rewrite.yml` rebases, runs `erk pr rewrite`, posts status, and updates metadata.

Risk: `pr-rewrite.yml` runs the rewrite with `|| true`, intentionally swallowing failures.

### Consolidate Learn Plans

`consolidate-learn-plans.yml` creates a consolidation plan, optionally calls `plan-implement.yml`, waits for CI, addresses failures, and rebases if necessary. It shows how quickly remote authoring workflows become mini-orchestrators when YAML owns business logic.

## Metadata Model

Primary schema:

- `/Users/schrockn/code/erk/packages/erk-shared/src/erk_shared/gateway/github/metadata/schemas.py`

Important `PlanHeaderSchema` fields:

- `schema_version`
- `created_at`
- `created_by`
- `branch_name`
- `last_dispatched_run_id`
- `last_dispatched_node_id`
- `last_dispatched_at`
- `last_remote_impl_at`
- `last_remote_impl_run_id`
- `last_remote_impl_session_id`
- `last_session_branch`
- `last_session_id`
- `last_session_at`
- `last_session_source`
- `objective_issue`
- `node_ids`
- `created_from_workflow_run_url`
- `lifecycle_stage`

Erk stores plans as draft PRs. The PR body carries both human plan text and machine metadata. This lets GitHub be the state store, but it creates several risks:

- PR body edits can disturb machine metadata.
- Some paths update metadata and others do not.
- The same state is also represented in comments, branch files, workflow names, and session manifests.
- Terminology remains mixed: code still uses `issue` names even though the active backend stores plans as draft PRs.

A better model would use typed append-only events plus derived summary metadata. The PR body can still display state, but should not be the only source of truth for important transitions.

## Implementation Context Files

Important paths:

- `.erk/impl-context/prompt.md`
- `.erk/impl-context/plan.md`
- `.erk/impl-context/ref.json`
- `.erk/impl-context/run-info.json`

There are two related but different concepts:

1. Unscoped transport/staging context committed to the branch before workflow execution.
2. Runtime implementation context that workflows and commands consume while authoring.

The distinction is not always obvious in the code or docs. A rebuild should name these concepts explicitly, for example:

- `AuthoringPrompt`
- `PlanTransportBundle`
- `RuntimeImplContext`
- `PlanReference`

Remote dispatch currently writes multiple files through separate Contents API commits. That makes retry/idempotency and atomicity weaker. Prefer a remote gateway method that creates one tree/commit containing all files.

## Session Persistence

Current stable path:

- `/Users/schrockn/code/erk/src/erk/cli/commands/exec/scripts/push_session.py`
- `/Users/schrockn/code/erk/src/erk/cli/commands/exec/scripts/fetch_sessions.py`

Workflow captures Claude JSONL, preprocesses it to XML, and commits it to:

```text
planned-pr-context/<pr_number>
```

with files:

```text
.erk/sessions/*.xml
.erk/sessions/manifest.json
```

Manifest shape includes:

- version;
- PR number;
- session ID;
- stage;
- source;
- upload time;
- XML files;
- size metrics;
- git branch.

Stale path:

- `/Users/schrockn/code/erk/src/erk/cli/commands/exec/scripts/download_remote_session.py`

That script expects raw JSONL under `.erk/session/{session_id}.jsonl`, while the current mainline persists preprocessed XML under `.erk/sessions/*.xml`. It appears legacy.

For `asdl-tools`, session storage should be a first-class domain model with fake/real conformance tests.

## Auth, Permissions, and Secrets

CLI authentication uses:

```text
gh auth token --hostname github.com
```

Direct REST uses that token as a bearer token. Workflow auth relies heavily on:

- `ERK_QUEUE_GH_PAT`
- `ANTHROPIC_API_KEY`
- `CLAUDE_CODE_OAUTH_TOKEN`

Typical workflow permissions:

```yaml
contents: write
pull-requests: write
issues: write
```

Observed gaps:

- The CLI checks whether a token exists, but there is no strong preflight for the exact scopes needed for branch creation, Contents API commits, PR mutation, issue comments, labels, and Actions dispatch.
- Workflow secret validation exists, but it is shell-level and workflow-specific.

A rebuild should make auth requirements explicit per operation and expose a deterministic preflight command.

## Error Handling

Erk mixes several error styles:

- `RuntimeError` for subprocess, polling, malformed API response, skipped/cancelled workflow, timeout.
- `HttpError` for direct HTTP status failures.
- Sentinel results such as `IssueNotFound`, `RemotePRNotFound`, and `PRNotFound`.
- `SystemExit(1)` in Click command validation.
- Best-effort operations that swallow or log exceptions, such as comment/body updates.

For a higher-quality implementation, expected domain failures should be typed results, while infrastructure failures should be explicit exceptions. Best-effort side effects should be recorded in the returned result as warnings rather than disappearing into logs.

## Run Management

Run-management commands live under:

- `/Users/schrockn/code/erk/src/erk/cli/commands/run/`

Capabilities:

- list workflow runs;
- show logs;
- cancel runs;
- retry all jobs or failed jobs.

These use the local GitHub gateway and `gh`/REST calls. No-clone `RemoteGitHub` does not currently provide equivalent run-management operations.

Stale/inconsistent path:

- run log auto-detection references `implement-plan.yml`, while the current workflow is `plan-implement.yml`.

TUI operations shell out to human CLI commands and sometimes scrape output. This is brittle. A rebuild should provide JSON exec commands for UI/background workers.

## Test Coverage

Strong coverage exists for:

- `RealRemoteGitHub` endpoint construction and behavior.
- Remote dispatch polling success/skipped/timeout.
- One-shot remote branch/PR/label/workflow flow.
- Local `pr dispatch`.
- Remote `pr dispatch --repo`.
- Launch command dispatching.
- Plan metadata helpers.
- Session push/fetch.
- Run list/log/cancel/retry.
- TUI command registry and palette behavior.

Important missing tests:

- YAML workflow inputs vs CLI-dispatched inputs.
- Every dispatched workflow `run-name` containing the correlation ID.
- Local-vs-remote metadata parity.
- Caller-provided `distinct_id` overriding generated correlation ID.
- Dispatch polling under more than 10 recent runs.
- Workflow shell contracts around file outputs such as `plan-result.json`.
- Exact dry-run parity.
- Atomic remote file commits and retry/idempotency.

## Hidden Contracts and Design Risks

The most important hidden contracts are:

1. Workflow `run-name` must include `:${{ inputs.distinct_id }}`.
2. CLI workflow inputs must match YAML-required inputs.
3. Claude must write exact files such as `.erk/impl-context/plan-result.json`.
4. `plan-result.json` must contain expected keys such as PR number and title.
5. PR body must preserve parseable `plan-header` metadata.
6. Planned PR titles must carry `[erk-pr]` or `[erk-learn]` in some flows.
7. Session capture output is consumed by workflow shell through `eval`.
8. Remote session branches use hard-coded naming conventions.
9. TUI status sometimes depends on human CLI output text.
10. Local and remote paths are expected to mean the same thing but do not always write the same metadata.

Each of these should become either a typed interface, a conformance test, or an explicit documented non-goal.

## Proposed `asdl-tools` Design Shape

### Domain Types

Introduce explicit domain objects:

- `RemoteAuthoringRequest`
- `RemoteAuthoringPlan`
- `WorkflowDispatchRequest`
- `WorkflowDispatchResult`
- `WorkflowDispatchCorrelation`
- `WorkflowManifest`
- `WorkflowInputSchema`
- `RemoteBranchMutation`
- `PlanArtifact`
- `PlanMetadata`
- `AuthoringSessionManifest`
- `AuthoringLifecycleEvent`

### Gateway Interfaces

Use one behaviorally consistent interface with local and remote implementations:

```text
GitHubAuthoringGateway
  get_authenticated_user
  get_default_branch
  create_branch
  commit_files_to_branch
  create_draft_pr
  update_pr_body
  add_labels
  add_comment
  dispatch_workflow
  get_workflow_run
  list_workflow_runs
  get_workflow_logs
  cancel_workflow_run
  rerun_workflow_run
```

Then write conformance tests for local/fake/remote behavior where parity matters.

### Dispatch Service

Centralize dispatch in one service:

```text
RemoteWorkflowDispatcher.dispatch(manifest, target, inputs, ref_policy)
```

Responsibilities:

- validate reserved inputs;
- validate required workflow inputs;
- generate correlation ID;
- record dispatch start time;
- call gateway dispatch;
- poll robustly;
- return structured result;
- record warnings for best-effort side effects.

### Workflow Manifests

Each workflow should have a checked-in typed manifest defining:

- workflow file name;
- required inputs;
- optional inputs;
- reserved inputs;
- run-name correlation requirement;
- required permissions;
- required secrets;
- expected output files;
- lifecycle transitions.

Tests should parse YAML and assert it conforms to the manifest.

### YAML Thinness Rule

Workflow YAML should be mostly:

1. checkout;
2. setup;
3. call tested exec command;
4. upload/persist artifacts;
5. final status update.

Business logic should live in tested Python/TypeScript modules, not inline shell.

### Exact Dry-Run

Dry-run should produce a serializable mutation plan:

```text
branch to create
files to write
PR title/body/labels
dispatch ref
workflow inputs
metadata events
comments to post
```

Real execution should consume the same plan. If real execution does not consume the dry-run plan, dry-run will drift.

## Candidate Migration Plan

1. Define workflow manifests and dispatch result types.
2. Build a fake gateway and conformance tests before real GitHub integration.
3. Implement robust dispatch correlation and polling.
4. Implement no-clone branch/PR/file mutation with atomic commits.
5. Implement one-shot remote authoring first; it exercises branch creation, PR creation, file commit, dispatch, and metadata.
6. Add branch-context/plan-implementation dispatch.
7. Add run list/log/cancel/retry parity.
8. Add session persistence as a first-class model.
9. Move workflow shell snippets into exec commands.
10. Add TUI/background JSON command surfaces after core behavior is typed.

## Final Takeaway

Erk proves that GitHub Actions can function as a remote code-authoring substrate: dispatch a workflow, run an agent on a branch, push code, persist session context, and update PR state. The hard part is not the API call; it is maintaining reliable contracts across CLI inputs, workflow YAML, branch files, PR metadata, logs, comments, sessions, and UI state.

A higher-quality `asdl-tools` implementation should make those contracts explicit, typed, and tested from the beginning.
