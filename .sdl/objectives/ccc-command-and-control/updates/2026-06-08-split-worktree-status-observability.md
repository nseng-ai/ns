# Split Worktree Status Observability From Pi Footer Plumbing

## Summary

Worktree status was split along the CCC boundary while preserving the visible `worktree-status` renderer and footer behavior. CCC now owns the operational status model and presentation in `@asdl/ccc/worktree-status`, including Branch Memory scope summaries, Graphite metadata down/up facts, branch-local commit and dirty markers, Graphite metadata diagnostics, status formatting, and PR hyperlink rendering.

The Graphite metadata lookup and worker moved under `@asdl/ccc/worktree-status/graphite-metadata`. The Branch Memory command candidate/run helper moved to the neutral `@asdl/pi-extension-runtime/brmem-cli` so CCC can load Branch Memory status without importing `@asdl/pi-extensions` internals. `@asdl/pi-extensions` keeps the automatic Pi adapter: renderer registration, session/tool/shutdown lifecycle, active-session cancellation, Git/Branch Memory/worktree watchers, custom footer installation, and generic cwd/session/model/context/token/cost footer rendering.

## Objective Impact

This completes the worktree-status roadmap row. The architecture now reflects the intended split: CCC owns repo-opinionated observability facts and presentation, pi-extensions owns reusable Pi footer/session lifecycle plumbing, and pi-extension-runtime owns neutral helper contracts needed by both.

Validation evidence: `bun test --cwd ts/packages/pi-extension-runtime --sequential`, `bun test --cwd ts/packages/ccc --sequential`, `bun test --cwd ts/packages/pi-extensions --sequential`, `bun run --cwd ts check`, `bun run --cwd ts test`, `just dprint-check`, and `git diff --check` passed. Import-direction checks found no CCC imports of `@asdl/pi-extensions` internals and no lower-package imports of `@asdl/ccc`; the remaining pi-extension worktree-status import from CCC is the intended adapter-to-observability edge. The local branch has uncommitted implementation and Objective/context documentation changes; there are no committed branch-only changes yet beyond the Graphite parent.

## Follow-Ups

- Keep `/code:submit` below CCC unless a future cross-capability workflow needs deeper orchestration than a direct `asdl-dev submit` mirror.
- Leave Objective closure for explicit user inspection/request per this Objective's completion criteria.
