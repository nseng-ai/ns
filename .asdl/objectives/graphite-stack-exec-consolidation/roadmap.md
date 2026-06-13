# Roadmap

## Work

- [x] Design the canonical structured Graphite stack fact command.
      Decide the command path, likely `slot gt exec stack-branches`, and its stdout/JSON contract. Capture how trunk exclusion, current-branch inclusion, descendant handling, warnings, and fork ambiguity should behave.
      Done: command is `slot gt exec stack-branches` (hidden exec subgroup); default stdout is compact `{"branches": [...]}` matching `pr-address exec map-branch-prs` stdin; `--format json` carries trunk/current/scope/warnings diagnostics; trunk excluded, current included, trunk-to-tip order; current-on-trunk is a negative exit; untracked/missing-metadata/fork are fail-closed failures with `--downstack` as the unambiguous escape. Full contract in `updates/2026-06-12-stack-branches-command-contract.md`. Parallel-implementation audit found no duplicate Python stack discovery; duplication is confined to skill guidance and the TS submit parser already tracked below.

- [ ] Add structured walk diagnostics to `asdl_core.gt` `StackInfo`.
      Prerequisite slice discovered during contract design: the metadata reader reports forks, cycles, missing rows, and trunk-marker problems only as prose warning strings, so the exec command cannot classify fail-closed conditions without string matching. Extend the reader to emit structured diagnostics (walk scope: ancestor/descendant/trunk-marker; kind: fork/cycle/missing-row/marker; branch; children for fork points), deriving the existing human-readable warning strings from them.
      Evidence: `asdl_core.gt` unit tests cover each diagnostic kind; existing consumers unaffected.

- [ ] Implement and test the `slot gt exec stack-branches` helper.
      Build the hidden exec subgroup under `slot gt` on the structured-diagnostics `StackInfo`. Cover branch ordering, current branch inclusion, trunk exclusion, current-on-trunk behavior, untracked branch behavior, missing metadata, scope-relevant warning fail-closed behavior, `--downstack`, and fork/ambiguity behavior. Share trunk-exclusion/dedupe logic with `collect_stack_branches` rather than forking it (note: that helper excludes current; the exec command includes it).
      Evidence: targeted unit/scenario tests and relevant repo checks pass.

- [ ] Replace agent-facing `gt ls --stack` parsing guidance.
      Update `stack-address` and related PR-address references so the stack branch list comes from the canonical structured helper. Audit other skills that mention `gt ls` or `gt log` and distinguish human visual confirmation from machine topology decisions.

- [ ] Consolidate stack-address preflight mechanics.
      Design and implement the tested helper or canonical command sequence that combines branch-to-PR mapping, stack JSON construction, compact `stack-feedback-prep` invocation, and summary/reference output without manual hand-transcribed shell/JQ steps.

- [ ] Audit additional `slot gt exec` consolidation candidates.
      Decide whether commands such as stack info, descendant subtree/fork structure, or current tracking status should be added now, deferred, or rejected. Keep mutations like `gt submit` and `gt restack` out unless a safety-policy wrapper is explicitly justified.

- [ ] Decide the `asdl-dev submit` `gt log --stack` parser path.
      Audit `ts/packages/asdl-dev/src/submit-pr-metadata-prewrite.ts` and record whether to replace the parser, route it through structured topology facts, or retain it with documented submit-specific rationale.

- [ ] Close the documentation loop.
      Document the rule that agents must not parse `gt ls`, `gt ls --stack`, or `gt log` for stack topology. Point future workflows to the canonical structured command and document any remaining visual-confirmation-only uses.

## Parked

- [ ] General Graphite mutation wrappers.
      Do not pursue wrappers for ordinary `gt create`, `gt modify`, `gt submit`, `gt restack`, or `gt move` unless a later design identifies safety policy that Graphite itself does not provide.

- [ ] CCC landing-topology unification.
      CCC already owns private landing orchestration and stronger landing-specific topology checks. Revisit only if duplication creates maintenance pain or a clean lower-capability boundary emerges.
