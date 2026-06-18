# sdlcc live cmux dashboard

## Thesis

`sdlcc` should become a same-window live cmux dashboard for deciding which cmux workspace to focus next, replacing manual sidebar cycling with a purpose-built view of open workspaces, surfaces, runtime state, and conservative attention cues.

This Objective tracks a prototype-first path. First, build an end-to-end discardable dashboard prototype in a separate temporary command or screen so the interaction can be proven without destabilizing the existing stack map. Then, after a debrief, build the real `sdlcc` app shell so the dashboard is the no-args default while the existing stack map remains directly reachable.

## Scope

V1 is a live dashboard for the current cmux window only. By convention, the eventual no-args `sdlcc` dashboard should live as the first or pinned workspace in the same cmux window, but v1 should not mutate cmux layout to create, reorder, or pin that workspace.

The primary model is one row or card per cmux workspace, summarizing the workspace's surfaces/tabs rather than making each surface the main row. Each row should show cmux identity, active/selected/here markers, surface kind/count, branch/worktree/slot when strongly known, and conservative status or attention buckets. The dashboard may claim a workspace needs input only when there is explicit evidence; ambiguous signals should stay diagnostic rather than urgent.

Selected workspace details should include a lightweight details pane with surfaces, refs, branch/worktree evidence, and diagnostics. Transcript preview is out of v1.

Focus behavior is part of the core loop: pressing Enter should focus the selected workspace's selected or active surface. If the target surface is ambiguous or unavailable, `sdlcc` should show a chooser instead of guessing. Refresh should combine automatic polling every few seconds with manual `r`, preserving the selected workspace by workspace ref as rows update.

The prototype and real implementation are separate phases:

- The prototype should be an end-to-end throwaway command or screen that proves current-window workspace inventory, branch/slot matching from existing stack-map data, conservative status buckets, the details pane, polling refresh, and focus-to-selected-surface behavior.
- The real implementation should deliberately refactor shared app infrastructure so dashboard and stack map become modes in one `sdlcc` app shell, sharing rendering, key handling, model loading, and activation patterns where useful.

Branch and slot matching should reuse or rebaseline the existing stack-map data paths where possible, rather than inventing a parallel interpretation of branch/worktree/cmux evidence. The existing stack map must remain reachable through both an in-app mode switch key and a direct command such as `sdlcc stack-map`.

## Non-Goals

V1 is not a global scheduler or Objective cockpit. It should not show all cmux windows by default, should not make cmux layout mutations, and should not turn surface/tab rows into the primary model.

The following are deliberately deferred from v1: Objective association, PR/check status, transcript or recent-output scraping, and cmux layout mutation. The stack-map functionality should not be deleted or hidden behind the dashboard; it remains a first-class mode and direct command path.

## Completion Criteria

The Objective can close when future code work demonstrates all of the following:

- A discardable end-to-end prototype was completed and debriefed, with the debrief recording which data model, rendering shape, and activation behavior should survive.
- No-args `sdlcc` opens the real live cmux dashboard by default.
- The existing stack map remains reachable by a direct command such as `sdlcc stack-map` and by an in-app mode switch key.
- The dashboard presents current-window cmux workspaces as primary rows/cards with summarized surfaces/tabs.
- Rows include cmux identity, active/selected/here markers, surface kind/count, branch/worktree/slot when strongly known, and conservative status/attention buckets.
- Branch/slot matching reuses or intentionally rebaselines existing stack-map data paths rather than duplicating inconsistent logic.
- The selected workspace details pane shows surfaces, refs, branch/worktree evidence, and diagnostics without transcript preview in v1.
- Automatic polling and manual `r` refresh work, while selection is preserved by workspace ref across row updates.
- Enter focuses the selected/active surface for the selected workspace, and ambiguous or unavailable focus targets show a chooser.
- Docs/help describe dashboard-first launch, the pinned-first-workspace convention, current-window scope, focus behavior, refresh behavior, and stack-map access.
- Deferred work remains captured outside v1, including Objective association, PR/check status, transcript/recent-output scraping, cmux layout mutation, and an all-windows toggle.

## Assumptions and Risks

Assumptions:

- Existing stack-map cmux parsing and branch/slot matching are reusable enough to seed the dashboard model or provide a trustworthy baseline for a rebaseline. Confirmed: the dashboard model loader reuses the stack-map model for per-workspace branch evidence, and `sdlcc stack-map` shares the stack-map data paths.
- cmux exposes enough current-window and focus data to identify workspaces, selected/active surfaces, and focus targets without heuristic scraping. Holding: the model loads `cmux tree --json` and focuses via `cmux rpc surface.focus`; no transcript/heuristic scraping was needed.
- A discardable prototype can remain throwaway and will not prematurely harden around the wrong app-shell shape. Bypassed: implementation built the real app shell directly without a separate throwaway prototype/debrief phase, so this assumption was not exercised as planned (see roadmap notes and the landed-state update).
- The dashboard can be useful with conservative attention buckets even when it under-detects some intervention needs. Still active: only structural buckets (`here`, `active`, `selected`, `multi-surface`, `unmatched-branch`, `idle/open`) are emitted; richer attention detection remains future work.

Risks:

- Refactoring `sdlcc` into a shared app shell may grow beyond a simple mode split if rendering, key handling, activation, or model refresh assumptions are too stack-map-specific. Largely de-risked: dashboard and stack map ship as two modes in one shell sharing a single `StyledText` frame, one `interpretAppKey` map, shared model loading, and a shared activation path.
- Conservative attention may under-detect workspaces that need intervention, reducing dashboard usefulness until richer evidence sources are designed. Still open and accepted for v1.
- Current-window-only scope may need a later all-windows toggle once same-window utility is proven. Still open; tracked as deferred future work.
- Focus routing could expose ambiguous cmux states; the chooser path needs to be clear enough that ambiguity does not feel like a broken Enter key. Partially materialized: a chooser is modeled in the dashboard reducer, but the app shell does not yet surface it — ambiguous Enter currently shows a status message instead of an interactive chooser. Carried as a remaining v1 risk and roadmap follow-up.

## Open Questions

- ~~What exact temporary command or screen name should host the discardable prototype?~~ Resolved/mooted: no separate prototype command was hosted; the dashboard was built directly as the no-args `sdlcc` app shell.
- ~~What final key should switch between dashboard and stack-map modes in the shared app shell?~~ Resolved: `Tab`/`Shift+Tab` switch modes, with `1`/`2` jumping directly to Dashboard/Stack Map.
- ~~What polling interval best balances freshness with UI stability and command overhead?~~ Resolved for v1: automatic polling every 3 seconds plus manual `r`.
- If future layout mutation becomes desirable, should it belong in `sdlcc`, CCC, or a separate launcher? Still open; deferred with the other layout-mutation future work.
