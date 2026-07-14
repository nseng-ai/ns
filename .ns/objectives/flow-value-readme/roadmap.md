# Roadmap

## Work

- [ ] First readme-driven pass over `references/README-draft.md` (seeded verbatim
  from the canonical Flow README): restructure to the agreed skeleton — Why Flow
  (pillars) → everyday loop → working in parallel → keeping stacks clean → making
  Flow yours → reference below the fold — and grill the open content questions
  (pillar presentation, primary reader), settling answers into the draft. The
  everyday-loop section gets a worked example with realistic command output and
  the `ns address` boundary reference.
- [ ] Implement `[flow.models]`: manifest-declared settings schema, resolution
  ladder (env var → repo setting → built-in default), explicit disposition for
  the legacy env names, active-source inspectability.
  Evidence: unit/scenario tests for the ladder and `just` green.
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
