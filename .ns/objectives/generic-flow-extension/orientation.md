**Direction: flow is becoming a generic Graphite-repo extension with a README-defined user contract; repo-specific behavior routes through extension points, never into flow code.**

Getting to: any Graphite-backed repo can adopt flow and customize it via documented
points (submit pre-checks, submit-check recovery, pr-description); the canonical contract
is the flow README (draft: this objective's `references/README-draft.md`, promoting to
`ts/packages/capabilities/flow/README.md`); point mechanics per `docs/guides/points.md`
and ADR 0031.

What you see now: the repo-specificity audit is complete at this Objective's
`references/repo-specificity-audit.md`; its resolve work is grouped into repository
identity, Graphite machine facts, Pi ownership, and point-default fidelity. Submit checks
remain installed at `flow.submit.pre`; the public marker, `--no-checks`, and submit-scoped
`flow.submit.pre.recovery` prompt contract have landed.

Avoid: baking ns-repo assumptions (command names, skill names, prompt text, consumer
paths) into `ts/packages/capabilities/flow`; detecting CLI failures by matching human-
facing message prose; introducing `ns flow validate`, a general validation-gates
taxonomy, or other speculative surfaces without a demonstrated independent workflow;
adding new flow customization surfaces that bypass the point catalog.

Active slice: see this objective's roadmap.md.
