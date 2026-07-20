# Roadmap

## Work

- [x] Remove standalone Herdr open-branch and the cmux capability
  - Delete the dedicated Herdr open-branch command modules and tests while retaining launch helpers consumed by dispatch.
  - Delete `@nseng-ai/cmux`, `.pi/extensions/cmux.ts`, `ns cmux exec`, and all cmux workspace/surface/sidebar registrations, tests, and package wiring.
  - Regenerate the pnpm lockfile and prune Capability Kit cmux exports only after a clean surviving-consumer audit.
  - Evidence: the `cmux-and-open-branch-removal-complete` Semantic Update records the clean consumer audit, package/import inventory, focused tests, and TypeScript validation proving removal without breaking Herdr dispatch or portable Handoff workflows.

- [x] Replace the superseded workflow-family catalog with the exact resource-first catalog
  - Register `/ns:herdr:space:{new,goal,objective-summary,dispatch-prompt,dispatch-trunk-prompt,dispatch-plan,dispatch-trunk-plan}` and `/ns:herdr:tab:{new,goal,dispatch-plan,handoff}`.
  - Preserve conditional registration of `tab:handoff` through the optional Handoffs integration and keep hidden `ns herdr exec handoff-tab launch` unchanged.
  - Remove all interim `/ns:herdr:handoff:*`, `/ns:herdr:tab:plan-dispatch`, and `/ns:herdr:objective:sidebar-summary` aliases from live registration and exports.
  - Evidence: the canonical catalog and extension tests prove exact ten-command base membership, optional `tab:handoff`, eleven total commands, and explicit absence of old registrations; the prior namespace evidence remains immutable history.

- [x] Add explicit tab resource operations
  - Add caller-tab identity validation and a domain-shaped `renameTab` Herdr Consumer Gateway operation.
  - Implement `tab:new` with explicit caller workspace preflight, current cwd, focused creation, and optional model-derived semantic label.
  - Implement `tab:goal` with explicit caller tab preflight, shared goal slug and slot-prefix policy, interactive fallback, and exact-tab rename.
  - Evidence: focused fake-driven scenarios cover blank and explicit identities, labeled and unlabeled creation, interactive goal input, model failures before mutation, gateway failures, slot prefixes, exact-tab rename, and bounded CLI diagnostics.

- [x] Deliver refreshed-trunk Saved Plan dispatch
  - Extract a neutral shared Graphite trunk preparation/preview operation while preserving prompt dispatch behavior.
  - Extend Branch Context creation with a coherent explicit start-point and Graphite-parent pair while retaining current-HEAD defaults and canonical collision/race policy.
  - Compose `space:dispatch-trunk-plan` from latest-session plan selection, refreshed trunk preparation, Branch Context attachment, Slots checkout, and Attached Plan launch in a new Herdr space.
  - Evidence: focused tests prove non-mutating refresh preview, exact refreshed-SHA branch creation, explicit Graphite parent, current-HEAD defaults, collision suffixing and race revalidation, latest-session selection, preparation failures, partial-failure diagnostics, downstream launch failures, and dry-run non-mutation.

- [x] Reconcile live topology and documentation
  - Update Herdr, Handoffs, Pi, root contexts, `CONTEXT-MAP.md`, Pi docs, parity/current catalog guidance, package counts, release inventories, and current help surfaces.
  - Delete dedicated live cmux docs that no longer describe a supported feature; preserve accurate historical ADRs, closed Objectives, retrospectives, reshape specifications, and Semantic Updates.
  - Record the stale `docs-site/` catalog entry as a gated follow-up rather than editing that surface without authorization.
  - Evidence: bounded stale-reference classification leaves only history, migration wording, Avoid vocabulary, durable storage compatibility, and the gated docs-site entry; focused suites, integration/isolated lanes, TypeScript style guard, and full `just` pass.

## Parked

- Herdr event subscriptions, agent waits, declarative layouts, plugins, and raw socket/generated protocol integration remain outside this Objective until a concrete workflow requires them.
- A public generic Herdr workspace-summary command remains parked pending a separate concrete consumer and installed runtime support.
- Tab prompt dispatch remains outside this Objective.
