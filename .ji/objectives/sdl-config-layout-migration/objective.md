# SDL Config Layout Migration

## Thesis

SDL-owned config, data, state, and diagnostic storage should have one current layout contract: user/global SDL storage belongs under XDG roots with the `sdl` application namespace, and repository-owned configuration belongs under in-repo `.sdl/...` paths. Legacy dotdir and pre-migration paths may exist as temporary read-only compatibility during migration, but they should not become permanent product surface. This Objective tracks finishing the layout migration, proving the canonical paths are complete, and then deleting backwards-compatibility codepaths deliberately.

The first XDG migration baseline has already landed in commit `8ea1b1064` (`Migrate SDL storage and diagnostics to XDG roots`), based on the branch-context plan `sdl-xdg-storage-root-migration.md`. That work moved saved plans, slot storage, global SDL extensions, Branch Memory prompt lookup, submit failure logs, Pi CLI trace logs, and vibechk XDG handling toward XDG-compliant roots while preserving legacy read fallback where needed. The slot default has also already been migrated to the new location; remaining slot work under this Objective is cleanup of any stale compatibility or documentation, not re-deciding the slot target.

## Scope

- Treat these as the canonical layout targets:
  - user/global state: `$XDG_STATE_HOME/sdl/...`, defaulting to `$HOME/.local/state/sdl/...`;
  - user/global config: `$XDG_CONFIG_HOME/sdl/...`, defaulting to `$HOME/.config/sdl/...`;
  - user/global data: `$XDG_DATA_HOME/sdl/...`, defaulting to `$HOME/.local/share/sdl/...`;
  - repository-owned configuration and resources: checked-in `.sdl/...` paths.
- Preserve `8ea1b1064` and the associated `sdl-xdg-storage-root-migration` branch-context plan as baseline evidence for the already-landed migration.
- Inventory every remaining repo-owned backwards-compatibility codepath, test fixture, user-facing string, and active doc reference for legacy paths such as `~/.sdl/...`, `~/.slots`, `~/.brmem/prompts`, legacy global extension roots, old saved-plan roots, and any other migration-era fallback discovered in code.
- Delete repo-owned filesystem/config/storage compatibility codepaths after the inventory proves the canonical path is implemented, documented, and covered by tests.
- Include legacy Branch Memory git-ref compatibility only conditionally: if active legacy ref fallback code exists, first record a concrete safety story for migration, export, or explicit abandonment before deleting fallback reads.
- Update active docs, package READMEs, skills, and tests so they describe XDG/`.sdl` as canonical and mention legacy paths only when documenting an intentional, still-live fallback.

## Non-Goals

- Do not auto-migrate, delete, or rewrite user data in legacy locations as part of cleanup.
- Do not change Pi-owned storage contracts such as `~/.pi/agent/...`; SDL may read Pi-owned data where a Pi integration requires it, but this Objective does not redesign Pi's layout.
- Do not mass-edit historical Objective records, archived updates, or old branch-context prose merely to replace legacy path strings.
- Do not revive the older single-`~/.sdl` centralization plan as the target layout; XDG roots plus in-repo `.sdl/...` are the target.
- Do not create a hidden registry, task database, or migration state machine to track cleanup.

## Completion Criteria

- A current inventory identifies every active legacy config/storage fallback codepath and classifies each as deleted, intentionally retained with rationale, Pi-owned/external, historical prose, or durable git-native compatibility requiring separate migration evidence.
- All repo-owned filesystem/config/storage legacy fallbacks that are safe to remove have been deleted from implementation code, tests, and active docs.
- The canonical XDG and in-repo `.sdl` paths are documented in the relevant active docs and package READMEs, with slot storage explicitly described as already migrated.
- Tests cover the canonical path behavior for each touched subsystem after fallback deletion; tests no longer rely on legacy paths except where a retained fallback is explicitly documented.
- Source searches for legacy path literals have been reviewed and remaining hits are only historical records, Pi-owned external layout, deliberate retained compatibility, or absence/assertion tests.
- Any Branch Memory git-ref compatibility cleanup has either been completed with explicit safety evidence or parked with a clear rationale explaining why it is not part of the filesystem/config cleanup.

## Assumptions and Risks

Assumptions:

- The repository remains private/unreleased enough that backwards-compatibility codepaths can be removed after evidence, without a long public deprecation window.
- The landed XDG migration commit `8ea1b1064` is the correct baseline for this Objective rather than work to repeat.
- Slot storage has already moved to the new location; future work should verify and clean stale slot fallback/docs rather than reopen the slot target decision.
- XDG plus in-repo `.sdl` is the desired final layout, not a single home-directory `~/.sdl` root.

Risks:

- Deleting fallback reads too broadly could strand real local data, especially saved plans, slot pools, prompt templates, or extension installs. Mitigate by inventorying each fallback and avoiding automatic data mutation.
- Branch Memory git refs are durable git-native storage, not ordinary config files; deleting ref fallback without migration/export evidence could hide branch-scoped context.
- Legacy path strings appear in historical Objective records and archival prose; a blind grep-and-replace would corrupt provenance.
- Some SDL-adjacent code intentionally references Pi-owned paths. Treating those as SDL layout debt would expand the Objective beyond its boundary and risk breaking Pi integration.

## Open Questions

- Which, if any, legacy filesystem fallbacks should be intentionally retained past the first cleanup pass because they protect common local data too strongly to delete immediately?
- Does any active Branch Memory ref-layout compatibility still exist after the current SDL rename/XDG work, and if so what migration/export evidence is required before removing it?
- Should the final cleanup produce a short operator note for users with old saved plans, slot pools, prompt templates, or extensions, even though no automatic migration is in scope?

## Closure

Outcome: completed. The Objective's target contract is now implemented as the post-landing state of PR #1969 on top of the earlier cleanup branch: SDL-owned user/global storage uses canonical XDG roots with the `sdl` application namespace, repository-owned resources use checked-in `.sdl/...` paths, branch-context attached plans require supported named Markdown keys, and land-stack managed-slot classification is limited to canonical `sdl/slots` worktree pools.

Completion evidence is recorded in the three Semantic Updates under this Objective. The inventory update identified active compatibility surfaces and non-target historical/Pi-owned/durable-git references. The cleanup update removed the repo-owned filesystem/config fallbacks, refreshed active docs and agent guidance, and established that `refs/brmem/*` is canonical Branch Memory storage rather than legacy compatibility. The final hardening update fixed the remaining readiness blockers: stale session evidence with `key: "plan.md"` is rejected before Branch Memory presence checks, and legacy `.slots` worktrees are treated as manual conflicts rather than SDL-managed slots.

Validation evidence includes focused package tests for the affected branch-context and CCC land-stack behavior, plus full repository gates through `just` after the final hardening slice. Remaining legacy-path mentions are historical provenance, Pi-owned/external layout, explicit no-fallback/user-local notes, generic plan-file fixtures, or negative assertions. Automatic migration/deletion of user-local legacy data remains intentionally out of scope.
