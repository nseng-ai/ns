# Retire cmux and Establish the Resource-First Herdr Catalog

## Thesis

The dedicated cmux capability is redundant with Herdr and has been removed. Herdr's public Pi catalog should now use a resource-first grammar in which the third segment always identifies the destination resource (`space` or `tab`), while only the tab workflow that creates and verifies a durable Handoff Artifact uses the `handoff` action name.

This Objective tracks the completed cmux removal and the superseding hard migration from the interim generic workflow-family namespaces to the exact resource-first catalog, including explicit tab resource operations and refreshed-trunk Saved Plan dispatch.

The reviewed current implementation plan is saved in the local plan store at:

`$XDG_STATE_HOME/ns/enriched-plan/gh--nseng-ai--ns/master/resource-first-herdr-command-catalog.md`

The earlier migration plan is committed with this record at
`references/retire-cmux-herdr-handoff-commands.md` (copied 2026-07-20 from the
machine-local plan store at `$XDG_STATE_HOME/ns/enriched-plan/gh--nseng-ai--ns/remove-cmux-extension/`,
which remains usable for branch-context workflows on the originating machine but is
not durable or shared).

## Scope

- Register exactly these public Pi commands, with no compatibility aliases:
  - `/ns:herdr:space:{new,goal,objective-summary}`
  - `/ns:herdr:space:{dispatch-prompt,dispatch-trunk-prompt,dispatch-plan,dispatch-trunk-plan}`
  - `/ns:herdr:tab:{new,goal,dispatch-plan,handoff}`
- Preserve the behavior of renamed commands, including label-only Objective summary behavior and the hidden portable `ns herdr exec handoff-tab launch` mechanism.
- Add explicit tab creation and goal labeling, targeted only through trimmed `HERDR_WORKSPACE_ID` and `HERDR_TAB_ID` caller identity respectively.
- Deliver refreshed-trunk Saved Plan dispatch by deepening the shared Graphite trunk-preparation and Branch Context explicit-parent/start-point seams rather than duplicating their policy in Herdr.
- Preserve Branch Context's bounded deterministic collision selection and immediate race revalidation.
- Keep cmux and standalone Herdr open-branch implementation removed while retaining shared Herdr workspace/tab launch mechanics used by dispatch flows.
- Reconcile live Herdr, Handoff, Pi, and repository domain documentation while preserving accurate historical ADRs, closed Objective records, retrospectives, reshape specifications, and immutable Semantic Updates.
- Keep gated `docs-site/` content unchanged and record its stale catalog entry as a follow-up.

`handoff` is now an action only on `/ns:herdr:tab:handoff`, where the workflow really creates and verifies a durable Handoff Artifact before destination launch. Prompt and plan dispatch do not imply Handoff Artifact creation.

## Non-Goals

- Adding a tab prompt-dispatch variant.
- Changing prompt payloads, latest-session Saved Plan selection, Attached Plan implementation semantics, or existing space/tab destinations except where refreshed-trunk plan dispatch explicitly requires new parentage.
- Expanding Objective summary beyond its existing label-only behavior.
- Introducing a generic terminal-multiplexer abstraction or lowest-common-denominator cmux/Herdr interface.
- Adding a generic Herdr workspace-summary CLI, raw socket integration, event subscriptions, layouts, or plugin behavior.
- Adding compatibility aliases for deleted or renamed commands; ns is private and unreleased.
- Rewriting historical records as though cmux or superseded command names never existed.
- Editing gated `docs-site/` content without separate explicit authorization.

## Completion Criteria

- The exact eleven-command resource-first catalog is registered with base-versus-optional membership preserved, and every interim alias is absent from live surfaces.
- `tab:new` requires explicit caller workspace identity before model work or mutation, creates a focused tab at the command cwd, and uses the existing semantic label policy when a description is supplied.
- `tab:goal` requires explicit caller tab identity, shares the existing goal slug and slot-prefix policy, and renames that exact tab without UI-focus fallback.
- `space:trunk-plan` selects the latest current-session Saved Plan, truthfully supports help and non-mutating dry-run, refreshes Graphite trunk through shared policy, creates and tracks from the exact refreshed trunk with Branch Context's canonical collision policy, attaches the plan, checks out through Slots, and launches Attached Plan implementation in a new Herdr space.
- `/ns:herdr:space:open-branch`, `@nseng-ai/cmux`, `.pi/extensions/cmux.ts`, `ns cmux exec`, and old cmux Pi surfaces remain absent from live implementation and configuration.
- Workspace dependencies, generated lockfile, publish inventories, style guards, runtime import checks, package counts, contexts, and live user documentation match the resulting topology; gated `docs-site/` drift is explicitly classified.
- Remaining old Herdr and cmux strings occur only in accurate historical evidence or the explicitly gated docs-site follow-up.
- Relevant focused tests, Objective structural checks subject to the immutable legacy-update caveat, and the repository `just` entrypoint pass.

## Assumptions and Risks

**Assumptions**

- The installed Herdr CLI supports explicit-workspace focused tab creation, `herdr tab rename <tab-id> <label>`, and pane command launch; implementation must revalidate installed help because Herdr is moving quickly.
- Herdr-managed panes inject both `HERDR_WORKSPACE_ID` and `HERDR_TAB_ID`.
- Existing prompt and plan dispatch core logic can be renamed at command interfaces without semantic changes.
- Branch Context remains the owning policy boundary for deterministic collision selection and race revalidation.

**Risks**

- Copying prompt-specific trunk refresh or Branch Context collision logic into Herdr would create divergent policy; implementation must deepen the owning APIs instead.
- A Graphite parent/start-point mismatch could track a branch under trunk while leaving its tip based on current `HEAD`; tests and evidence must prove both facts derive from the refreshed trunk.
- A dry-run that refreshes trunk would violate its non-mutation promise; trunk preparation needs a truthful preview mode if the existing helper cannot inspect safely.
- Ambient caller identity could mutate the wrong tab or workspace; new tab operations must reject absent or blank explicit IDs before model or destination work.
- Broad command-name and documentation edits can leave stale prompt copy, parity metadata, tests, or generated inventories. The migration requires an exact final inventory and semantic stale-reference review.
- Historical documents legitimately contain removed names, so a repository-wide zero-match requirement would destroy useful evidence. Review must distinguish historical and live surfaces.
- The immutable legacy update `20260719T181812Z-reference-based-herdr-handoff-launch.md` may remain structurally incompatible with the current Objective checker; report that compatibility blocker rather than rewriting the update.

## Open Questions

No product-contract questions remain open. Implementation selected an additive explicit-start-point Git Gateway operation and colocated strict caller workspace/tab identity helpers at the existing Herdr targeting seam.

All substantive implementation, catalog, documentation, and validation criteria are complete. Objective closure remains blocked by the immutable legacy Semantic Update `20260719T181812Z-reference-based-herdr-handoff-launch.md`, which lacks three headings required by the current per-record checker. Historical updates must not be rewritten, so `closed.md` remains absent pending an authorized compatibility mechanism; the repository `just` Objective edge sweep is otherwise green.
