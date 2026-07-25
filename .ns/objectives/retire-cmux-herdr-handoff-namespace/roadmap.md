# Roadmap

## Work

- [x] Collapse branch-basis launch commands behind contextual selection
  - Replace the five public `br`/`tr` launch commands with prompt-to-space, plan-to-space, and plan-to-tab commands and no compatibility aliases.
  - Select current branch or existing local trunk through one fake-driven policy covering named trunk, named feature branches, detached HEAD, lookup failure, cancellation, and unavailable interaction.
  - Preserve shared local Graphite trunk resolution, Branch Context ownership, tab caller preflight, prompt payload semantics, plan dry-run behavior, immediate acknowledgement, and non-mutation ordering without fetching or refreshing trunk.
  - Evidence: the exact catalog tests prove eight base commands, nine with optional Handoff, and absence of all five old registrations; fake-driven resolver and launch scenarios cover all basis outcomes, both plan destinations, tab preflight, current-branch revalidation, exact local-trunk SHA execution, no-fetch dry runs, prompt free-form content, and acknowledgement ordering. The focused package checks, TypeScript default/integration/style-guard lanes, dprint, and repository `just` pass. The Objective checker retains only its known immutable legacy-update compatibility failure.

- [x] Remove standalone Herdr open-branch and the cmux capability
  - Delete the dedicated Herdr open-branch command modules and tests while retaining launch helpers consumed by launch workflows.
  - Delete `@nseng-ai/cmux`, `.pi/extensions/cmux.ts`, `ns cmux exec`, and all cmux workspace/surface/sidebar registrations, tests, and package wiring.
  - Regenerate the pnpm lockfile and prune Capability Kit cmux exports only after a clean surviving-consumer audit.
  - Evidence: the `cmux-and-open-branch-removal-complete` Semantic Update records the clean consumer audit, package/import inventory, focused tests, and TypeScript validation proving removal without breaking Herdr launch or portable Handoff workflows.

- [x] Replace the superseded workflow-family catalog with the exact compositional catalog
  - Register direct operations under `/ns:herdr:space:{new,goal,objective-summary}` and `/ns:herdr:tab:{new,goal,handoff}`.
  - Register the five supported `/ns:herdr:launch:<plan|prompt>:<br|tr>:<space|tab>` combinations, where `br` means current branch and `tr` means refreshed trunk.
  - Preserve conditional registration of `tab:handoff` through the optional Handoffs integration and keep hidden `ns herdr exec handoff-tab launch` unchanged.
  - Remove all interim workflow-family, compound dispatch, and resource-first dispatch aliases from live registration and exports.
  - Evidence: the canonical catalog and extension tests prove exact ten-command base membership, optional `tab:handoff`, eleven total commands, and explicit absence of old registrations; the prior namespace evidence remains immutable history.

- [x] Add explicit tab resource operations
  - Add caller-tab identity validation and a domain-shaped `renameTab` Herdr Consumer Gateway operation.
  - Implement `tab:new` with explicit caller workspace preflight, current cwd, focused creation, and optional model-derived semantic label.
  - Implement `tab:goal` with explicit caller tab preflight, shared goal slug and slot-prefix policy, interactive fallback, and exact-tab rename.
  - Evidence: focused fake-driven scenarios cover blank and explicit identities, labeled and unlabeled creation, interactive goal input, model failures before mutation, gateway failures, slot prefixes, exact-tab rename, and bounded CLI diagnostics.

- [x] Deliver refreshed-trunk Saved Plan dispatch
  - Extract a neutral shared Graphite trunk preparation/preview operation while preserving prompt dispatch behavior.
  - Extend Branch Context creation with a coherent explicit start-point and Graphite-parent pair while retaining current-HEAD defaults and canonical collision/race policy.
  - Compose `launch:plan:tr:space` from latest-session plan selection, refreshed trunk preparation, Branch Context attachment, Slots checkout, and Attached Plan launch in a new Herdr space.
  - Evidence: focused tests prove non-mutating refresh preview, exact refreshed-SHA branch creation, explicit Graphite parent, current-HEAD defaults, collision suffixing and race revalidation, latest-session selection, preparation failures, partial-failure diagnostics, downstream launch failures, and dry-run non-mutation.

- [x] Reconcile live topology and documentation
  - Update Herdr, Handoffs, Pi, root contexts, `CONTEXT-MAP.md`, Pi docs, parity/current catalog guidance, package counts, release inventories, and current help surfaces.
  - Delete dedicated live cmux docs that no longer describe a supported feature; preserve accurate historical ADRs, closed Objectives, retrospectives, reshape specifications, and Semantic Updates.
  - Record the stale `docs-site/` catalog entry as a gated follow-up rather than editing that surface without authorization.
  - Evidence: bounded stale-reference classification leaves only history, migration wording, Avoid vocabulary, durable storage compatibility, and the gated docs-site entry; focused suites, integration/isolated lanes, TypeScript style guard, and full `just` pass.

## Parked

- Herdr event subscriptions, agent waits, declarative layouts, plugins, and raw socket/generated protocol integration remain outside this Objective until a concrete workflow requires them.
- A public generic Herdr workspace-summary command remains parked pending a separate concrete consumer and installed runtime support.
- Tab prompt launch remains outside this Objective.
