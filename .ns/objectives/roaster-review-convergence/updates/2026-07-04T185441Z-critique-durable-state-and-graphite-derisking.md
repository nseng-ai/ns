# Critique: Durable-State Fixes and Graphite De-risking

## Summary

A red-team critique of the generation-time convergence design, grounded in the
roaster publish/prompt code, the CI workflow, and the address package, returned
**go-with-changes** and the changes were applied to the record:

- **Prior-findings state decayed one round after suppression succeeded.** The
  summary Findings comment body is overwritten on every publish (only the
  Activity Log is preserved), and inline threads exist only for
  inline-commentable findings — so a suppressed summary-only finding dropped
  out of durable state and could be re-raised the round after. Scope now
  requires the stamped findings block to be the capped *cumulative union* of
  previously surfaced findings, and names the stamped block (not re-parsed
  inline-comment markdown) as the structured source of truth.
- **Last-reviewed head stamping had a SHA trap.** On `pull_request`, CI checks
  out the synthetic merge commit, so `HEAD` is neither the pushed head nor
  stable; the stamp must be the PR head SHA.
- **Graphite compatibility was verified, one part empirically, one by design
  change.** Force pushes dominate this repo (recent PRs show 10–48 each), so
  the stamped head always dangles by the next run. De-risked: a fresh clone
  `git fetch --depth 1 origin <sha>` against `nseng-ai/ns` retrieved both a
  same-day and a three-month-old pre-force-push PR head — gathering must fetch
  stamped SHAs explicitly. Separately, after `gt restack` a raw
  old-head..new-head diff is dominated by upstream churn; the stamp now also
  carries the reviewed base's merge-base SHA so changed-region guidance uses
  range-diff semantics (prior PR delta vs. current), degrading to
  Prior-findings-only convergence when uncomputable.
- Verified supporting claims: thread resolution already is the pr-address
  addressed-signal (GraphQL `isResolved` reads and `resolveReviewThread`
  mutation exist in the address package / capability-kit `pr-feedback`, which
  roaster already depends on); the core `ns roaster review run` path is
  GitHub-free today; capped prior findings fit trivially inside the 90k-token
  diff budget.

## Objective Impact

The Objective remains open; mechanism and Non-Goals are unchanged. Scope,
Assumptions and Risks, Completion Criteria, and the roadmap were tightened:

- Scope: cumulative capped Prior-findings stamping; PR-head-SHA (plus base
  merge-base SHA) Last-reviewed head; gathering reads the stamped block +
  thread resolution via the existing `pr-feedback` GraphQL surface;
  changed-region prompt guidance defined as the PR's own delta with an
  explicit fallback.
- Risks: old-head reachability rewritten from *not yet de-risked* to
  de-risked-with-evidence; new restack-churn risk; new degrade-to-context-free
  rule for gathering failures. The persistence assumption now carries its
  overwrite qualification.
- Completion Criteria and the empirical-validation roadmap row now include the
  content-preserving restack/force-push case.

## Follow-Ups

- Design the cumulative stamped findings block format together with the
  existing cap Open Question (pruning policy for long-running PRs).
- Implementation must fetch stamped SHAs directly (`git fetch origin <sha>`)
  rather than assuming ref reachability, and treat range-diff computation as
  best-effort.
