# Roadmap

## Work

- [x] Design the canonical structured Graphite stack fact command.
      Decide the command path, likely `slot gt exec stack-branches`, and its stdout/JSON contract. Capture how trunk exclusion, current-branch inclusion, descendant handling, warnings, and fork ambiguity should behave.
      Done: command is `slot gt exec stack-branches` (hidden exec subgroup); default stdout is compact `{"branches": [...]}` matching `pr-address exec map-branch-prs` stdin; `--format json` carries trunk/current/scope/warnings diagnostics; trunk excluded, current included, trunk-to-tip order; current-on-trunk is a negative exit; untracked/missing-metadata/fork are fail-closed failures with `--downstack` as the unambiguous escape. Full contract in `updates/2026-06-12-stack-branches-command-contract.md`. Parallel-implementation audit found no duplicate Python stack discovery; duplication is confined to skill guidance and the TS submit parser already tracked below.

- [x] Add structured walk diagnostics to `asdl_core.gt` `StackInfo`.
      Prerequisite slice discovered during contract design: the metadata reader reports forks, cycles, missing rows, and trunk-marker problems only as prose warning strings, so the exec command cannot classify fail-closed conditions without string matching. Extend the reader to emit structured diagnostics (walk scope: ancestor/descendant/trunk-marker; kind: fork/cycle/missing-row/marker; branch; children for fork points), deriving the existing human-readable warning strings from them.
      Done: `StackInfo` now carries `StackWalkDiagnostic` records and keeps `warnings` as their byte-identical rendering. Diagnostics cover load-time malformed children metadata and empty branch rows, ancestor/descendant cycles and missing rows, descendant forks with children, and trunk-marker missing/multiple/mismatch conditions. Evidence: targeted `asdl_core.gt` unit/gateway tests, `just ty`, `just test`, and asdl-slots Graphite tests passed; existing consumers continue to use the defaulted diagnostics field unchanged.

- [x] Implement and test the `slot gt exec stack-branches` helper.
      Build the hidden exec subgroup under `slot gt` on the structured-diagnostics `StackInfo`. Cover branch ordering, current branch inclusion, trunk exclusion, current-on-trunk behavior, untracked branch behavior, missing metadata, scope-relevant warning fail-closed behavior, `--downstack`, and fork/ambiguity behavior. Share trunk-exclusion/dedupe logic with `collect_stack_branches` rather than forking it (note: that helper excludes current; the exec command includes it).
      Done: hidden `slot gt exec stack-branches` now emits compact pipe-safe branch JSON, supports `--format json`, includes the current branch while excluding trunk, treats current-on-trunk as negative with data, and classifies structured `StackInfo.diagnostics` fail-closed with `--downstack` warning downgrades. Evidence: targeted asdl-slots scenario/unit suite passed, `just fix`, `just ty`, and full `just test` passed.

- [x] Replace agent-facing `gt ls --stack` parsing guidance.
      Update `stack-address` and related PR-address references so the stack branch list comes from the canonical structured helper. Audit other skills that mention `gt ls` or `gt log` and distinguish human visual confirmation from machine topology decisions.
      Done: `stack-address` now verifies and pipes `slot gt exec stack-branches` into `pr-address exec map-branch-prs --format json`; the PR-address `map-branch-prs` reference now documents that zero-jq Graphite-stack pipeline while preserving its Graphite-neutral/direct invocation contract; delete-stack current-stack discovery now uses the structured helper and limits remaining `gt branch info`/`gt ls`/`gt log` mentions to visual/advisory confirmation or verification. Evidence: focused Graphite-reference ripgrep checks passed and `just dprint-check` passed.

- [x] Consolidate stack-address preflight mechanics.
      Design and implement the tested helper or canonical command sequence that combines branch-to-PR mapping, stack JSON construction, compact `stack-feedback-prep` invocation, and summary/reference output without manual hand-transcribed shell/JQ steps.
      Done: `pr-address exec stack-feedback-preflight` maps `slot gt exec stack-branches` branch JSON to open PRs, writes a frozen stack artifact, runs compact unresolved-only prep, and returns feedback-bearing vs zero-feedback PR partitions; `stack-feedback-prep --stack-reference` reuses the exact frozen stack for drift/final refetches. Evidence: targeted pr-address Vitest scenarios and JSON-schema route tests passed; package TypeScript check passed.

- [x] Audit additional `slot gt exec` consolidation candidates.
      Decide whether commands such as stack info, descendant subtree/fork structure, or current tracking status should be added now, deferred, or rejected. Keep mutations like `gt submit` and `gt restack` out unless a safety-policy wrapper is explicitly justified.
      Done: no new `slot gt exec` command is justified. `stack-info` rejected (no consumer needs facts beyond the `stack-branches --format json` payload); arbitrary-root descendant subtree query rejected (delete-stack's narrower case is deliberately human-gated for a destructive operation); tracking-status rejected (already covered by `stack-branches` `untracked_branch` classification). The audit found two display-output-parsing hazards (`gt branch info` `Parent:` extraction in objective-update/parity-review; upstack-children check via `gt log short` in code-gt-restack-resolve) that need only existing Graphite plumbing (`gt parent`/`gt children --no-interactive`) — folded into the documentation-loop row. Mutation wrappers and CCC landing topology stay parked. Full matrix in `updates/2026-06-12-exec-consolidation-candidates-audited.md`.

- [x] Decide the `asdl-dev submit` `gt log --stack` parser path.
      Audit `ts/packages/asdl-dev/src/submit-pr-metadata-prewrite.ts` and record whether to replace the parser, route it through structured topology facts, or retain it with documented submit-specific rationale.
      Done: retained as deterministic, tested, submit-specific gateway parsing rather than agent-facing Graphite topology guidance. `slot gt exec stack-branches --format json` would replace only the branch-list/current/trunk slice while adding a TypeScript-to-Python CLI dependency and would not provide existing-PR links or submit-specific current-PR verification. `submit-format.ts`'s buffered `gt branch info --no-interactive` output is retained as current-PR verification diagnostics, not stack-topology parsing. Rationale and retained risks in `updates/2026-06-12-asdl-dev-submit-parser-retained.md`.

- [ ] Close the documentation loop.
      Document the rule that agents must not parse `gt ls`, `gt ls --stack`, or `gt log` for stack topology. Point future workflows to the canonical structured command and document any remaining visual-confirmation-only uses. Extend the rule to `gt branch info` and execute the candidate audit's guidance migrations: replace `Parent: <branch>` extraction from `gt branch info` in `skills/objective-update/SKILL.md` and `skills/code-workflows/references/parity-review.md` with `gt parent --no-interactive`, and the upstack-children display check in `skills/code-gt-restack-resolve/SKILL.md` with `gt children --no-interactive` or `slot gt exec stack-branches --format json`.

## Parked

- [ ] Consolidate repeated `--stdout-mode` option handling.
      `stack-feedback-preflight`, `stack-feedback-prep`, and `stack-feedback-plan` each parse the same `full|compact` option locally to preserve current Click fallback behavior. Revisit only if Clinkr grows a shared managed-option helper that can preserve those fallback semantics.

- [ ] General Graphite mutation wrappers.
      Do not pursue wrappers for ordinary `gt create`, `gt modify`, `gt submit`, `gt restack`, or `gt move` unless a later design identifies safety policy that Graphite itself does not provide.

- [ ] CCC landing-topology unification.
      CCC already owns private landing orchestration and stronger landing-specific topology checks. Revisit only if duplication creates maintenance pain or a clean lower-capability boundary emerges.
