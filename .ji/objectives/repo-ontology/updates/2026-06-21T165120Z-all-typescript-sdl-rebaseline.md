# Rebaseline to the all-TypeScript, all-`@sdl/*` repo

Provenance: objective-refresh basis target=HEAD from=a1cc7fb2b (Rename repository namespace from asdl to sdl)

The durable `objective.md` and `roadmap.md` were two migrations behind the tree and have been rewritten from scratch against current ground truth. `CONTEXT-MAP.md` had already been rebaselined; the Objective record had not.

Verified ground truth (HEAD, `master`):

- **Python workspace gone.** No tracked first-party Python `packages/*` packages remain (`packages/` directory absent). Every `packages/*/CONTEXT.md` target the old record named (`areg`, `asdl-core`, `asdl-handoff`, `brmem`, `asdl-pr-address`, `roaster`, `asdl-slots`, `asdl-objectives`, `packagechk`, `aretro`, `vibechk`) was false — none exist.
- **`asdl → sdl` rename landed** (commit a1cc7fb2b, 2026-06-20). All workspace package names are now `@sdl/*`; the only unscoped name is `sdlcc`. The old `@asdl/*` and `asdl-*` naming throughout the record was stale.
- **20 tracked TypeScript packages** under `ts/packages/` (`git ls-files 'ts/packages/*/package.json' | wc -l` = 20). The old "12 Python packages" / "nine TypeScript packages" assumptions were both false.
- **Six present package contexts** verified via `git ls-files '*CONTEXT.md'`: `handoff`, `brmem`, `ccc`, `pi-extension-runtime`, `pi-extensions`, `sdl` — plus root `CONTEXT.md` and `CONTEXT-MAP.md`. The old record's claimed `ts/packages/asdl-dev/CONTEXT.md` does not exist.
- **Leftover residue:** `ts/packages/asdl-core/` and `ts/packages/asdl-dev/` contain only `node_modules` and have 0 tracked files — untracked build residue, not packages.
- **No `dispatcher` package** exists, so the old `asdl-dispatcher` single-file/out-of-scope non-goal was moot and was dropped.
- **ADR corpus is `docs/adr/0001–0007`** (the old record said 0001–0006).

Corrections / parks carried into the rewrite:

- Scope, Assumptions, and Risks re-authored around the all-TypeScript baseline; the Phase 0–16/15.5 backlog (built on Python `packages/*`) was retired and the roadmap re-derived to mirror the map's Present/Planned/Out-of-scope sections.
- New open drift recorded as roadmap rows: (1) `CONTEXT-MAP.md`'s Inventory Baseline says "19 repo-local packages" but 20 are tracked — a map count catch-up; (2) seven tracked packages (`@sdl/core`, `@sdl/clinkr`, `@sdl/branch-context`, `@sdl/plans`, `@sdl/pr-address`, `@sdl/pi-command-surfaces`, `sdlcc`) have no recorded context decision in the map.

No closure: this remains a standing Objective. No `closed.md` written, no `## Closure` added.
