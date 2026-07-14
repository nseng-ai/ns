# Graphite machine facts completed

## Summary

Completed audit findings F4 and F8 through the existing structured Graphite stack gateway.
`ns flow squash-stack` and its Pi surface now inject `GraphiteStackGateway.stack()` at the
host edge, derive only the downstack trunk-to-current path they need, and fail safely on
untracked branches, provider failures, ancestor corruption, or inconsistent trunk markers.
The workflow no longer invokes or parses the Slots Command Face, while tip-first planning,
commit counts, squash behavior, progress, and tip restoration remain Flow-owned.

Submit metadata inspection now derives current, downstack parent relationships, and whether
upstack branches exist from the same typed stack facts. Existing-PR identity comes from a
bounded `gh pr list --json number,url` query per submit-scope branch, with validated zero,
one, malformed, failed, and ambiguous results. Post-submit current-PR verification likewise
uses `gh pr view --json number,url` while retaining raw command evidence for diagnostics.
No submit topology or PR-identity decision parses `gt log` or `gt branch info` presentation
text; the separate bounded failure-prose fallback remains parked under F9.

Real adapters are composed at the ns/Pi edges and default tests inject constructor-state
Graphite fakes, so default unit, scenario, and Pi coverage does not need real sqlite, Git, or
Graphite processes. The real extension integration path exercises the checked-in Graphite
metadata schema and structured GitHub command shapes.

## Objective Impact

The roadmap's Graphite machine-facts cluster is complete. Repository identity, Graphite
machine facts, and point-default fidelity are now resolved; Pi ownership is the only
remaining audit resolve cluster. The genericization scope remains bounded: no Graphite
abstraction, new public command, general failure protocol, or Slots opt-in work was added.

Focused stack-squash and submit tests, the Flow package suite, the TypeScript default and
integration suites, formatting, lint, typecheck, the TypeScript style guard, and full
repository `just` validation pass.

The Objective remains open for Pi policy ownership, final README reconciliation and
promotion, and orientation retirement or re-derivation.

## Follow-Ups

- Move repo-owned `code-workflows` and `code-gt-restack-resolve` policy out of the Flow
  package while retaining generic Flow command mirrors.
- Reconcile and promote the canonical README after that final audit resolve cluster, then
  apply the Objective Closure Gate.
