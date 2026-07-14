# Defer standalone flow validation command and retain submit-specific checks

## Summary

A focused product-steering session challenged the user job behind the proposed `ns flow
validate` verb. The command had been introduced by the initial Objective design as an
on-demand runner over generalized flow-owned validation gates, but only one concrete
check exists today: the pre-submit commands already run by `ns flow submit` at
`flow.submit.pre`. Generic flow adoption requires those checks and their recovery path to
be consumer-configurable; it does not itself require a standalone command or general gate
taxonomy.

The resulting decision is to defer `ns flow validate` (and any alternate public `check`
verb), retain the submit-specific `flow.submit.pre` point and implementation, and avoid a
`flow.validation.*` taxonomy or validation-gates module in the current slice. Reconsider a
public verb only when users or agents demonstrably need to execute a flow-owned check
independently of the operation it guards. A second internal check may justify shared code,
but does not by itself justify a public CLI surface.

## Objective Impact

The driving slice is now narrower: preserve submit-specific pre-check behavior, add a
stable failure marker, and route Pi recovery through a generic, consumer-configurable,
submit-scoped prompt point. The exact recovery point id remains a README decision; the
superseded `flow.validation.recovery` name must not survive by inertia from the abandoned
general-gates design.

The canonical README draft and `references/validation-gates-plan.md` still describe the
superseded design. This Objective update records that they must be revised before
implementation; they are not implementation authority where they propose the point
rename, general gates module, or standalone command.

## Follow-Ups

- Revise `references/README-draft.md` to remove `ns flow validate`, describe submit-
  specific pre-checks, and settle the submit-scoped recovery point id.
- Revise `references/validation-gates-plan.md` around the retained `flow.submit.pre` seam
  before executing the submit-check and recovery slices.
- Keep the standalone command and general validation taxonomy parked until the recorded
  independent-workflow trigger is met.
