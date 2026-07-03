# 2026-07-03 — Package scope sweep executed

Executed the package-scope sweep row on branch `at-sdl-to-at-ji` using a
hybrid deterministic-tooling + targeted-judgment approach (tooling checked in
at `tools/pkg-scope-sweep/`, throwaway, no promotion path).

## Naming decisions ratified in-session

- `@sdl/*` → `@ji/*` (18 workspace packages, plus
  `@sdl/review-reinvention-scanner` → `@ji/review-reinvention-scanner` under
  `.ji/reviews/*/tools/*` — a workspace member the initial inventory missed).
- `sdl-flow` → `@ji/flow` (unscoped straggler becomes scoped; the style-guard
  unscoped special case was deleted, not renamed).
- `sdlcc` → `jicc`: package name, bin, directory `hosts/sdlcc` → `hosts/jicc`,
  wire constants (`sdlcc-branch` → `jicc-branch`), identifiers, prose.
- `@sdl-local/pi-tools` → `@internal/pi-tools`: the local-space scope survives
  as `@internal/` (style-guard local-space policy renamed mechanically, not
  redesigned).
- `src/sdl/` → `src/ji/` (9 capability command faces), export subpaths
  `./sdl/commands/*` → `./ji/commands/*`, `./sdl-command`/`./sdl-context` →
  `./ji-command`/`./ji-context`, sdl-named files → ji-named
  (`repo-local-sdl-extension.ts` → `repo-local-ji-extension.ts`, etc.),
  `packages/sdl-capability-kit` → `packages/capability-kit`.
- Workspace root `sdl-ts-workspace` → `ji-ts-workspace`.

## Mechanics

- AST codemod (span-splice, mode A specifier positions + mode B
  specifier-shaped strings, exclude-listed judgment files) over `ts/`, `.pi/`,
  `.ji/reviews`, `.ji/extensions`: ~1,900 specifier edits, 838+ files.
- Manifest rewrite over 23 workspace manifests: names, dependency keys,
  exports keys/values, bin, deep `ji` field (subpackages + command `entry`
  paths).
- Judgment residue handled per-site: `module-loader.ts` (path segments +
  comment refs; specifier constants were mode-B mechanical), style-guard rule
  sources + fixtures, jicc host, cli-entry/package-boundary fixtures,
  architecture-topology-report scripts, living docs.
- Both tools are idempotent; re-runs report zero edits.

## Verification

- `just` green: 3,996 unit tests, 112 integration, 102 style-guard.
- In-tree runtime smoke: `node ts/packages/kernel/src/cli/index.ts objective
  list` and `... objective exec load-orientations` work (module-loader
  name-equality assertions pass); `jicc --help` resolves via the renamed bin.
- rg oracle for `@sdl(-local)?/|sdl-flow|sdlcc` ≈ 0 outside allowlisted
  historical records (`docs/adr/**`, `.ji/objectives/**` archives).

## Deliberate survivors (out of this row's scope)

- Skill names/dirs `sdl-flow-submit`, `sdl-cli-design`, `sdl-typescript` (and
  `skills-lock.json` / `.pi/settings.json` entries referencing them) — skill
  renames belong to the vocabulary/skills row.
- Prose `sdl`/`SDL` product-name mentions in docs and comments — vocabulary
  sweep row.
- TS identifiers containing `Sdl`/`SDL_` (e.g. `createSdlJiti`,
  `SDL_COMMAND_EXPORT_PREFIX` identifier names) — vocabulary sweep; `sdlcc`
  identifiers were renamed with the package.
- Repo name `sdl-tools` in paths/fixtures — final GitHub-rename row.
- Historical records (`docs/adr/**`, objective archives) untouched per
  orientation.

- Vendored mirrors `.agents/skills/{sdl-typescript,sdl-cli-design,architecture-topology-report}`
  are one refresh behind their edited `skills/` sources: `just refresh-skills`
  currently fails on an unrelated upstream problem (the `ts-morph-refactor`
  skill is no longer offered by its source repo) and its partial run corrupts
  vendored state (deletes `agents/openai.yaml` files areg requires), so it was
  fully reverted. Re-vendor once refresh-skills is fixed; `just areg-check`
  passes in the committed state.

## Post-landing note

Installed `ji` binaries built from pre-sweep checkouts cannot resolve this
tree's `.ji/extensions` shims (they alias `@sdl/*`); reinstall/relink after
landing (`just install-ji`), matching the core-cutover §B4 relink gotcha.
