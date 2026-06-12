# Roadmap

## Work

- [ ] Design the canonical structured Graphite stack fact command.
  Decide the command path, likely `slot gt exec stack-branches`, and its stdout/JSON contract. Capture how trunk exclusion, current-branch inclusion, descendant handling, warnings, and fork ambiguity should behave.

- [ ] Implement and test the first Graphite exec helper.
  Use the existing `asdl_core.gt` metadata-backed gateway instead of parsing Graphite display output. Cover branch ordering, current branch inclusion, trunk exclusion, current-on-trunk behavior, untracked branch behavior, missing metadata, and fork/ambiguity behavior.
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
