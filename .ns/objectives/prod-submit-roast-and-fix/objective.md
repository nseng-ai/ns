# Prod Submit Roast-and-Fix

Ideation Objective (see `skills/objective/references/objective-patterns.md`): the
Destination is settled; the roadmap is a Frontier of typed Question Rows. Resolve one
row per session and graduate Fog as answers land.

## Thesis

Submission splits into two classes. A **cheap submit** pushes or repushes a stack as
fast as today's `ns flow submit`. A **prod submission** is the "I'm shipping this
stack" pipeline: at the stack tip it runs the applicable tripwire (quick-profile)
roaster reviews in parallel over the whole-stack diff, auto-applies AUTO-classified
fixes that survive local validation, and pushes a clean stack. Review state is encoded
so roaster — local or remote — never re-reviews the same stack content incrementally;
roaster becomes stack-aware and reviews only at the tip.

This replaces the current loop (push → remote roaster comments → download-feedback →
hand-apply → resubmit) for tripwire-grade findings: PRs arrive clean instead of being
cleaned up after the fact.

## Scope

- The two-class submission surface in flow (invocation shape to be decided on the
  frontier).
- Stack-aware, tip-only review execution over the whole-stack diff, run locally and in
  parallel during prod submission.
- A new AUTO classification axis for roaster findings (review-level eligibility gate
  plus per-finding disposition) and the fixer engine that applies AUTO findings,
  validates, and commits.
- Anti-incremental review state: durable encoding of "this stack content was reviewed"
  that both local runs and the remote roaster workflow respect.
- Dogfooded on this repo: the loop is live for real stacks here.

## Non-Goals

- Heavy/deep reviews (thermonuclear, code-smell) in any automatic pipeline: they are
  human-invoked, on demand. The prod pipeline gates on tripwires only.
- Hard-blocking submission on non-AUTO findings. v1 semantics are
  warn-and-continue; trust-gated blocking modes are Fog.
- Changes to the download-feedback / pr-address consumption surface.
- Reusing the fixer engine against remote/human PR feedback (Fog; likely a follow-on
  objective).

## Completion Criteria

- Both submission classes exist and are used on this repo; cheap submit's latency is
  unchanged from today's submit.
- A prod submission on a real stack runs tripwire reviews at the tip over the
  whole-stack diff, applies at least the validated AUTO subset of findings before
  push, and never blocks or dirties the push when the fixer or validation fails
  (fixes are discarded; findings surface as output).
- Reviewed stack content is not re-reviewed by subsequent local runs or by the remote
  roaster workflow (anti-incremental state is honored end to end).
- Crystallization: the Frontier below is empty and what remains is PR-shaped execution
  work (which may continue under this record or graduate to execution objectives).

## Assumptions and Risks

- **Assumption:** quick-profile reviews over a whole-stack diff are fast enough
  (parallelized) to sit on the prod-submit path. The latency-measurement row exists to
  confirm or disprove this before integration design hardens.
- **Assumption:** a review-level `auto_apply`-style gate plus per-finding disposition
  yields an AUTO subset precise enough to trust; overconfident AUTO classification is
  the main quality risk, mitigated by the never-block/discard-on-validation-failure
  invariant and by dogfooding the fixer standalone before submit integration.
- **Risk:** pushing model-written fixes the human never saw. Mitigations to be decided
  on the frontier (fix placement/visibility row, TTY confirmation question in the
  integration row).
- **Risk:** whole-stack tip review decouples findings from owning branches; if fixes
  must land per-branch, restack cost and complexity rise sharply. The fix-placement
  row owns this trade.
- **Risk:** anti-incremental state that remote roaster trusts is a soft attestation
  (local runs are not CI); the state-encoding row must decide how much the remote
  workflow trusts it.
- **Lineage note:** the closed Python-era records `roaster-addressing-engine` and
  `roaster-graphite-stack-workflow` explored triage/resolver/stack machinery whose
  implementation was deleted in the TS strangler rewrite; concepts may inform rows but
  no code carries over.

## Open Questions

The precisely-stateable questions live as Question Rows in `roadmap.md`. Fog — seen
but not yet stateable as one-session questions — stays here:

- **Fog:** ergonomics of manually invoking heavy reviews against a stack (surface,
  where findings go) now that they are outside every automatic pipeline.
- **Fog:** trust escalation over time — hard-block modes, blocking on manual `error`
  findings, per-review trust ledgers.
- **Fog:** reusing the fixer engine against remote/human PR feedback (auto-address of
  downloaded feedback).
- **Fog:** interaction with `flow land` — whether landing requires a prod submission,
  and what happens to review state at land time.
