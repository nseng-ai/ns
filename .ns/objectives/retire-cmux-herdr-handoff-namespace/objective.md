# Retire cmux and Establish the Herdr Handoff Namespace

## Thesis

The dedicated cmux capability is now redundant with the Herdr capability and should be removed. Existing Herdr dispatch workflows should be reorganized under a coherent `/ns:herdr:handoff:*` mixin namespace without changing their behavior, while the destination-specific cmux handoff-tab workflow should become Herdr-native.

This Objective tracks the migration and deletion as an implementation-ready first phase, then remains open until the reserved `/ns:herdr:handoff:trunk-plan` surface is explicitly designed and delivered or rejected.

The reviewed implementation plan is committed with this record at
`references/retire-cmux-herdr-handoff-commands.md` (copied 2026-07-20 from the
machine-local plan store at `$XDG_STATE_HOME/ns/enriched-plan/gh--nseng-ai--ns/remove-cmux-extension/`,
which remains usable for branch-context workflows on the originating machine but is
not durable or shared).

## Scope

- Reorganize existing behavior under these breaking command renames, with no compatibility aliases:
  - `/ns:herdr:space:prompt-dispatch` → `/ns:herdr:handoff:prompt`
  - `/ns:herdr:space:trunk-prompt-dispatch` → `/ns:herdr:handoff:trunk-prompt`
  - `/ns:herdr:space:plan-dispatch` → `/ns:herdr:handoff:plan`
  - `/ns:herdr:sidebar:objective-summary` → `/ns:herdr:objective:sidebar-summary`
- Allow the third namespace segment to express either a Herdr-native noun or an optional compositional command family; it is not subject to a universal noun constraint. `space` and `tab` organize native Herdr resources, while `handoff` and `objective` identify optional integrated workflow families. `/ns:herdr:space:new` and `/ns:herdr:space:goal` remain unchanged.
- Replace `/ns:cmux:handoff-tab` with `/ns:herdr:handoff:tab`, preserving Handoff Artifact creation and verification while opening the pickup Pi in a focused Herdr tab targeted through `HERDR_WORKSPACE_ID`.
- Remove the standalone `/ns:herdr:space:open-branch` command while retaining shared Herdr workspace/tab launch mechanics used by dispatch flows.
- Delete `@nseng-ai/cmux`, `.pi/extensions/cmux.ts`, `ns cmux exec`, and all `/ns:cmux:{workspace,surface,sidebar}:*` surfaces.
- Remove package, lockfile, release, style-guard, test, context, and live-documentation integration for the deleted capability.
- Prune Capability Kit cmux helpers after confirming that the Herdr handoff-tab replacement and canonical `pi-types` path leave no consumers.
- Reconcile live Herdr, Handoff, Pi, and repository domain documentation while preserving accurate historical ADRs, closed Objective records, retrospectives, and reshape specifications.
- Design and disposition the reserved `/ns:herdr:handoff:trunk-plan` surface after the migration phase.

The `handoff` segment is initially a namespace mixin. Renamed prompt and plan dispatch workflows do not newly create Handoff Artifacts; only the handoff-tab workflow retains that existing durable-artifact behavior.

## Non-Goals

- Changing branch parentage, prompt payloads, Saved Plan selection, Attached Plan semantics, slot checkout, dry-run behavior, or destinations for the renamed prompt and plan workflows.
- Renaming or removing the existing `/ns:herdr:tab:plan-dispatch` workflow as part of the initial migration.
- Implementing or registering `/ns:herdr:handoff:trunk-plan` before its contract is designed.
- Introducing a generic terminal-multiplexer abstraction or lowest-common-denominator cmux/Herdr interface.
- Adding a generic Herdr workspace-summary CLI, raw socket integration, event subscriptions, layouts, or plugin behavior.
- Adding compatibility aliases for deleted or renamed commands; ns is private and unreleased.
- Rewriting historical records as though cmux never existed.
- Editing gated `docs-site/` content without separate explicit authorization.

## Completion Criteria

- `/ns:herdr:handoff:{prompt,trunk-prompt,plan,tab}` and `/ns:herdr:objective:sidebar-summary` are registered with the settled behavior and relevant fake-driven coverage; `/ns:herdr:space:{new,goal}` remain registered unchanged.
- `/ns:herdr:space:open-branch` and its dedicated implementation, registration, completion behavior, and tests are absent; shared launch helpers remain where still consumed.
- `@nseng-ai/cmux`, `.pi/extensions/cmux.ts`, `ns cmux exec`, `/ns:cmux:{workspace,surface,sidebar}:*`, and `/ns:cmux:handoff-tab` are absent from live implementation and configuration.
- The Herdr handoff-tab replacement fails before artifact creation or destination mutation when explicit caller context is unavailable, verifies a saved artifact before launch, opens a focused labeled Herdr tab, and runs the pickup Pi in the returned pane.
- Capability Kit cmux residue is either deleted after a clean consumer audit or retained only with a concrete surviving consumer and recorded justification.
- Workspace dependencies, generated lockfile, publish inventories, style guards, runtime import checks, package counts, contexts, and live user documentation match the resulting topology.
- Remaining old cmux strings are classified as accurate history or an explicitly gated docs-site follow-up rather than stale live guidance.
- Relevant focused tests and the repository `just` entrypoint pass.
- `/ns:herdr:handoff:trunk-plan` is explicitly designed and implemented or explicitly rejected; migration completion alone does not close this Objective.

## Assumptions and Risks

**Assumptions**

- The installed Herdr CLI continues to support explicit caller workspace targeting, focused tab creation, and pane command launch; implementation must revalidate installed help because Herdr is moving quickly.
- `HERDR_WORKSPACE_ID` is available to the replacement handoff-tab workflow when invoked from a Herdr-managed pane.
- `HerdrGateway.createTab` and `runInPane` are sufficient destination operations for the handoff-tab replacement.
- Existing prompt and plan core logic can be renamed at their command interfaces without semantic changes.

**Risks**

- Handoff’s reusable create/verify launch flow is currently private Pi implementation; a careless port could introduce private cross-package imports, duplicate complex prompt logic, or put Herdr operations in the wrong capability. The implementation must establish the smallest intentional seam and construct real Herdr adapters at a composition root.
- The `handoff` mixin may imply durable Handoff Artifact creation where none occurs. Live context and command documentation must state the organizational meaning until a later product decision changes behavior.
- Removing Capability Kit cmux exports too early could break hidden consumers. Consumer inventory and canonical `@nseng-ai/capability-kit/pi-types` migration must precede deletion.
- Broad command-name and documentation edits can leave stale prompt copy, parity metadata, tests, or generated lockfile entries. The migration requires exact final inventories and semantic review, not blind replacement.
- Historical documents legitimately contain removed names, so a repository-wide zero-match requirement would destroy useful evidence. Review must distinguish historical and live surfaces.

## Open Questions

- What exact contract should `/ns:herdr:handoff:trunk-plan` expose: Saved Plan source selection, refreshed-trunk parent semantics, branch-context provenance, destination, dry-run output, and collision/failure behavior?
- After that contract is designed, should the surface be implemented or explicitly rejected? This disposition blocks Objective closure but not landing the migration and cmux deletion phases.
