# Progressive-disclosure architecture contract recorded

## Summary

Accepted ADR 0049 and reconciled the canonical Objective-system, skill topology, package taxonomy, Pi host-boundary, context, and installation documentation around one three-layer product: seven portable skills, the harness-independent `@nseng-ai/objectives` enhancement, and the required-`ns` `@nseng-ai/pi-ns-objectives` integration.

The contract keeps Objective records invariant, requires operation-specific capability detection, gives installed skill artifacts one provenance-bound management owner, preserves `npx skills` artifacts during extension update/removal, and defers public skill promotion to a separate support-warrant review.

## Objective Impact

The first roadmap slice is complete. Architecture and ownership decisions no longer block implementation of the portable skill family, Objective extension adaptation, or Pi extraction. ADR 0049 preserves ADR 0024's runner trust boundary, ADR 0037's parent-only publication boundary, ADR 0045's Pi host ownership, and ADR 0046's independent skill support disposition.

## Follow-Ups

- Implement the seven portable skills, including `objective-list`, concrete capability probes, and the clean removal of `objective-critique`.
- Adapt harness-artifact reconciliation and `@nseng-ai/objectives` provisioning to enforce provenance-bound ownership.
- Extract Pi presentation and orchestration to `@nseng-ai/pi-ns-objectives`, adding curated Objective package API only where extraction proves it necessary.
- Prove acquisition, enhancement, Pi use, and reverse removal in checkout-independent scenarios.
