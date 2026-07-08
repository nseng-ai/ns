---
edges:
  - objective: skill-management-subsystem
    annotation: Subobjective of that umbrella; tracks the remaining post-review harness-artifacts cleanup after the API re-export / force-required naming slice, covering home-dir ownership, provision/reconcile design, schema/source cleanup, and review-thread disposition before the subsystem breadth continues.
---

# Harness Artifacts Post-Review Cleanup

## Thesis

The harness-artifacts stack has passed its initial steelthread and npm-module-bundled provisioning work, but the remaining post-review feedback still points at real design cleanup that should not be handled as scattered PR-thread chores. This bounded Subobjective finishes the non-AUTO follow-up work after the explicit API/root re-export and force-required naming slice: resolve the remaining ownership and source-of-truth questions in `@nseng-ai/harness-artifacts`, verify or close the relevant review feedback, and synthesize the outcome back into the `skill-management-subsystem` umbrella.

This is a bounded execution/coordination Subobjective under `skill-management-subsystem`, not an orienting Objective. It should be found and used by agents working on the harness-artifacts stack, but unrelated agents do not need a repo-wide standing rule.

## Scope

- Resolve home-dir and harness-path ownership feedback: clarify where effective home/env fallback logic belongs across `@nseng-ai/harness-artifacts`, `@nseng-ai/kernel`, `@nseng-ai/ns-init`, and tests; remove duplicated ad hoc fallback logic where a shared helper or clearer boundary is warranted.
- Resolve provision/reconcile design cleanup: reduce duplicated outcome builders, conflict-file extraction, conflict action classification, preview/apply duplication, skipped-collision handling, and conflict/refusal message ownership where review feedback identifies drift from the intended reconcile architecture.
- Resolve schema and source-of-truth cleanup: consolidate duplicated schema/type definitions where appropriate, including repeated harness/scope schemas, diagnostic transforms, and readonly-array schema choices, without inventing a broad schema framework.
- Re-download and disposition the relevant PR review feedback after GitHub rate limits allow it; close only threads that are directly fixed or verified stale.
- Keep the `skill-management-subsystem` umbrella informed through its existing edge relationship and eventual synthesis of the completed cleanup.

## Non-Goals

- Do not reopen the already closed `harness-artifacts-thermo-remediation` Objective; this record tracks the remaining post-review cleanup after that remediation closed.
- Do not absorb unrelated parked breadth from the umbrella, such as marketplace/remote catalog discovery, uninstall/version-resolution, trust gating, per-resource filtering, or agent/extension-bundle provisioning, unless a cleanup decision explicitly parks or routes it back to the umbrella.
- Do not broaden this Objective to replace the current implementation branch for `harness-artifacts-api-reexport-force-rename`; that slice handles API/root re-export and `needsForce` → `requiresForce` naming separately.
- Do not mutate GitHub review threads, submit/push stack updates, or provision into real user-global harness directories without explicit user approval and appropriate validation.

## Completion Criteria

- The home-dir / harness-path ownership feedback is resolved by implementation, documented decision, or explicit parking back to the umbrella with rationale.
- The provision/reconcile design cleanup feedback is resolved by coherent implementation slices or explicitly parked with rationale, with the reconcile architecture clearer rather than more fragmented.
- The schema/source-of-truth cleanup feedback is resolved by removing duplication where it pays for itself, or by documenting why a duplicate boundary is intentional.
- Relevant unresolved PR review threads for these buckets are reloaded, mapped to fixes or stale status, and closed/replied to only after direct evidence and validation.
- Relevant TypeScript checks/tests for touched packages pass, with repo-standard formatting/lint/typecheck behavior followed.
- `skill-management-subsystem` receives synthesis of the outcome, including which cleanup concerns were completed, parked, or retired.

## Assumptions and Risks

Assumptions:

- The remaining feedback can be completed as a bounded cleanup Objective without changing the already-decided harness-artifact vocabulary, npm-module source model, or `ns update` reconcile direction.
- The API/root barrel and force-required boolean naming issues are handled in the separate `harness-artifacts-api-reexport-force-rename` branch/context and are not part of this Objective's main scope except as context.
- Local code evidence plus refreshed PR feedback will be enough to distinguish live comments from stale review threads after stack updates land.
- Most cleanup can remain inside `@nseng-ai/harness-artifacts` and thin consumers such as `@nseng-ai/ns-init` or kernel CLI seams, rather than requiring a new package or broad architecture move.

Risks:

- Scope creep could turn review cleanup into the umbrella's broader parked breadth. Mitigation: implement only the three named cleanup buckets here and park broader product surfaces back to `skill-management-subsystem`.
- GitHub API rate limits or stale stack state may block timely review-thread verification. Mitigation: record the blocker and avoid closing threads without refreshed evidence.
- Provision/reconcile cleanup touches public schemas and machine outputs; careless renames can break in-repo consumers or PR feedback expectations. Mitigation: use stale-symbol greps and package/type checks after each coherent slice.
- Home-dir ownership crosses package boundaries; moving helpers to the wrong layer could violate capability/kernel layering. Mitigation: prefer explicit gateway/helper ownership and read relevant boundary docs before introducing shared abstractions.

## Open Questions

- Resolved by execution order: home-dir ownership landed first, followed by provision/reconcile design cleanup, schema/source-of-truth cleanup, and final review-thread disposition.
- Resolved by final refresh: after disposition, the only remaining unresolved reviewed thread from the inventory is AREG-tail `PRRT_kwDOR4YhMs6O67Wa`, replied to and intentionally parked out-of-scope.
- Resolved by synthesis: AREG-tail cleanup is parked outside this child; broader umbrella work remains in `skill-management-subsystem`.

## Closure

Closed 2026-07-08 after completing all three cleanup buckets and the final review-thread disposition/synthesis row.

The Objective delivered home-dir/harness-path ownership cleanup across kernel, harness-artifacts, and ns-init; provision/reconcile design-seam cleanup in `@nseng-ai/harness-artifacts` and thin consumers; and schema/source-of-truth cleanup carried by PR #3229. Completed-slice updates record the package checks/tests and formatting validation for each implementation bucket.

Final review-thread disposition refreshed PRs #3121, #3137, #3140, #3158, #3159, #3161, and #3162. Direct fixed or stale threads were replied/resolved with `ns address exec close-review-threads`; the AREG-tail thread `PRRT_kwDOR4YhMs6O67Wa` was replied to but intentionally left unresolved because it is outside this child Objective's scope. The result was synthesized into the `skill-management-subsystem` umbrella in `updates/20260708T104546Z-harness-artifacts-post-review-cleanup-synthesis.md`.

Known caveat: `ns objective check harness-artifacts-post-review-cleanup` still reports the pre-existing immutable-update heading issue in `updates/20260707T234420Z-home-dir-harness-path-ownership.md`; this closure does not silently repair historical provenance.
