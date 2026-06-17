# Future Work

## Deferred from v1

- Objective association: show objective slug, title, or status once there is a reliable low-coupling source and the dashboard can do so without becoming an Objective scheduler.
- PR/check status: show PR and check health only after the dashboard's core cmux inventory and focus routing are stable, and after GitHub/Graphite coupling is intentionally designed.
- Transcript or recent-output preview: add only if cmux exposes reliable terminal text or an explicit agent-session summary channel; do not scrape heuristically in v1.
- cmux layout mutation: create, focus, reorder, or pin a dashboard workspace later only after cmux command support and ownership boundaries are revalidated.
- All-windows toggle: current-window-only is v1; all-windows can be reconsidered after same-window dashboard utility is proven.

## Revisit Criteria

Revisit these ideas after the v1 live cmux dashboard proves that current-window inventory, conservative attention, details, refresh, and focus routing are useful in daily use. Each deferred item should be designed as an intentional extension with clear ownership boundaries, not slipped into the v1 dashboard as incidental scope.
