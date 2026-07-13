# Roadmap

## Work

- [ ] Reconcile the Objective customer pages with the verified bare-core Claude Code path and the docs-site launch shape.
  - Evidence: installation, quickstart, concepts/Objectives, and Objective command pages contain no stale release gate or placeholder path and agree on package names, command order, repository outputs, and lifecycle terminology.
- [ ] Prove registry installation and activation in a clean foreign repository before invoking Claude Code.
  - Evidence: isolated published-package installation, `ns init --harness claude-code`, and `ns extension install npm:@nseng-ai/objectives` produce the expected config, pointer, instructions, consumer directory, and repository-local Objective skill without checkout dependencies.
- [ ] Run the complete create → next → update → close journey from a fresh Claude Code session using only the published docs and activated repository state.
  - Evidence: Claude Code discovers and uses the Objective skill and CLI without hidden prompt injection; the created and closed Objective record passes `ns objective check`.
- [ ] Repair every journey deviation in its owning surface and repeat the steelthread from a clean repository with zero improvisation.
  - Evidence: a final clean run records exact package versions, docs revision, environment boundaries, commands, and successful lifecycle outcomes; unresolved defects become explicit blockers or bounded follow-ups.
- [ ] Publish or verify the final Objective onboarding pages on the production docs substrate and synthesize the thread's lessons for the umbrella.
  - Evidence: the public pages match the successfully exercised path, and closure context states which seams were proven and which breadth remains deferred.

## Parked

- [ ] Repeat end-to-end onboarding verification for Codex, including repository-local `.agents/skills/` provisioning and instruction reachability.
- [ ] Repeat end-to-end onboarding verification for Pi, including its additive extension behavior.
- [ ] Verify additional harnesses beyond Claude Code, Codex, and Pi.
- [ ] Add customer-facing skill upgrade and drift-management workflows after first-install behavior is proven.
