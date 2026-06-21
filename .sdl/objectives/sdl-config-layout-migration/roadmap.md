# Roadmap

## Work

- [x] Land the first XDG storage migration baseline.
      Evidence: commit `8ea1b1064` (`Migrate SDL storage and diagnostics to XDG roots`) moved SDL-owned storage and diagnostics toward XDG roots with legacy read fallback where needed. The associated branch-context plan is `sdl-xdg-storage-root-migration.md` on branch `sdl-xdg-storage-root-migration`.

- [x] Move slot storage to the new location.
      Evidence: user confirmed slot migration has already happened; commit history for `ts/packages/slot/src/context.ts`, `ts/packages/slot/src/repo-context.ts`, and `ts/packages/slot/README.md` includes the XDG storage migration commits. Remaining slot work is verification and cleanup of stale fallback paths or docs, not target-layout selection.

- [ ] Inventory active backwards-compatibility codepaths and path references.
      Build a current, reviewed inventory of implementation fallbacks, tests, docs, skills, and user-facing strings for legacy SDL-owned layout paths. Classify each hit as delete-now, retain-with-rationale, Pi-owned/external, historical Objective/archive prose, absence assertion, or git-native compatibility requiring separate safety evidence.

- [ ] Delete repo-owned filesystem/config/storage fallback codepaths once the inventory proves canonical coverage.
      Remove safe legacy fallback reads and their tests/docs from subsystems such as saved plans, slot storage, Branch Memory prompt lookup, SDL global extensions, submit failure logs, Pi CLI trace logs, and vibechk store handling as applicable. Evidence should include targeted tests for canonical XDG/`.sdl` behavior and source-search classification of remaining legacy hits.

- [ ] Resolve Branch Memory git-ref compatibility separately if it is still active.
      If legacy `refs/brmem/*` compatibility exists, decide whether to migrate, export, retain, or abandon it before deleting fallback reads. Do not delete durable ref compatibility merely because filesystem/config fallbacks are ready to remove.

- [ ] Refresh active documentation and agent guidance after cleanup.
      Active docs, package READMEs, and relevant skills should present XDG user/global roots and in-repo `.sdl/...` paths as canonical. Legacy paths should appear only as historical context, explicit retained compatibility, Pi-owned external paths, or migration notes.

## Parked

- Automatic migration or deletion of user data in old local paths.
- Redesigning Pi-owned `~/.pi/agent/...` storage.
- Rewriting historical Objective records or archived branch-context prose to remove old path names.
- Replacing the XDG target with a single `~/.sdl` home-directory root.
