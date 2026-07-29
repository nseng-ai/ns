# Remediate High-Severity Repeated Switches

## Thesis

Remove six adversarially verified high-severity Repeated Switches smells from current production TypeScript by giving each repeated policy one canonical owner. Each finding repeats decisions about a discriminated result, policy, action, or message-part family across multiple switches or cascades, increasing drift risk whenever a variant changes.

This is a bounded autoobjective: autorun should re-verify and address one finding per parent-judged slice, preferring the lowest-coupling work first, until every captured finding has an evidence-backed disposition.

## Scope

- Work only from the six high-severity findings captured in `references/repeated-switches-audit.md`:
  1. review-harness execution diagnostics;
  2. Flow pending-worktree failure semantics;
  3. Foundation `ExecResult` termination policy;
  4. context-profiler `MessagePart` semantics;
  5. Branch Context creation policy;
  6. release-reset action semantics.
- Re-verify current paths, repeated sites, shared policy, and smallest viable refactor at pickup time.
- Give each repeated policy one package-appropriate canonical classifier, facts projection, descriptor, or metadata table while leaving adapter-specific presentation at its existing boundary.
- Preserve exact observable behavior, diagnostic text, exit behavior, public exports, and error semantics.
- Add or adjust focused characterization coverage only where needed to prove parity.
- Give every captured finding one evidence-backed disposition:
  - **fixed** when the repeated policy is centralized and validation passes;
  - **disposed** when re-verification shows the smell is stale or the prescribed refactor would be worse than the smell, with parent-approved rationale;
  - **routed** when another active Objective clearly owns the work, with parent-approved rationale and the target Objective named.

## Non-Goals

- No medium- or low-severity findings from the Repeated Switches audit.
- No fresh code-smell sweep or expansion of this fixed six-finding backlog.
- No observable behavior, diagnostic-copy, exit-code, public-surface, or error-semantics changes.
- No broad polymorphism framework, cross-package abstraction, or speculative generalization.
- No opportunistic cleanup adjacent to a selected repeated policy.
- No automatic disposal or routing when a finding becomes design-bearing: skip it for that run, leave it open, and stop for later parent judgment.
- No push, submit, pull-request creation or mutation, merge, land, deployment, publication, or other external write.

## Completion Criteria

- Every one of the six findings in `references/repeated-switches-audit.md` has a recorded fixed, disposed, or routed disposition.
- Every fixed finding has one canonical owner for the shared policy and no equivalent repeated policy cascade remains at the verified sites.
- Fixed slices preserve exact observable behavior and text, public exports, exit behavior, and error semantics.
- Disposed and routed findings carry concrete parent-approved rationale; routed findings name the active target Objective.
- Focused package tests and relevant repository checks pass for every fixed slice.
- Completion evidence identifies the accepted local implementation and tracking commits without calling portable commits Runner Checkpoints.

## Definition of Progress

Progress is keepable when one re-verified finding receives a complete, review-substantive disposition. A fixed slice centralizes only the shared policy, preserves adapter ownership and exact observable behavior, and passes parent-run validation. A disposed or routed slice records concrete re-verification evidence and parent-approved rationale without manufacturing code churn.

Do not keep changes that broaden into unrelated cleanup, alter user-facing text or behavior, introduce speculative architecture, cross package ownership without an already-established dependency, or partially migrate a repeated policy while leaving competing owners.

Useful evidence includes a source sweep of every repeated site, focused characterization or package tests, `git diff --check`, relevant formatting/lint/type checks, and the repository's default validation entrypoint where appropriate.

## Runner Policy

This Objective is designed for repeated local-only autorun slices with parent judgment between slices.

- Direct execution is allowed after the normal autorun preview for one roadmap row whose current code still matches the captured shared-policy shape.
- Prefer rows in roadmap order, which is lowest coupling first; skip a blocked or stale row rather than silently broadening it.
- Re-verify the finding before editing. If the documented smallest fix no longer fits or the work requires a broader design decision, make no implementation changes for that row, leave it open, and stop the run for later parent judgment.
- Implement at most one finding per accepted slice. Preserve exact observable behavior, diagnostic text, exit behavior, public exports, and error semantics.
- Keep implementation changes uncommitted in the child. The parent inspects the full diff, runs validation directly, and creates the accepted local commit according to the selected autorun mode's trust contract.
- Add focused characterization coverage when existing tests do not adequately pin the behavior or text being centralized; do not add ceremonial tests.
- A stale or unsuitable finding may be disposed, and overlap may be routed, only with parent-approved evidence and rationale. The implementation child does not edit Objective tracking.
- Use one dedicated run branch for portable autorun, following the `objective-autorun` branch preparation contract. Never commit on trunk.
- Push, submit, PR mutation, publication, merge, land, deployment, and every other write-capable external action are out of scope.

## Assumptions and Risks

Assumptions:

- The six findings remain independent enough to land as one finding per slice.
- Each repeated policy can be centralized within its current owning package without changing a public contract.
- Existing package tests provide most parity evidence, with focused characterization coverage sufficient for any real gap.

Risks:

- A facts object or metadata table can become a shallow mirror of the union rather than a genuine canonical policy owner; each refactor must remove competing interpretation, not merely add another layer.
- Some switches may be legitimate adapter-specific exhaustive handling. Re-verification must centralize only shared decisions, labels, metadata, validation, or behavior.
- Exact diagnostic-text preservation makes seemingly harmless wording cleanup out of scope.
- Cross-package helper placement could violate release-disposition dependency closure; keep policy with the package that owns the concept and stop if a new dependency would be required.
- The codebase may move or independently remediate a finding before pickup; use disposed or routed only with parent-approved evidence rather than forcing stale work.

## Open Questions

None at creation. Design-bearing discoveries stop the current run and leave the affected row open for later parent judgment.

## Closure

Completed. Four of the six captured high-severity Repeated Switches findings received fixed dispositions, each with one canonical package-appropriate policy owner and separate Semantic Update evidence. Two findings were disposed post-implementation by parent review: the slices were implemented and validated, then judged not worth landing and dropped from the stack (PRs #4007 and #4008 closed unmerged). The accepted implementation stack preserves the audited observable behavior, diagnostics, public signatures, exit and error semantics, and adapter-specific presentation boundaries.

Evidence:

- Reviews execution diagnostics: Runner Checkpoint `461daa9199948299d8ac28294e0fb5301823d91f`.
- Flow pending-worktree failure facts: Runner Checkpoint `33c67a995eb75665a5a04e4780b928cc0242ff01`.
- Foundation `ExecResult` termination policy: disposed post-implementation — parent review judged the private classifier a shallow mirror of the union with modest gain (consumers use disjoint fields; termination text is built eagerly for success checks). PR #4007 closed unmerged.
- Context-profiler `MessagePart` semantics: disposed post-implementation — parent review judged the eager facts projection a performance-profile regression risk (full-text copies of thinking parts allocated during character counting over large sessions). PR #4008 closed unmerged.
- Branch Context creation policy: Runner Checkpoint `0c3040aeb595bcc4f1d57c8a1b4cebaec69dbd90`.
- Release-reset action semantics: Runner Checkpoint `43f305901e387fc0264c3a7dd222b606742ce553`.
- Every Runner Checkpoint attested branch, unchanged pre-finish HEAD, clean index, non-empty candidate diff, Graphite tracking, and `git diff --check` before creating its implementation commit.
- Each child reported focused package validation and a successful default `just` run; detailed command evidence is retained in the corresponding Semantic Update and remains child-reported rather than runner-attested.

Two findings are disposed with parent-approved rationale recorded above; no routed findings remain. The medium- and low-severity audit findings remain explicitly parked and outside this Objective.
