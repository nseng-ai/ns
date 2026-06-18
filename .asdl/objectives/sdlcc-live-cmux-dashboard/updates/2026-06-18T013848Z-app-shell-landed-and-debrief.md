# Dashboard app shell landed; prototype-first sequencing collapsed

## Summary

Branch `sdlcc-dashboard-first-app-shell` (Graphite parent `sdlcc-live-cmux-dashboard`) lands the real `sdlcc` app shell end to end, plus a look-and-feel pass. Treated as landed-state on the default branch:

- No-args `sdlcc` opens a dashboard-first OpenTUI app shell; `sdlcc stack-map` remains a direct command and `Stack Map` remains an in-app mode (`Tab`/`Shift+Tab`, `1`/`2`).
- The dashboard model (`dashboard-model.ts`, `dashboard-model-loader.ts`) builds current-window workspace rows from `cmux tree --json`, reusing the stack-map model for per-workspace branch evidence rather than a parallel interpretation.
- Rows summarize cmux identity, `here`/`active`/`selected` markers, surface kind/count, branch evidence when strongly known, and conservative structural buckets. A details pane lists surfaces, refs, branch/worktree evidence, and diagnostics, with no transcript preview.
- Refresh combines 3-second polling with manual `r`, preserving the selected workspace by ref across updates.
- Enter focuses the single safe surface via `cmux rpc surface.focus`.
- The look-and-feel pass (`frame-style.ts` + restyled `dashboard.ts`/`app-renderer.ts`) moves the frame from one monochrome string to colored `StyledText`: a selection highlight bar, color-coded status badges, bold section accents, dimmed secondary text, and an accented tab bar/border. `tsc` and the full TS Vitest suite pass.

## Objective Impact

The prototype-first path in the Thesis was intentionally collapsed: rather than a separate discardable prototype plus a debrief, the team built the real app shell directly. The roadmap's prove-behaviors and debrief rows are marked done with that deviation noted; this update is the surviving debrief record. The data model (workspace-primary rows seeded from stack-map data), rendering shape (single shared `StyledText` frame across modes), and activation behavior (Enter → `surface.focus`, mode switch keys, polling + `r`) are the shapes that should survive.

Two completion criteria are not yet met, so v1 stays open:

- The ambiguous-focus chooser is modeled in the dashboard reducer but not surfaced by the app shell — ambiguous Enter only shows a status message.
- Docs are largely in place but still call the feature a "prototype" and omit the pinned-first-workspace convention.

Assumptions/risks were updated accordingly: the shared-app-shell-scope-creep risk is largely de-risked; the throwaway-prototype assumption was bypassed; the focus-routing/chooser risk is partially materialized and carried as a follow-up.

## Follow-Ups

- Wire the modeled chooser (`show-chooser`/`move-chooser`/`chooser` mode) into `app-renderer.ts` so ambiguous Enter opens an interactive chooser instead of a status message.
- Update `README.md`: drop the stale "prototype" framing and document the pinned-first-workspace convention.
- After those land, reconcile the deferred future-work notes and re-evaluate the Closure Gate.
