# Submit/ship routing and metadata postcondition decided

## Summary

The submission-class surface is resolved as two separate verbs rather than a flag or
configuration mode:

- `ns flow submit` is the fast work-in-progress synchronization path. It pushes or
  repushes a Graphite stack without reviews or a PR-prose completeness promise.
- `ns flow ship` is the completion/readiness path. It validates, reviews, applies
  surviving autofixes, reconciles titles and managed descriptions for the whole stack,
  pushes, and attests the reviewed content.

Agent workflows must select the verb from intent. Backup, sharing, and cheap repushes
use `submit`; feedback remediation and other "this is ready" workflows use `ship`.
Raw `gt submit` is an explicit recovery fallback after the Flow path fails, not an
equivalent default submission route.

The decision is grounded in a concrete 2026-07-11 failure: feedback remediation created
PRs #3395, #3396, and #3397 through raw non-interactive `gt submit`. The stack pushed
successfully, but the completion workflow bypassed Flow's PR metadata generation and
left commit-derived titles and missing curated descriptions. This showed that adding a
capable command is insufficient unless agent-facing workflows route to it and the
completion command verifies its outcome.

## Objective Impact

- The Submission-class surface Question Row is resolved and marked complete.
- `ship` gains a stack-wide metadata postcondition: every submitted branch must resolve
  to a PR with an explicit title/managed-description disposition.
- Description failure may preserve the never-blocking push invariant by degrading to a
  plain push, but the outcome must be reported as "submitted, not shipped" and must not
  write ship attestation until metadata is complete.
- The pipeline-integration row now owns the remaining implementation detail and an
  incident-regression scenario for a three-branch newly created stack.
- The Objective remains open; the fixer engine and the rest of the ideation Frontier
  are unresolved.

PR evidence is contextual rather than delivery evidence: draft PRs #3395–#3397 exposed
the routing failure but do not themselves implement this Objective.

## Follow-Ups

- Update the README-driven design draft when the pipeline-integration row is worked so
  its `submit`, `ship`, Describe, fallback, and attestation prose matches this decision.
- Reconcile agent-facing Graphite, PR-address, and Flow submission skills so completion
  workflows cannot silently choose raw `gt submit`.
- Specify and test the per-PR metadata disposition result used by stack-wide ship
  reconciliation.
