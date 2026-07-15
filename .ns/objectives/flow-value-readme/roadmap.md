# Roadmap

## Work

- [ ] First readme-driven pass over `references/README-draft.md` (seeded verbatim
      from the canonical Flow README): restructure to the agreed skeleton — Why Flow
      (pillars) → everyday loop → working in parallel → keeping stacks clean → making
      Flow yours → reference below the fold — and grill the open content questions
      (pillar presentation, primary reader), settling answers into the draft. The
      everyday-loop section gets a worked example with realistic command output and
      the `ns address` boundary reference. Strengthen the existing "also available in
      the Pi harness" line into a sentence presenting Flow's Pi surface as the
      turn-saving UI tier over the same portable commands and workflows (per the
      2026-07-14 Pi-layer survey; `flow-pi-tier` owns the underlying work) — a
      sentence in the restructure, not a new section.
- [ ] **Semantic Update — shared model policy:** supersede the former
      `[flow.models]` and env → repo → built-in ladder with top-level `[models]`
      profiles and operation overrides. Omitted operations resolve to `fast`,
      projects may redefine `fast`, listed model selectors are removed, and no
      inspection command ships in v1. Evidence: policy tests and `just` green.
- [ ] Rewrite the draft's "Model-backed workflows" section against the shipped
      settings mechanism, then run a settling readme pass over the changed section.
- [ ] Promote the settled draft over `ts/packages/capabilities/flow/README.md`,
      integrating the workflows tier landed there by `flow-stack-workflows`, and slim
      `references/README-draft.md` to a pointer at the promoted doc (per the
      `generic-flow-extension` precedent).

## Parked

- [ ] Evaluate whether Flow's remaining environment-variable configuration
      (anything beyond model refs) should ride the same settings ladder once
      `[flow.models]` proves the shape.
