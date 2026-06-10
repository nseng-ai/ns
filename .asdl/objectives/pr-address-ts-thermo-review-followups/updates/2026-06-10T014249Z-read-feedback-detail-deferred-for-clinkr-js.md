# `read-feedback-detail` deferred for Clinkr JS payload support

## Summary

The `read-feedback-detail` singular Python containment parity row was moved from active Work to Parked. The decision is to defer this slice until the Clinkr JavaScript port lands, because that port is expected to provide first-class payload support features that should own, standardize, or simplify the payload containment boundary.

The original concern remains valid: the singular helper still needs to align with the managed payload-store/session containment contract before the Objective can fully close. The sequencing changed so the fix can build on the future Clinkr JS payload support layer rather than adding another bespoke pr-address-local containment implementation now.

## Objective Impact

The next active Objective work should no longer be the singular `read-feedback-detail` containment parity slice. With that row parked, the highest-order active roadmap item becomes the CLI argument compatibility gap (`--format=json` and strict integer parsing), followed by the dead-code/support-layer consolidation rows.

Completion criteria still include the `read-feedback-detail` containment behavior, but it is intentionally deferred behind Clinkr JS payload support rather than removed from scope.

## Follow-Ups

- Revisit the parked `read-feedback-detail` row after the Clinkr JavaScript port exposes the relevant payload support primitives.
- Until then, choose the next active semantic remediation slice from the non-parked Work section.
