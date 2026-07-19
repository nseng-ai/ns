# Roadmap

## Work

- [x] Reorganize existing Herdr commands under resource and compositional namespaces
  - Allow the third namespace segment to identify either a native Herdr resource (`space`, `tab`) or an optional integrated workflow family (`handoff`, `objective`); do not impose a universal noun rule.
  - Rename the existing workspace prompt, trunk-prompt, and plan command interfaces to `/ns:herdr:handoff:{prompt,trunk-prompt,plan}` without changing workflow behavior.
  - Rename `/ns:herdr:sidebar:objective-summary` to `/ns:herdr:objective:sidebar-summary` without changing Objective selection or workspace-label behavior.
  - Keep `/ns:herdr:space:{new,goal}` unchanged.
  - Keep `/ns:herdr:tab:plan-dispatch` unchanged pending its separate namespace disposition.
  - Evidence: the canonical catalog and focused fake-driven scenarios prove the four hard renames, absence of aliases, and preserved branch, payload, plan, slot, dry-run, destination, Objective-selection, label, new-space, space-goal, and tab-plan behavior; package checks and the repository `just` baseline pass.

- [x] Replace cmux handoff-tab with a Herdr-native workflow
  - Replace `/ns:cmux:handoff-tab` with `/ns:herdr:handoff:tab` while preserving Handoff Artifact creation, content-derived slugging, collision refusal, saved-artifact verification, and pickup command semantics.
  - Use explicit `HERDR_WORKSPACE_ID`, create a focused Herdr tab labeled `handoff: <slug>`, and run the pickup Pi in its returned pane.
  - Keep Handoff Artifact behavior owned by Handoffs and Herdr destination behavior behind `HerdrGateway`; do not introduce a generic multiplexer interface.
  - Evidence: a curated optional Handoffs Pi integration keeps artifact composition, content-derived slugging, and persistence in Handoffs; after persistence, the model invokes the hidden reference-based `ns herdr exec handoff-tab launch` command with branch, slug, exact caller workspace, and exact Pi launch profile. The command verifies through the Handoffs Capability API before Herdr mutation. Fake-driven tests prove exact/conditional registration, idempotent slug-tool registration, caller preflight before prompt delivery, reference-only transport, verification ordering, pickup model/provider/thinking preservation, and structured create/run recovery.

- [ ] Remove standalone Herdr open-branch and the cmux capability
  - Delete the dedicated Herdr open-branch command modules and tests while retaining launch helpers consumed by dispatch.
  - Delete `@nseng-ai/cmux`, `.pi/extensions/cmux.ts`, `ns cmux exec`, and all cmux workspace/surface/sidebar registrations, tests, and package wiring.
  - Regenerate the pnpm lockfile and prune Capability Kit cmux exports only after a clean surviving-consumer audit.
  - Evidence: package/import inventories and exact live-surface searches confirm removal without breaking Herdr dispatch or portable Handoff workflows.

- [ ] Reconcile live topology and documentation
  - Update Herdr, Handoffs, Pi, root contexts, `CONTEXT-MAP.md`, Pi docs, parity documentation, package counts, release inventories, and current help surfaces.
  - Delete dedicated live cmux docs that no longer describe a supported feature; preserve accurate historical ADRs, closed Objectives, retrospectives, and reshape specifications.
  - Record any stale `docs-site/` catalog entry as a gated follow-up rather than editing that surface without authorization.
  - Evidence: semantic stale-reference classification plus relevant focused tests and full `just` pass.

- [ ] Design and disposition `/ns:herdr:handoff:trunk-plan`
  - Decide Saved Plan source, refreshed-trunk parent behavior, branch-context provenance, destination, dry-run contract, and failure/collision semantics.
  - Implement the decided surface or explicitly reject it.
  - This row blocks final Objective closure but does not block landing the migration and cmux deletion rows.

## Parked

- Herdr event subscriptions, agent waits, declarative layouts, plugins, and raw socket/generated protocol integration remain outside this Objective until a concrete workflow requires them.
- A public generic Herdr workspace-summary command remains parked pending a separate concrete consumer and installed runtime support.
