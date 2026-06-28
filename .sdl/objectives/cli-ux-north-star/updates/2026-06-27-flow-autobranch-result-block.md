# Flow autobranch result block

## Summary

`sdl flow autobranch` has migrated to the signed-off CLI house style for finite side-effect results
(`house-style.md`), and this slice picks up the refusal/failure discriminator follow-up the
`branch-latest-commit` port deferred.

What changed:

- **Refusal/failure discriminator threaded through the shared `autobranch` slice (not flow-locally).**
  `AutobranchFlowResult` (in `@sdl/autobranch/dirty-worktree`, consumed by `runDirtyAutobranchFlow`,
  `createLatestCommitAutobranchFlow`, and CCC `autobranch/flow.ts`) now carries
  `outcome: "refusal" | "failure"` on its `{ ok: false }` variant. Each typed cause is classified next
  to its formatter: new `classifyLatestCommitPreparationFailure` / `classifyLatestCommitTransactionFailure`
  in `latest-commit-formatting.ts` map the eligibility guardrails (pushed-HEAD, Graphite child branches,
  root commit, merge commit, and the pre-mutation pushed-HEAD re-check) to `refusal`; every probe/slug/
  branch-name/transaction failure stays `failure`. Dirty-worktree preparation/transaction failures and
  the CCC snapshot-probe failure are all `failure` (the clean-worktree guardrail is checked by the caller
  before the flow runs). This replaces the previously deferred string-sniffing hazard with typed
  classification at the source.
- **`workflow-result-block.ts` gained a first-class `refusal` kind** (warn intent, `✗` glyph, body and
  guidance at normal weight, dimmed `Cwd:`), realizing house-style §7.3. `branch-latest-commit.ts` now
  renders latest-commit eligibility refusals as warn (headline "Did not move the latest commit…") instead
  of red failure, consuming the new discriminator.
- **`autobranch.ts`** resolves caps via `resolveFlowStreamCaps(ctx)` and renders:
  - **success** → `workflow-result-block` success on stdout (`ok`): concise headline ("Created a Graphite
    branch from dirty worktree changes.") + the transaction summary (new branch, stacked-on, commit,
    cleanliness) at normal weight + dimmed cwd; no transcript dump.
  - **clean-worktree refusal** → `workflow-result-block` `refusal` (warn) on stderr, pointing at
    `sdl flow branch-latest-commit`. (Unlike `branch-latest-commit`'s dirty refusal, there is no dirty
    porcelain status to surface, so the domain message — not `git-result-block` — is the honest fit.)
  - **flow failure** → `workflow-result-block` failure on stderr with the domain cause/recovery string.
  - **snapshot probe failure** → new shared `flow/src/shared/pending-worktree-result.ts` helper, which
    renders the failed git probe through `git-result-block` `failure` (real `ExecResult`, marker-extracted
    cause). This helper de-duplicates the pending-worktree mapping that `branch-latest-commit` had inline;
    both commands now call it with their own command label.
- **`CommandIo` progress phases preserved.** The command keeps `commandIoFromSdlExtensionApi` +
  `runWithCommandIo` + `io.phase(...)` for hosted/Pi progress; only the final result block changed.
- No command semantics changed: dirty worktree still required, clean worktree still points to
  `branch-latest-commit`, warnings still go to stderr, exit codes unchanged, no machine contract or raw
  exit added.

## Objective impact

- `cli-surface-audit.md` now marks `sdl flow autobranch` as Done.
- The deferred refusal/failure divergence from the `branch-latest-commit` slice is resolved at the shared
  type, so both finite autobranch commands honor §7.3 without flow-local string sniffing.
- All presentation stays flow-local; the discriminator/classifiers stay in `@sdl/autobranch` (their
  natural home, shared with CCC). No clinkr/core extraction — consistent with the standing no-extraction
  decision.
- The side-effect workflow/progress roadmap row remains open for `autoslot`, `regenerate-pr`, and `land`.

## Follow-ups

- PR 3 (`sdl flow autoslot`) consumes CCC `createAutobranchCheckpointFlow`, which now returns the
  `outcome` discriminator; autoslot currently reads only `.error`/`.summary` and can surface the
  branch-created-but-slot-skipped/failed states in the house style without re-deriving refusal state.
- `backup_branch_name_unavailable` is classified as `failure` (an operational inability to allocate a
  recovery branch, not a user-state precondition) despite its "refusing" wording; revisit if review
  prefers it as a `refusal`.

## Evidence

Validation run after implementation:

- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/capabilities/flow/test/scenario/autobranch-command.test.ts packages/capabilities/flow/test/scenario/branch-latest-commit-command.test.ts packages/capabilities/flow/test/unit/workflow-result-block.test.ts packages/sdl/test/scenario/autobranch-cli.test.ts packages/sdl/test/scenario/branch-latest-commit-cli.test.ts`
  — passed (35 tests).
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/autobranch packages/ccc/test/autobranch-flow.test.ts packages/ccc/test/autoslot.test.ts`
  — passed.
- `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`, `just ts-guard`,
  `just dprint-check`, `just ts-deps-check` — see commit/PR for the recorded run.
