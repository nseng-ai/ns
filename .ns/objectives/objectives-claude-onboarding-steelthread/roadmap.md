# Roadmap

## Work

- [x] Qualify package artifacts containing the canonical bare-core Claude Code onboarding READMEs; intentionally skip publishing this README revision.
  - Evidence: `ts/packages/hosts/ns/README.md` and `ts/packages/capabilities/objectives/README.md` agree on package names, command order, repository outputs, and lifecycle terminology. A packing defect was found and repaired in its owning surface: the `@nseng-ai/objectives` manifest omitted `README.md` from `files`, so freshly packed tarballs shipped no top-level README; adding it to `files` now emits the canonical README (verified via `npm pack --dry-run`: top-level `README.md`, 96->97 files), while `@nseng-ai/ns` already packed its README. Checkout-free acquisition still passes post-fix. By explicit direction, the version-bumped registry publication and registry verification were skipped, not completed; no registry-served README claim follows from this row.
- [x] Prove registry installation and activation in a clean foreign repository before invoking Claude Code.
  - Evidence: the `0.1.3` checkout-free smoke installed bare core, initialized Claude Code, installed `npm:@nseng-ai/objectives`, provisioned all ten declared Objective skills, and ran `ns objective list` without checkout dependencies. The next publication must preserve this behavior while adding the canonical READMEs.
- [ ] Run the complete create → next → update → close journey from a fresh Claude Code session using only the published docs and activated repository state.
  - Evidence: Claude Code discovers and uses the Objective skill and CLI without hidden prompt injection; the created and closed Objective record passes `ns objective check`. This exact evidence remains gated because published `0.1.3` predates the canonical READMEs and publication of the repaired README revision was intentionally skipped.
- [ ] Repair every journey deviation in its owning surface and repeat the steelthread from a clean repository with zero improvisation.
  - Evidence: a final clean run records exact package versions, docs revision, environment boundaries, commands, and successful lifecycle outcomes; unresolved defects become explicit blockers or bounded follow-ups.
- [ ] Verify the final registry-served onboarding READMEs and synthesize the thread's lessons for the umbrella.
  - Evidence: npm serves package READMEs matching the successfully exercised path, and closure context states which seams were proven and which breadth remains deferred.

## Parked

- [ ] Repeat end-to-end onboarding verification for Codex, including repository-local `.agents/skills/` provisioning and instruction reachability.
- [ ] Repeat end-to-end onboarding verification for Pi, including its additive extension behavior.
- [ ] Verify additional harnesses beyond Claude Code, Codex, and Pi.
- [ ] Add customer-facing skill upgrade and drift-management workflows after first-install behavior is proven.
