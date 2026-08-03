## Completion instructions
After you finish the implementation:
1. Create or update the branch commit using the repo's normal workflow.
2. Then run `!ns flow submit`.

## Launch context
This branch was created from the existing local Graphite trunk and is intentionally unrelated to the caller's current stack.

Implement a focused fix to `ns flow submit` so stale upstack children neither broaden nor block its documented current/downstack submission scope.

Repository root:
`/Users/schrockn/.local/state/ns/slots/repos/ns/worktrees/slot-07`

Current branch:
`user-scoped-npm-extension-acquisition-cleanup`

Do not commit, push, submit, publish, restack, or mutate Branch Memory unless explicitly requested. The branch currently contains a checkpoint commit for unrelated managed npm acquisition work. Keep this Flow fix isolated from that prior work.

Before editing:

1. Read root `AGENTS.md`, `ts/AGENTS.md`, and all active Objective orientations:
   `ns objective exec load-orientations --format md`
2. Load the TypeScript and fake-driven testing skills required by repo instructions.
3. Read the relevant Flow context and active Objective material:
   - `ts/packages/incubating/extensions/flow/CONTEXT.md`
   - `.ns/objectives/opt-in-stacking-and-provider-neutrality/objective.md`
   - `.ns/objectives/opt-in-stacking-and-provider-neutrality/roadmap.md`
4. Read `docs/conventions/graphite-dependency-boundary.md`.
5. Inspect current Git/Graphite state without mutating it.

## Goal

Make `ns flow submit` honor its documented scope: submit the current Graphite branch and its downstack ancestors without requiring, submitting, updating, or restacking upstack descendants.

A stale upstack child must not block submission from its parent.

## Verified reproduction and current behavior

The current branch has:

- Parent: `atomic-extension-admission-durable-user-config`
- Child: `prove-whole-extension-source-installation`

After a new commit was added to the current branch:

```text
gt restack --downstack --no-interactive
```

reported that the current/downstack branches did not need restacking. However:

```text
gt submit --stack --dry-run --no-interactive
```

failed with:

```text
WARNING: You must restack before submitting this stack.
ERROR: Aborting dry run.
```

Inspection showed:

```text
prove-whole-extension-source-installation (needs restack)
Parent: user-scoped-npm-extension-acquisition-cleanup
```

The failed Flow raw log showed the command:

```text
gt submit --no-edit --publish --stack --update-only --no-ai --no-interactive --no-view --no-web
```

Thus the upstack child was included by Flow’s secondary `--stack --update-only` phase even though Flow’s restack and documented submission scope are current/downstack.

The relevant product documentation currently says in:

`ts/packages/incubating/extensions/flow/README.md`

that `ns flow submit` submits “current/downstack Graphite branches.”

## Current implementation anchors

### Command construction

`ts/packages/incubating/extensions/flow/src/submit/submit-command-spec.ts`

Current structure includes:

- `GT_SUBMIT_MODE_ARGS.default = ["--no-stack"]`
- `GT_SUBMIT_MODE_ARGS.stackUpdate = ["--stack", "--update-only"]`
- `STACK_UPDATE_BASE_ARGS`
- `buildStackUpdateArgs()`
- `formatStackUpdateCommandDisplay()`

The primary submit uses `--no-stack`. The secondary stack update uses `--stack --update-only`.

### Gateway

`ts/packages/incubating/extensions/flow/src/submit/submit-gateway.ts`

Relevant symbols:

- `RealSubmitGateway.submitCurrentStack()`
- `RealSubmitGateway.updateStackPrs()`
- `buildSubmitArgs()`
- `buildStackUpdateArgs()`
- `RESTACK_ARGS = ["restack", "--downstack", "--no-interactive"]`

### Submit orchestration

`ts/packages/incubating/extensions/flow/src/submit/submit.ts`

Relevant behavior:

- Builds `submitCommandDisplay`.
- Builds `stackUpdateCommandDisplay`.
- Calls `readyTransport.submitPrimary(...)`.
- If `planToExecute.hasUpstackBranches`, runs a second phase through:
  `gateway.updateStackPrs(params)`
- Combines the primary and stack-update outcomes.

This second phase is the confirmed source of the stale-child failure.

### Gateway contract

`ts/packages/incubating/extensions/flow/src/submit/submit-contracts.ts`

`SubmitGateway` includes `updateStackPrs(...)`.

### Submit planning and stack inspection

- `ts/packages/incubating/extensions/flow/src/submit/submit-plan.ts`
  - `SubmitPlan.hasUpstackBranches`
- `ts/packages/incubating/extensions/flow/src/submit/submit-stack-inspection.ts`
  - `SubmitStackInspection.hasUpstackBranches`
  - `SubmitStackTopologyFacts.hasUpstackBranches`
  - `deriveHasUpstackBranches(...)`
  - descendant metadata validation used only to decide whether to run the broad stack update, subject to confirmation by bounded search

### Tests

Inspect at least:

- `ts/packages/incubating/extensions/flow/test/unit/submit.test.ts`
- `ts/packages/incubating/extensions/flow/test/unit/submit-plan.test.ts`
- `ts/packages/incubating/extensions/flow/test/scenario/submit-command.test.ts`
- Tests for `submit-command-spec.ts`, `submit-gateway.ts`, and stack inspection discovered by bounded search
- Flow scenario fakes, especially:
  `ts/packages/incubating/extensions/flow/test/scenario/flow-command-fakes.ts`

Known unit-test anchors around current behavior include `updateStackPrs` and `hasUpstackBranches` references near the later sections of `submit.test.ts`.

## Settled decisions

- Do not fix this by broadening automatic restack to `--upstack`.
- Do not let a stale upstack descendant block current/downstack submission.
- Do not submit or update unrelated upstack PRs.
- Remove the broad `gt submit --stack --update-only` behavior from ordinary `ns flow submit`.
- Preserve current/downstack scope.
- Prefer explicit, provider-neutral scope semantics over ambient “entire Graphite stack” behavior, consistent with the active opt-in stacking/provider-neutrality Objective.
- Keep the change focused on submit mechanics and tests; do not redesign unrelated Flow workflows.

## Critical unknown to resolve before deleting behavior

The primary Graphite command uses `--no-stack`, which appears to submit only the currently checked-out branch. The README and Flow plan promise current/downstack submission.

Before removing the secondary stack-update phase, establish exactly how each downstack branch is currently published or updated.

Do not assume that deleting `updateStackPrs()` preserves downstack behavior. Use code/tests and, where safe, Graphite help or dry-run evidence to determine:

1. Whether `gt submit --no-stack` updates only the current branch.
2. Whether Flow separately submits downstack branches elsewhere.
3. Whether the broad `--stack --update-only` phase was accidentally responsible for updating both downstack and upstack branches.
4. What targeted mechanism can update only the planned current/downstack branch path.

If current/downstack branches require separate submission, implement targeted per-branch operations rather than an entire-stack operation. Prefer an explicit branch argument supported by the installed Graphite version if available. If Graphite lacks a safe targeted argument, consider executing `--no-stack` with an explicit operation cwd/checkout abstraction only if this can be done without mutating the user’s checkout unexpectedly. Do not guess command semantics; inspect `gt submit --help`, existing Graphite adapters, and tests.

If no safe targeted mechanism exists, stop and report the exact limitation rather than silently reducing `ns flow submit` to current-branch-only behavior.

## Expected implementation direction

Subject to the downstack verification above:

1. Remove the `stackUpdate` mode and `buildStackUpdateArgs()` from:
   `src/submit/submit-command-spec.ts`.
2. Remove `updateStackPrs()` from:
   - `SubmitGateway`
   - `RealSubmitGateway`
   - all fake gateways and fixtures
3. Remove the `hasUpstackBranches`-triggered broad stack-update phase from:
   `src/submit/submit.ts`.
4. Remove `hasUpstackBranches` from `SubmitPlan`, stack inspection, and descendant metadata traversal if bounded search confirms it has no remaining purpose.
5. Add or adapt a targeted current/downstack submit mechanism if required by verified Graphite semantics.
6. Remove dead outcome-combination helpers if they become unused.
7. Update comments, progress labels, command displays, and failure transcripts so they describe the actual targeted submission operations.
8. Keep README wording accurate. Do not change “current/downstack” to “current only” merely to simplify implementation.

## Regression requirements

Add coverage proving:

1. A stale or restack-required upstack child does not broaden or block current/downstack submission.
2. No command includes `--stack` during ordinary `ns flow submit`.
3. No upstack branch is submitted or updated.
4. Every planned current/downstack branch that should be published or updated still is.
5. Automatic restack remains downstack-scoped:
   `gt restack --downstack --no-interactive`.
6. Existing no-upstack behavior remains unchanged.
7. New-PR metadata reconciliation still targets exactly the planned submitted current/downstack branches.
8. Existing PR update behavior remains correct for downstack branches.
9. Failure diagnostics identify the specific targeted operation if one branch submission fails.

Prefer fake-driven unit/scenario tests. Do not add real Git/Graphite subprocess work to the default test lane. A narrowly focused integration test is appropriate only if actual CLI argument behavior needs adapter verification.

A useful regression fixture should model:

```text
trunk
  └─ downstack-a
      └─ current
          └─ stale-upstack-child
```

Expected submitted scope:

```text
downstack-a
current
```

Forbidden submitted scope:

```text
stale-upstack-child
```

## Search audit

After edits, run bounded searches for:

```text
buildStackUpdateArgs
STACK_UPDATE_BASE_ARGS
stackUpdate
updateStackPrs
hasUpstackBranches
--stack
--update-only
```

Review every remaining match. `--stack` may remain in other explicitly stack-wide Flow workflows, but not in ordinary `ns flow submit` unless a remaining occurrence is demonstrably unrelated to this path.

## Validation

Run focused tests first, then repository gates:

- Focused Flow submit unit tests
- Focused Flow submit scenario tests
- Any focused integration test added or affected
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`
- `just ts-test`
- `just ts-test-integration`
- `just ts-test-typescript-style-guard`
- `just`

Use `just ts-format-fix` or `just ts-lint-fix` for autofixable failures. If dprint fails, run `just dprint-fix`.

Do not use live `gt submit` as validation because it can publish. Dry-run/read-only Graphite inspection is allowed, but tests should provide the durable regression signal.

## Risks

- Simply deleting the broad stack update may silently stop updating downstack PRs.
- Targeting branches via checkout could unexpectedly mutate the current worktree; avoid that unless an existing safe abstraction owns it.
- Graphite CLI flags may differ by version. The observed local version was `1.8.6`; verify help rather than assuming newer syntax.
- Removing descendant inspection may affect corruption diagnostics; remove it only if its sole purpose was deciding whether to broaden submission.
- Post-submit metadata reconciliation assumes the planned branch set matches what was actually submitted. Keep this invariant explicit.
- Flow is moving toward provider-neutral, opt-in stacking. Do not deepen Graphite coupling or encode whole-stack behavior into generic submit contracts.

Finish with a concise report of:

- Verified Graphite submission semantics
- Chosen targeted current/downstack strategy
- Files changed
- Tests and validation results
- Any deviations or unresolved limitations
- Confirmation that no publishing or stack mutation occurred