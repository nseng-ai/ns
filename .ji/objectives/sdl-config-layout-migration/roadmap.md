# Roadmap

## Work

- [x] Land the first XDG storage migration baseline.
      Evidence: commit `8ea1b1064` (`Migrate SDL storage and diagnostics to XDG roots`) moved SDL-owned storage and diagnostics toward XDG roots with legacy read fallback where needed. The associated branch-context plan is `sdl-xdg-storage-root-migration.md` on branch `sdl-xdg-storage-root-migration`.

- [x] Move slot storage to the new location.
      Evidence: user confirmed slot migration has already happened; commit history for `ts/packages/slot/src/context.ts`, `ts/packages/slot/src/repo-context.ts`, and `ts/packages/slot/README.md` includes the XDG storage migration commits. Remaining slot work is verification and cleanup of stale fallback paths or docs, not target-layout selection.

- [x] Inventory active backwards-compatibility codepaths and path references.
      Evidence: update `updates/2026-06-21T025401Z-legacy-layout-inventory.md` classified active implementation fallbacks, tests, docs, skills, and user-facing strings. Delete-now filesystem/config candidates were saved-plan `~/.sdl/enriched-plan`, SDL global `~/.sdl/extensions`, and Branch Memory global `~/.brmem/prompts`; user expansion added `SLOTS_ROOT`, project-local `.brmem/prompts`, and branch-context `plan.md`; canonical `refs/brmem/*` remained out of removal scope.

- [x] Delete repo-owned filesystem/config/storage fallback codepaths once the inventory proves canonical coverage.
      Evidence: update `updates/2026-06-21T034845Z-remove-legacy-layout-compatibility.md` removed saved-plan `~/.sdl/enriched-plan` discovery/collision behavior, SDL global `~/.sdl/extensions` discovery, brmem global `~/.brmem/prompts`, project `.brmem/prompts`, branch-context `plan.md` load/attach support, `SLOTS_ROOT`, and the now-unused `legacyHomePath()` helper. Follow-up update `updates/2026-06-21T084937Z-final-legacy-key-path-hardening.md` fixed the final readiness blockers: stale session evidence can no longer reuse `plan.md`, and legacy `.slots` worktrees are manual conflicts rather than managed slots. Focused package tests and full TS/docs gates passed.

- [x] Resolve Branch Memory git-ref compatibility separately if it is still active.
      Evidence: update `updates/2026-06-21T034845Z-remove-legacy-layout-compatibility.md` records that `refs/brmem/*` is the canonical Branch Memory Snapshot Ref contract, not an active alternate legacy fallback; no git-ref compatibility deletion is part of this Objective slice.

- [x] Refresh active documentation and agent guidance after cleanup.
      Evidence: update `updates/2026-06-21T034845Z-remove-legacy-layout-compatibility.md` lists refreshed docs, READMEs, skills, prompt text, Pi tool descriptions/tests, ADR 0006 current wording, and `ts/packages/pi-extensions/CONTEXT.md`. Legacy path hits now remain only as historical provenance or explicit no-fallback assertions.

## Parked

- Automatic migration or deletion of user data in old local paths.
- Redesigning Pi-owned `~/.pi/agent/...` storage.
- Rewriting historical Objective records or archived branch-context prose to remove old path names.
- Replacing the XDG target with a single `~/.sdl` home-directory root.
