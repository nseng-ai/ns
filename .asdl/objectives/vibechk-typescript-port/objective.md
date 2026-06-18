# Vibechk TypeScript Port

## Thesis

Port the already-implemented `vibechk` Python CLI surface to TypeScript so `vibechk` can become TS-default in the broader asdl toolkit migration without expanding product scope during the language cutover.

This Objective is intentionally narrower than `.asdl/objectives/vibechk-v1/`. The `vibechk-v1` Objective remains the product source for the full v1 vision, including `codex` and `pi` runner adapters, GitHub PR publishing, and real publish smoke evidence. This port should preserve the surface that exists today: `run`, `show`, `diff`, `runs`, the `claude` runner adapter, local bundle storage, Markdown reports, git workdir/result-branch behavior, and the current manual-paste workflow.

The migration should follow the TypeScript capability porting playbook: inventory durable contracts first, port behavior through fake-driven seams and scenario tests, make a consumer-backed distribution decision, then retire the Python package only after active callers and docs no longer depend on it.

## Scope

- Create a standalone TypeScript package named `@asdl/vibechk` under `ts/packages/vibechk` with a `vibechk` binary.
- Preserve the current user-facing commands and behavior for:
  - `vibechk run`
  - `vibechk show`
  - `vibechk diff`
  - `vibechk runs`
  - `-h` / `--help`, `--version`, and `--runtime` diagnostic behavior, with `--runtime` updated to report TypeScript.
- Preserve current local evaluation concepts: baseline/treatment workdirs, opaque plan text, run ids, bundle store, plan snapshot, transcript, diff patch, metrics with unavailable values as `null`, result branches named `vibechk/<run-id>`, and manual Markdown report pasting.
- Preserve the existing bundle layout and schema version 1 for this cutover:
  - store root precedence: explicit `--store`, then `$VIBECHK_HOME`, then `$XDG_STATE_HOME/vibechk`, then `~/.local/state/vibechk`;
  - run directory: `<store>/runs/<run-id>/`;
  - files: `bundle.json`, `plan.md`, `transcript.txt`, `diff.patch`, and `artifacts/`;
  - JSON keys remain the existing snake_case bundle contract so TypeScript can read Python-created local bundles.
- Port the existing `claude` subprocess runner adapter and fake runner seam needed by automated tests.
- Preserve existing git preconditions and safety behavior: workdirs must be clean git repositories on named branches; `vibechk` creates local result branches when changes exist, restores the starting branch, never pushes, and does not create PRs.
- Keep `publish`, `codex`, and `pi` runner adapters out of the TypeScript cutover scope. Leave those feature rows to the paused `vibechk-v1` Objective after the implemented surface is TS-default.
- Add `just install-vibechk` as an opt-in TypeScript source shim, but do not add it to `install-tools` unless implementation-time caller inventory discovers a real installed-tool consumer.
- Retire the active Python package only after TypeScript parity is proven and active docs, workspace wiring, build/test config, and command examples no longer depend on `uv run vibechk` or `packages/vibechk` as the default path.
- Feed reusable lessons back into the umbrella migration Objective and porting playbook when the cutover completes.

## Non-Goals

- Implementing new v1 product features during the port, including `vibechk publish`, GitHub PR body mutation, remote branch validation, `codex` runner support, or `pi` runner support.
- Reworking the product model into a broader eval framework, quality grader, benchmark runner, or multi-sample cohort system.
- Managing worktrees, creating PRs, pushing result branches, or judging solution quality.
- Creating a parent `asdl vibechk` plugin surface unless fresh consumer evidence makes that a separate product requirement.
- Promoting `vibechk` bundle, git, runner, or report seams into shared TypeScript foundations before a second consumer proves reuse.
- Browser-compatible execution or Pi-native SDK/session-forking integration.
- Renaming the durable `vibechk-v1` Objective or moving its remaining product scope into this migration Objective.
- Byte-for-byte Click help/usage parity. User-facing command semantics, option names, result artifacts, safety guarantees, and documented report content are durable; parser/help quirks may adopt the repo's TypeScript CLI framework conventions.

## Completion Criteria

- The TypeScript workspace contains `ts/packages/vibechk` with package identity `@asdl/vibechk`, a `vibechk` bin, strict TypeScript package wiring, and Vitest package scripts.
- The standalone TypeScript CLI covers the already-implemented Python commands: `run`, `show`, `diff`, and `runs`.
- TypeScript scenario and unit tests cover the current implemented behavior, including help/version/runtime, single-run and comparison flow, store precedence and listing, run-id prefix resolution, clean/detached/non-git preconditions, failed runner persistence, no-change runs, report rendering, and fake-runner execution without real `claude`.
- The `claude` runner adapter works through a TypeScript boundary with streamed transcript preservation and normalized metrics that preserve unavailable numeric values as `null`.
- TypeScript can read existing schema-version-1 bundle stores created by the Python implementation, including snake_case `bundle.json` keys and optional/missing artifact text files.
- The TypeScript CLI preserves local git/result-branch safety: no pushes, no PR creation, local `vibechk/<run-id>` branches only when changes exist, and restoration to the starting branch after successful runs.
- README, manual E2E guidance, command examples, and any active justfile references point at the TypeScript default invocation model rather than Python `uv run vibechk`.
- `just install-vibechk` installs a TypeScript source shim and removes or avoids stale Python `.venv/bin/vibechk` shadowing; `install-tools` inclusion is either deliberately skipped or justified by caller evidence.
- Active Python workspace/build/test/publish wiring for `packages/vibechk` is retired after parity, with rollback/reference evidence recorded before deletion.
- The paused `vibechk-v1` Objective remains open for missing product features after the TS-default cutover: `publish`, `codex`, `pi`, and real publish smoke evidence.
- Relevant TypeScript checks/tests and affected repo validation pass, with validation evidence recorded in a Semantic Update or closure context.
- The umbrella `port-asdl-toolkit-to-typescript` Objective is updated with the `vibechk` cutover outcome and any reusable playbook lessons.

## Definition of Progress

Progress is keepable when:

- each branch has one clear migration thesis and leaves the repo in a coherent state;
- the TypeScript CLI remains narrower than `vibechk-v1` and does not implement missing product features during migration;
- Python and TypeScript can coexist temporarily without changing the documented default until parity is proven;
- safety-critical git/result-branch behavior is protected by fake-driven tests plus focused real-git coverage before Python deletion;
- every accepted divergence from Python is recorded as a deliberate TypeScript cutover decision.

Do not keep changes that:

- mix feature expansion (`publish`, `codex`, `pi`) with the language cutover;
- delete Python before TS parity and docs/caller cleanup are complete;
- require Graphite at runtime for ordinary `vibechk` behavior;
- push branches, create PRs, or mutate GitHub state;
- use `as unknown as`, non-erasable TypeScript constructs, module mocks for domain behavior, or deep imports into another package's `src/` tree.

Useful evidence includes:

- `pnpm --dir ts run check` and `pnpm --dir ts run test` passing for TypeScript changes;
- targeted `@asdl/vibechk` Vitest unit/scenario/gateway tests passing during development;
- a small real-git test proving result-branch creation and switch-back behavior;
- `dprint check` passing for edited Markdown/TOML/JSON-like formatting;
- a final grep showing active `uv run vibechk`, `packages/vibechk`, and Python workspace references are either removed or historical/rollback-only.

## Runner Policy

This Objective is execution-friendly for `objective-stack-impl` after a human preview of the stack plan.

- Direct execution is allowed when the planned slice stays within the existing implemented `vibechk` surface and follows the TypeScript package/test conventions in this Objective.
- Steer or ask first when implementation evidence suggests changing the bundle schema, dropping compatibility with Python-created bundles, adding `publish`, adding non-`claude` runners, making `vibechk` part of `install-tools`, or introducing a shared foundation abstraction.
- Work may create, edit, or delete files under `ts/packages/vibechk`, `packages/vibechk`, root workspace/build config, `justfile`, README/manual docs, and Objective records when those changes are part of the previewed slice.
- Work may be left as a temporary dual-implementation state only before the Python retirement slice; after the retirement slice, active docs and workspace config should point at the TypeScript default.
- Validation before keeping work should include targeted package tests for the slice plus `pnpm --dir ts run check` / `pnpm --dir ts run test` when TypeScript code changes. Run broader repo validation when deleting the Python package or editing root workspace config.
- External write actions are out of scope unless explicitly requested in a later preview: do not push result branches, create or edit PRs, publish packages, mutate GitHub state, or submit Graphite PRs automatically.

## Implementation Notes

### Current Python contract seed

The implementation-time contract inventory should start from these facts, then verify them against source and tests:

- CLI root:
  - command name `vibechk`;
  - help option names `-h` / `--help`;
  - `--version` prints package version information;
  - `--runtime` currently reports Python and should report TypeScript after cutover.
- `run` command:
  - options: `--plan PATH` required readable file, `--workdir DIR` default `.`, `--runner NAME`, `--model NAME`, `--store DIR`;
  - default production runner is `claude`;
  - stdout includes `Run ID: <run-id>`;
  - non-zero runner exits still write a consumable bundle and cause the CLI to exit with the runner exit code;
  - domain errors should remain clear user-facing CLI errors.
- `runs` command:
  - options: `--store DIR`, `--format table|json` default `table`;
  - missing store or missing `runs/` prints `No vibechk runs found.` in table mode and `[]` in JSON mode without creating the store;
  - listing sorts newest `started_at` first, with `run_id` tie-breaker;
  - JSON entries include run id, timestamps, status, runner/version/model, workdir, starting branch/commit, result branch, branch-created flag, runner exit code, metrics, and run directory.
- `show` command:
  - argument: run id or unique prefix;
  - renders a Markdown single-run report with summary, metrics table, collapsible plan, collapsible transcript, and diff block.
- `diff` command:
  - arguments: baseline id/prefix and treatment id/prefix;
  - renders a Markdown comparison with biggest metric deltas, metrics table, configuration table, plan or plan-mismatch warning, baseline diff, and treatment diff.
- Store/bundle:
  - run ids are lowercase 8-character hex strings; allocation retries collisions up to 100 attempts;
  - `bundle.json` is atomically written through a temp file and sorted/indented JSON in Python; byte formatting is less durable than the schema and values;
  - missing optional artifact text files load as empty strings.
- Git behavior:
  - reject non-git workdirs, detached HEAD, and dirty worktrees before runner execution;
  - capture repo root, starting branch, starting commit, and remotes;
  - use `git add -N .` before diff capture so untracked files appear in the patch;
  - if changes exist, create `vibechk/<run-id>`, `git add -A`, commit with `vibechk: capture run <run-id>`, then switch back to the starting branch;
  - if no changes exist, skip branch creation and record `result_branch: null`, `branch_created: false`.
- `claude` runner behavior:
  - subprocess command is `claude --print --permission-mode acceptEdits [--model MODEL] <plan_text>`;
  - runs with cwd set to the evaluated workdir;
  - stdout/stderr are merged, streamed to parent stdout, and written to `transcript.txt`;
  - measured metric today is wall time seconds; token and cost metrics remain `null`; runner version is currently `null`.

### Suggested TypeScript package layout

Use repo-local conventions and keep seams package-local until a second consumer proves reuse:

```text
ts/packages/vibechk/
  package.json
  src/
    cli.ts
    context.ts
    contracts.ts
    models.ts
    store.ts
    reports.ts
    workflow.ts
    git-gateway.ts
    real-git-gateway.ts
    runner.ts
    claude-runner.ts
    fake-runner.ts        # or test/support equivalent if not part of src
    ids.ts
    fs-gateway.ts         # only if useful after inventory
    index.ts
  test/
    unit/
    scenario/
    gateways/
    support/
```

Prefer `@asdl/clinkr` for command construction and `@asdl/core/cli-entry` for direct invocation detection. Use `zod` schemas for external JSON boundaries such as bundle parsing and CLI machine output if machine output is added later. Keep `vibechk` domain schemas package-local.

### Gateway and fake guidance

- Define domain-shaped gateways rather than subprocess-shaped core interfaces:
  - `GitGateway` should expose repo/current branch/current commit/remotes/clean/diff/hasChanges/createResultBranchAndCommit/checkout semantics.
  - `Runner` should expose a semantic run operation that receives plan text, workdir, model, run id, artifacts dir, and a transcript sink/output callback.
  - Use a clock and run-id generator injection for deterministic tests.
- The real git adapter may use `@asdl/core/exec` internally, but application logic should not parse raw subprocess stdout outside the adapter.
- Fakes should be constructor-state fakes, not scripted mocks. Scenario tests should call the public CLI and inspect run bundles, reports, and fake-visible durable state.
- Keep real-git coverage focused and throwaway: create temp repos, configure committer identity, assert dirty/detached/non-git failures and result-branch switch-back behavior.

### Stack shape for one `objective-stack-impl` session

A future `objective-stack-impl` session should be able to execute this as one small Graphite stack with up to three reviewable branches:

1. `vibechk-ts-contract-and-shell`
   - Thesis: create `@asdl/vibechk`, codify the current bundle/report/store contract in TypeScript, and expose CLI shape for read-only commands.
   - Expected files: `ts/packages/vibechk/package.json`, `src/cli.ts`, `src/models.ts`, `src/store.ts`, `src/reports.ts`, tests under `test/unit` and `test/scenario`.
2. `vibechk-ts-runner-git-flow`
   - Thesis: port `run`, `claude`, fake runner, git safety, bundle writing, and result-branch behavior.
   - Expected files: `src/workflow.ts`, `src/runner.ts`, `src/claude-runner.ts`, `src/git-gateway.ts`, `src/real-git-gateway.ts`, scenario/gateway tests.
3. `vibechk-ts-cutover-retire-python`
   - Thesis: make TypeScript the default documented path, add the opt-in install shim, remove Python workspace wiring/package, and update umbrella Objective evidence.
   - Expected files: `justfile`, root `pyproject.toml`, `uv.lock`, `packages/vibechk/` deletion, docs/README/manual updates, Objective Semantic Updates.

If one branch becomes too broad in practice, split by thesis before implementation rather than by arbitrary file count. If the first branch cannot produce a coherent CLI/read-only package, stop before deletion and ask for a revised stack.

## Assumptions and Risks

Assumptions:

- The current implemented Python surface is valuable enough to migrate now, even though `vibechk-v1` is not complete.
- Freezing the product surface during migration reduces risk: users get a TS-default `vibechk` first, then missing v1 features can resume on top of the TypeScript implementation.
- The existing Python tests, README, manual E2E guide, and `vibechk-v1` Objective are sufficient contract inventory sources for the implemented surface.
- Repo-local TypeScript source execution plus an opt-in shim is acceptable for current consumers, matching recent toolkit cutovers, because no active skill or installed-tool consumer currently requires checkout-free execution.
- Preserving bundle schema version 1 is cheaper and safer than declaring old local bundles unreadable during this cutover.

Risks:

- The existing Python implementation may contain accidental behavior not worth preserving; the port must distinguish durable CLI/product contracts from implementation quirks.
- Porting only the implemented surface can leave `vibechk-v1` paused longer than intended if the migration uncovers foundation or distribution issues.
- Git workdir mutation and branch restoration are safety-critical; TypeScript parity must use fake-driven tests plus focused real-git coverage before Python deletion.
- Runner subprocess output can be brittle across `claude` versions; raw artifacts should be preserved and metric normalization should degrade gracefully.
- Removing Python too early could strand existing `uv run vibechk` documentation or local operator habits; docs and shims need to make the default path clear.
- Keeping snake_case bundle JSON is a local compatibility choice and should not leak into unrelated TypeScript APIs as a style precedent.

## Open Questions

- Resolved for this migration: remaining `vibechk-v1` work stays outside this port and should resume through the existing `vibechk-v1` Objective or narrower follow-up Objectives after the TypeScript cutover lands.
- Resolved for this migration: no implementation-time caller inventory justified adding `install-vibechk` to `install-tools`; `just install-vibechk` remains opt-in.
- Deferred to a dedicated context rebaseline: a later cleanup may add a package context file for `@asdl/vibechk` and update `CONTEXT-MAP.md`; this implementation branch intentionally did not edit domain-language metadata.

## Closure

Completed by the `vibechk-ts/*` Graphite stack. The TypeScript workspace now contains standalone `@asdl/vibechk` with a `vibechk` bin and coverage for the already-implemented Python surface: `run`, `runs`, `show`, `diff`, the `claude` runner adapter, schema-version-1 bundle compatibility, local bundle storage, Markdown reports, and local result branch safety.

The cutover made TypeScript the documented default through `ts/packages/vibechk/README.md`, `ts/packages/vibechk/MANUAL_E2E.md`, and the opt-in `just install-vibechk` source shim. `install-tools` intentionally does not include `install-vibechk` because no active installed-tool consumer evidence required it. The Python package at `packages/vibechk` and its root workspace/build/test/publish wiring were retired; rollback/reference evidence is in-repo commit `25c748681`, the last stack commit before Python deletion.

Validation evidence: targeted `@asdl/vibechk` check/tests, full TypeScript check/tests, `uv lock --check`, `just ts-guard`, `just dprint-check`, `just python-check`, `just test`, and a clean rerun of full `just check` passed. A stale-reference grep found no active `uv run vibechk`, Python `vibechk.cli`, Python import, or active `packages/vibechk` workspace/config reference outside the TypeScript README rollback note and historical Objective records.

Remaining product work is deliberately not part of this closed migration Objective: `publish`, `codex`, `pi`, and real publish smoke evidence remain parked in `vibechk-v1`.
