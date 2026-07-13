**Direction: flow is becoming a generic Graphite-repo extension with a README-defined user contract; repo-specific behavior routes through extension points, never into flow code.**

Getting to: any Graphite-backed repo can adopt flow and customize it via documented
points (submit pre-checks, submit-check recovery, pr-description); the canonical contract
is the flow README (draft: this objective's `references/README-draft.md`, promoting to
`ts/packages/capabilities/flow/README.md`); point mechanics per `docs/guides/points.md`
and ADR 0031.

What you see now: submit checks and recovery, adopter point docs, repository identity,
and PR-description point-default fidelity are implemented. Checkpoints fail closed against
Graphite's configured trunk before model or Git mutation, and trunk refresh uses that
branch's exact Git upstream. The remaining audit resolve work is Graphite machine facts
and Pi ownership.

Avoid: baking ns-repo assumptions (command names, skill names, prompt text, consumer
paths) into `ts/packages/capabilities/flow`; detecting CLI failures by matching human-
facing message prose; introducing `ns flow validate`, a general validation-gates
taxonomy, or other speculative surfaces without a demonstrated independent workflow;
adding new flow customization surfaces that bypass the point catalog.

Active slice: see this objective's roadmap.md.
