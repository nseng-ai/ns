# Retire cmux and Establish the Compositional Herdr Catalog

## Thesis

The dedicated cmux capability is redundant with Herdr and has been removed. Herdr's public Pi catalog should use direct resource operations for `space` and `tab`, plus destination/payload launch commands that choose current branch or existing local trunk contextually at invocation time.

This Objective tracks the completed cmux removal, the earlier hard migration from interim workflow-family and compound dispatch names, and the superseding collapse of branch-basis-specific launch commands into one uniform contextual-selection policy across prompt-to-space, plan-to-space, and plan-to-tab.

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
  - `/ns:herdr:tab:{new,goal,handoff}`
  - `/ns:herdr:launch:prompt:space`, `/ns:herdr:launch:plan:space`, and `/ns:herdr:launch:plan:tab`.
- Select current branch or existing local trunk at invocation time through one policy: `main`/`master` select local trunk automatically; other named branches offer current branch or local trunk; detached HEAD and lookup failure offer confirmed local-trunk fallback; required interaction without UI fails before mutation.
- Never fetch or refresh trunk in Herdr launch workflows; callers update local trunk separately before launch when desired.
- Preserve caller workspace preflight before Git inspection or interaction for plan-to-tab, and preserve contextual selection in plan dry runs.
- Preserve the behavior of renamed commands, including label-only Objective summary behavior and the hidden portable `ns herdr exec handoff-tab launch` mechanism.
- Add explicit tab creation and goal labeling, targeted only through trimmed `HERDR_WORKSPACE_ID` and `HERDR_TAB_ID` caller identity respectively.
- Deliver local-trunk Saved Plan launch by resolving the configured Graphite trunk and exact existing local SHA, then using Branch Context's explicit-parent/start-point seams without duplicating their policy in Herdr.
- Preserve Branch Context's bounded deterministic collision selection and immediate race revalidation.
- Keep cmux and standalone Herdr open-branch implementation removed while retaining shared Herdr workspace/tab launch mechanics used by launch flows.
- Reconcile live Herdr, Handoff, Pi, and repository domain documentation while preserving accurate historical ADRs, closed Objective records, retrospectives, reshape specifications, and immutable Semantic Updates.
- Keep gated `docs-site/` content unchanged and record its stale catalog entry as a follow-up.

`handoff` is now an action only on `/ns:herdr:tab:handoff`, where the workflow really creates and verifies a durable Handoff Artifact before destination launch. Prompt and plan launch do not imply Handoff Artifact creation.

## Non-Goals

- Adding a tab prompt-launch variant.
- Adding `--from` or another public branch-basis override, parsing prompt text as flags, or retaining visible or hidden aliases for the five removed `br`/`tr` commands.
- Changing prompt payloads, latest-session Saved Plan selection, Attached Plan implementation semantics, or existing space/tab destinations except where local-trunk plan launch explicitly requires new parentage.
- Expanding Objective summary beyond its existing label-only behavior.
- Introducing a generic terminal-multiplexer abstraction or lowest-common-denominator cmux/Herdr interface.
- Adding a generic Herdr workspace-summary CLI, raw socket integration, event subscriptions, layouts, or plugin behavior.
- Adding compatibility aliases for deleted or renamed commands; ns is private and unreleased.
- Rewriting historical records as though cmux or superseded command names never existed.
- Editing gated `docs-site/` content without separate explicit authorization.

## Completion Criteria

- The exact nine-command Herdr catalog is registered with eight base commands plus optional `/ns:herdr:tab:handoff`; the only launch names are `/ns:herdr:launch:prompt:space`, `/ns:herdr:launch:plan:space`, and `/ns:herdr:launch:plan:tab`; all five former `br`/`tr` launch names and every interim alias are absent from live surfaces.
- All three launch commands share the contextual branch-basis policy, cancellation and unavailable-interaction paths mutate nothing, and named `main`/`master` use the exact existing local configured Graphite trunk without fetching or refreshing it.
- Plan-to-tab supports both current and local-trunk basis while validating and capturing `HERDR_WORKSPACE_ID` before Git inspection or interaction; plan dry-run remains non-mutating.
- `tab:new` requires explicit caller workspace identity before model work or mutation, creates a focused tab at the command cwd, and uses the existing semantic label policy when a description is supplied.
- `tab:goal` requires explicit caller tab identity, shares the existing goal slug and slot-prefix policy, and renames that exact tab without UI-focus fallback.
- A local-trunk selection for `launch:plan:space` or `launch:plan:tab` selects the latest current-session Saved Plan, truthfully supports help and non-mutating dry-run, resolves the exact existing local trunk SHA without upstream inspection or refresh, creates and tracks from that SHA with Branch Context's canonical collision policy, attaches the plan, checks out through Slots, and launches Attached Plan implementation in the selected Herdr destination.
- `/ns:herdr:space:open-branch`, `@nseng-ai/cmux`, `.pi/extensions/cmux.ts`, `ns cmux exec`, and old cmux Pi surfaces remain absent from live implementation and configuration.
- Workspace dependencies, generated lockfile, publish inventories, style guards, runtime import checks, package counts, contexts, and live user documentation match the resulting topology; gated `docs-site/` drift is explicitly classified.
- Remaining old Herdr and cmux strings occur only in accurate historical evidence or the explicitly gated docs-site follow-up.
- Relevant focused tests, Objective structural checks subject to the immutable legacy-update caveat, and the repository `just` entrypoint pass.

## Assumptions and Risks

**Assumptions**

- The installed Herdr CLI supports explicit-workspace focused tab creation, `herdr tab rename <tab-id> <label>`, and pane command launch; implementation must revalidate installed help because Herdr is moving quickly.
- Herdr-managed panes inject both `HERDR_WORKSPACE_ID` and `HERDR_TAB_ID`.
- Existing prompt and plan launch core logic can be composed behind shared contextual branch-basis selection without duplicating local Graphite trunk resolution, Branch Context, or prepared destination policy.
- Branch Context remains the owning policy boundary for deterministic collision selection and race revalidation.

**Risks**

- Copying prompt-specific local-trunk resolution or Branch Context collision logic into Herdr would create divergent policy; implementation must deepen the owning APIs instead.
- A Graphite parent/start-point mismatch could track a branch under trunk while leaving its tip based on current `HEAD`; tests and evidence must prove both facts derive from the exact existing local trunk SHA.
- Fetching or refreshing trunk inside Herdr would violate the composability decision; tests must prove local-trunk execution and dry-run perform neither operation.
- Ambient caller identity could mutate the wrong tab or workspace; new tab operations must reject absent or blank explicit IDs before model or destination work.
- Broad command-name and documentation edits can leave stale prompt copy, parity metadata, tests, or generated inventories. The migration requires an exact final inventory and semantic stale-reference review.
- Historical documents legitimately contain removed names, so a repository-wide zero-match requirement would destroy useful evidence. Review must distinguish historical and live surfaces.
- The immutable legacy update `20260719T181812Z-reference-based-herdr-handoff-launch.md` may remain structurally incompatible with the current Objective checker; report that compatibility blocker rather than rewriting the update.

## Open Questions

No product-contract questions remain open. Implementation selected an additive explicit-start-point Git Gateway operation and colocated strict caller workspace/tab identity helpers at the existing Herdr targeting seam.

All substantive implementation, catalog, documentation, and validation criteria are complete. Objective closure remains blocked by the immutable legacy Semantic Update `20260719T181812Z-reference-based-herdr-handoff-launch.md`, which lacks three headings required by the current per-record checker. Historical updates must not be rewritten, so `closed.md` remains absent pending an authorized compatibility mechanism; the repository `just` Objective edge sweep is otherwise green.
