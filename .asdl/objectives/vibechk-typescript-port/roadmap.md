# Roadmap

## Work

- [x] Inventory and lock the implemented Python contract.
  - Policy: direct execution after preview; this is the first slice and should not create TypeScript implementation before contract decisions are recorded in tests or notes.
  - Read `.asdl/objectives/vibechk-v1/`, `packages/vibechk/README.md`, `packages/vibechk/MANUAL_E2E.md`, Python source/tests, root workspace wiring, and command examples.
  - Confirm the durable contract seed in `objective.md`: command semantics, store layout, bundle schema v1, report content, git safety, `claude` runner behavior, and accepted Click/Clinkr surface divergences.
  - Evidence: the first TypeScript branch codifies schema-version-1 bundle reading, local store precedence, `runs`/`show`/`diff` report behavior, prefix resolution, missing-artifact handling, and the accepted Clinkr collision workaround that preserves `vibechk runs --format table|json` at the invocation boundary while keeping the implementation field named `output_format`.
- [x] Create `@asdl/vibechk` with read-only CLI, store, models, and reports.
  - Policy: direct execution after preview.
  - Add `ts/packages/vibechk` package wiring, `vibechk` bin, `src/cli.ts`, package-local models/schemas, store loading, report rendering, and tests for `runs`, `show`, and `diff` over fixture bundles.
  - Preserve schema-version-1 bundle reading, snake_case bundle JSON keys, unique-prefix resolution, missing-store behavior, sorted `runs` output, `null` metrics, plan mismatch warning, and Markdown report structure.
  - Evidence: targeted `@asdl/vibechk` unit/scenario tests passed; `pnpm --dir ts run check`, `pnpm --dir ts run test`, `just ts-guard`, and `just dprint-check` passed after the read-only package shell was added.
- [ ] Port `run`, `claude`, fake runner, and git/result-branch behavior.
  - Policy: direct execution after preview, but stop and ask before changing safety semantics or dropping Python parity for bundle writing.
  - Add workflow execution, run-id allocation, injected clock/id generator, runner registry/default `claude`, transcript streaming, bundle writing, diff capture, result branch creation, switch-back behavior, and failure-bundle persistence.
  - Use package-local domain gateways and constructor-state fakes; add focused real-git tests for non-git, dirty, detached, diff, result branch, and switch-back behavior.
  - Evidence: scenario coverage for the current run/show/diff walking skeleton, failed runner persistence, no-change runs, and dirty workdir rejection passes.
- [ ] Make TypeScript `vibechk` the documented default invocation.
  - Policy: direct execution after preview; ask before adding `install-vibechk` to `install-tools`.
  - Update README/manual E2E examples away from `uv run vibechk` toward the chosen TypeScript invocation. Add `just install-vibechk` as an opt-in source shim if PATH execution is accepted, and remove or avoid stale `.venv/bin/vibechk` shadowing.
  - Evidence: docs and justfile consistently describe the TypeScript path; `dprint check` passes for edited Markdown.
- [ ] Retire the Python fallback and workspace wiring.
  - Policy: direct execution only after TypeScript parity and docs/caller cleanup are complete in the same stack; stop if active callers still require Python.
  - Remove `packages/vibechk`, root Python workspace/dependency/source/test/build/publish references, and lockfile entries. Record rollback/reference evidence before deletion.
  - Keep `vibechk-v1` open and paused for missing product features rather than implementing them during retirement.
  - Evidence: grep for active `packages/vibechk`, `uv run vibechk`, and Python entry point references shows only historical/Objective/rollback mentions or none.
- [ ] Record migration outcome in umbrella Objective and playbook.
  - Policy: direct execution after the TypeScript default is proven.
  - Update `.asdl/objectives/port-asdl-toolkit-to-typescript/` ledger/roadmap with `vibechk` status, rollback/reference evidence, and reusable lessons about local bundle compatibility, runner adapters, and git workdir mutation.
  - Add a Semantic Update to this Objective with validation evidence and any accepted divergences.

## Suggested Stack Boundaries

A future `objective-stack-impl` run should preview this as at most three Graphite branches unless implementation evidence forces a split:

1. `vibechk-ts-contract-and-shell` — contract inventory plus TypeScript package/read-only CLI/store/report behavior.
2. `vibechk-ts-runner-git-flow` — `run`, `claude`, fake runner, bundle writing, git safety, and result-branch behavior.
3. `vibechk-ts-cutover-retire-python` — docs/default invocation, opt-in install shim, Python deletion, umbrella Objective update, and final validation.

Stop before branch 3 if branch 1 or 2 leaves known parity gaps, safety failures, or unresolved product decisions.

## Parked

- [ ] Implement `vibechk publish`, GitHub PR reference resolution, fence replacement, and remote branch validation.
- [ ] Add `codex` and `pi` runner adapters.
- [ ] Run the real GitHub PR publish smoke required by the full v1 product Objective.
- [ ] Add Pi-native SDK/session-forking/resource-manifest evaluation or a Pi extension frontend.
- [ ] Add quality scoring, N>1 sampling, cohort comparison, bundle import, tamper detection, or evidence verification.
- [ ] Add shared TypeScript foundations for runner, bundle, git-workdir, or report seams before a second consumer proves reuse.
