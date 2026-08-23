# Semantic Update: Flow outcome schemas reconciled and Clinkr violations made actionable

## Summary

The Flow string-rendering reconciliation intentionally made shared-runner negative and failure outcomes carry string data, but four presentation-ready command definitions did not yet declare every status-specific schema they used. Clinkr correctly rejected that caller/schema mismatch, causing a configured failing `flow.submit.pre` check to throw after Flow had produced its settled result.

The repair preserves Clinkr's clean-cut contract: omitted status schemas still require bodyless outcomes, configured schemas still require validated data, and violations remain thrown programmer errors. Clinkr diagnostics now identify the complete canonical command path, returned status, mismatched schema, and concrete repair; schema parse failures retain the Zod error as their cause.

Flow now declares string negative/failure schemas for `autoslot`, `land`, and `submit`, normalizes the mixed early paths in `autoslot` and `submit` to carry message-identical string data, and declares precise structured confirmation usage-error schemas for `submit` and `regenerate-pr`. `regenerate-pr` negatives remain intentionally bodyless. The other seven presentation-ready commands (`changes`, `cp`, `autobranch`, `branch-latest-commit`, `push`, `pull-trunk`, and `squash-stack`) remain bodyless for non-success statuses and therefore did not receive mechanical status schemas.

## Verification evidence

- Focused Clinkr rendering/runtime tests cover omitted schema, missing data, invalid data with preserved cause, and a nested canonical path.
- Focused Flow runner and scenario tests cover shared-runner string data, autoslot mixed paths, submit cancellation/early/check outcomes, and both structured usage-error shapes while preserving regenerate-pr bodyless negatives.
- The SDK real-loader integration reproduces a configured failing submit check and now observes semantic exit `1` without an invariant throw; repeated focused runs passed.
- Real-loader JSON coverage verifies both negative and failure check outcomes retain message-identical string `data` in their envelopes.
- Workspace typecheck remains blocked by pre-existing clean-cut Clinkr caller typing errors outside this repair's scope; the focused Clinkr and Flow checks pass.

## Objective impact

This advances the outcome-and-rendering reconciliation without weakening the settled framework contract or introducing a compatibility fallback. The regression was a Flow caller/schema mismatch exposed by Clinkr's approved runtime validation, not evidence that Clinkr should reuse `resultSchema` implicitly or convert programmer errors into ordinary failure envelopes.
