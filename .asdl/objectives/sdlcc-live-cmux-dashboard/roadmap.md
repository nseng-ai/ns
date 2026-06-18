# Roadmap

## Work

- [x] Prove current-window cmux inventory, branch/slot matching from existing stack-map data, conservative status buckets, details pane, polling/manual refresh, and focus-to-selected-surface behavior. Note: the prototype-first sequencing was collapsed — these behaviors were proven directly in the shipped app shell rather than in a separate discardable command, so no throwaway prototype artifact exists. Evidence: `dashboard-model.ts`, `dashboard.ts`, `app-renderer.ts`, `dashboard-model-loader.ts` on branch `sdlcc-dashboard-first-app-shell`.
- [x] Record which data model, rendering shape, and activation behavior should survive. Note: captured in the landed-state Semantic Update for this Objective in lieu of a separate prototype debrief.
- [x] Refactor `sdlcc` into a shared app shell with dashboard and stack-map modes. Evidence: `app-renderer.ts` runs both modes from one `StyledText` frame, one `interpretAppKey` map, and shared model loading/activation; `Tab`/`Shift+Tab` and `1`/`2` switch modes.
- [x] Implement the real live cmux dashboard as the no-args `sdlcc` default while preserving direct stack-map access. Evidence: `cli.ts` opens the dashboard on no args and keeps `sdlcc stack-map` as a direct command; in-app `Stack Map` mode remains reachable.
- [~] Update `sdlcc` docs/help to describe dashboard-first launch, pinned-first-workspace convention, current-window scope, focus behavior, refresh behavior, and stack-map access. Done: launch, tabs/keys, current-window scope, refresh, focus, and stack-map access are in `README.md`. Remaining: README still calls the feature a "prototype" and does not document the pinned-first-workspace convention.
- [ ] Wire the dashboard's ambiguous-focus chooser into the app shell. The chooser is modeled in the dashboard reducer (`show-chooser`/`move-chooser` and a `chooser` mode), but `app-renderer.ts` does not dispatch or render it — ambiguous Enter currently only sets a status message. Required by the Enter-chooser completion criterion.
- [ ] Review and reconcile deferred future-work notes after v1 lands. Pending: blocked on the chooser wiring and docs gaps above before v1 is complete.

## Parked

- [ ] Revisit future dashboard deepening ideas in `future-work.md` after v1 proves the live cmux dashboard.
