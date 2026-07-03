# Typed Submit Gateway Causes

## Summary

The submit gateway contract now carries typed semantic causes instead of final user-facing prose. `SubmitRunResult` exposes `semanticFailureCause` for the empty-branch skipped-submission case, and `CurrentPrVerificationResult` exposes typed `cause` values for no-current-PR, startup error, timeout, and generic command failure states.

`RealSubmitGateway` now maps Graphite/process observations to those causes, while `runSubmitCommand` formatter helpers own the English guidance that appears on stderr. The in-memory submit fake copies and returns semantic cause states, so scenario tests no longer construct final `gt submit exited 0...` messages to model gateway behavior. The scripted command runner also supports `killed` results so real-gateway tests can exercise timeout cause mapping.

Verification: targeted submit gateway/scenario tests passed, the `asdl-dev` package typecheck passed, and workspace `just ts-check` plus `just ts-test` passed.

## Objective Impact

- Roadmap "Replace presentation-string submit gateway fields with typed semantic result causes" moves to `[x]`.
- The completion criterion requiring typed semantic causes, formatter-owned prose, and semantic in-memory fakes is satisfied for the known submit/current-PR states.
- The assumption that existing submit behavior can be preserved through the boundary cleanup is validated by scenario coverage for no-current-PR and empty-branch guidance.
- The Graphite-output parsing risk is narrowed by keeping parsing in the real gateway and asserting cause mappings in gateway tests, while future Graphite success-with-failure states still need explicit cause variants.

## Follow-Ups

- If Graphite exposes additional zero-exit semantic submit failures, add explicit `SubmitSemanticFailureCause` variants and formatter mappings rather than returning raw English from the gateway.
- Remaining Objective work is unchanged: decide whether `/dev:submit` needs a thin Pi UX wrapper and re-run the strict code-quality review against the hardened consolidation.
