# Submit-check and recovery implementation plan rebased to the settled contract

## Summary

Replaced the superseded validation-gates plan with an implementation-ready plan for the
two settled submit-specific slices. The revised plan retains `flow.submit.pre`, renames the
user-facing bypass flag to `--no-checks`, makes
`FLOW_SUBMIT_CHECK_FAILURE_MARKER` the exact public marker line, adds the
`flow.submit.pre.recovery` prompt point, and wires recovery through the existing Pi CLI
adapter completion hook. It explicitly excludes `ns flow validate`, `flow.validation.*`,
a general gates module, wildcard point definitions, and a structured CLI failure envelope.

The plan was reverified against current source rather than mechanically renaming the old
steps. Durable implementation facts now recorded there include both submit presentation
paths and their deterministic failure handling, the current SDK location of built-in point
definitions, the generic Pi mirror's existing `afterCommandComplete` seam, the absence of
any current Flow `code-just-fix` or prose-sniffing bridge, and the synchronous built-in
catalog's inability to derive another package's descriptor path. The generic default
recovery prompt therefore remains an isolated Flow fallback after normal repo point
resolution, preserving the Objective's opt-in-flip boundary without expanding the parked
point-definition consolidation debt.

## Objective Impact

The submit pre-check contract and recovery rows are now ready for implementation without
the stale plan pulling abandoned validation architecture back into scope. The roadmap note
was updated to identify the revised plan as current execution detail. No product decision,
Objective boundary, assumption, edge, or Blocked Sentence changed; the Objective remains
open and the marker/recovery implementation has not yet landed.

The plan also fixes the package-boundary intent for the public marker: define it beside the
submit failure formatter and re-export only that contract through `@nseng-ai/flow/api`,
rather than exposing Flow's broad private submit barrel. Repository-specific recovery
policy remains a future consumer artifact at
`.ns/prompts/flow.submit.pre.recovery.md`.

## Follow-Ups

- Implement the submit pre-check contract slice first: marker, public export,
  `--no-checks`, user-facing checks vocabulary, and both-path tests.
- Implement the recovery point, generic fallback, Pi completion hook, and this repo's
  consumer prompt as the following slice.
- Keep the broader extension-point guide expansion, four audit resolve clusters, and README
  promotion in their existing roadmap rows.
