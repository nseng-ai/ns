# Roadmap

## Work

- [x] Record npm publish-name decision: do not claim `@ji`; use existing org/scope
      `@nseng-ai` with package name `ji` (`@nseng-ai/ji`). The unscoped `ji` squat
      remains an accepted collision with no dispute path.
- [x] Land the decision records: ADR 0024 (`docs/adr/0024-rename-sdl-to-ji.md` —
      rationale, rejected alternatives, accepted collisions, lowercase rule, and the
      then-current npm scope plan), the naming brief (`docs/ji-naming-brief.md`), and
      the re-record of `checkout-free-sdl-distribution`'s publish-name open question as
      resolved by this Objective. The npm target was later superseded by the
      `@nseng-ai/ji` decision recorded in update `2026-07-03-npm-target-nseng-ai-ji.md`.
- [x] Core cutover in one landing window: `sdl` bin → `ji`, `.sdl/` → `.ji/`,
      `/sdl:*` → `/ji:*`, XDG `*/sdl/` → `*/ji/`, kernel/tooling paths, and the
      `cross-harness-parity` table update.
      Tracked in the dedicated Objective `ji-core-cutover` (surface inventory:
      `cutover-inventory.md` in this record); completed when that Objective closed on
      2026-07-03.
      Evidence: `just` passed with 3994/3994 tests; `ji objective list` and
      `ji objective exec load-orientations` worked post-cutover; the landing update
      recorded no compat codepath introduced and parity-table rows 38/51 updated
      in-window.
- [ ] Write and execute the manual machine migration checklist (XDG `mv`s, checkout
      path, worktree slots, shell-profile `SDL_*` env vars — enumerated in
      `cutover-inventory.md` machine-migration notes), and fix up any straggler
      branches by hand.
      Partial evidence recorded 2026-07-03: no migration is needed for global extension
      data, brmem prompt config, or current-process `SDL_*`/`JI_*` environment variables
      on the investigated owner machine. The old `.zshrc` `sdl shell integration` block
      and `sdl completion zsh` line were replaced with their `ji` equivalents; `zsh -n`
      passed afterward. Old `refs/sdl/flow-land-backup*` refs were migrated into the
      corresponding `refs/ji/flow-land-backup*` namespace with no collisions, leaving no
      `refs/sdl/flow-land-backup*` refs behind.
- [x] Vocabulary sweep: CONTEXT.md, CONTEXT-MAP.md, AGENTS.md, skills, and active docs —
      `ji` glossary entry with casing rule, `SDL` added to *Avoid*, compound canonical
      terms renamed. Completed in update `2026-07-03-vocabulary-docs-sweep.md`.
- [x] Package scope sweep first pass: `@sdl/*` → `@ji/*` (18 packages + the
      `.ji/reviews` scanner), `@sdl-local/pi-tools` → `@internal/pi-tools`
      (local-space scope preserved as `@internal/`), `sdl-flow` → `@ji/flow`,
      `sdlcc` → `jicc`, `src/sdl/` → `src/ji/`, `./sdl*` export subpaths →
      `./ji*`, sdl-named source files/dirs renamed
      (`sdl-capability-kit` → `capability-kit`, `hosts/sdlcc` → `hosts/jicc`).
      Executed via the hybrid AST-codemod + manifest-rewrite tooling in
      `tools/pkg-scope-sweep/`; see
      `updates/2026-07-03-package-scope-sweep-executed.md`.
- [ ] Package scope correction for the npm target: `@ji/*` → `@nseng-ai/*`, keep the
      externally published package target at `@nseng-ai/ji`, and ensure local-only
      packages remain outside the publish scope.
- [ ] Final, manual: rename the GitHub repo to `nseng-ai/ji`; update remotes and any
      active links.

## Parked

- Deeper `jicc` renaming or folding it into the `ji` surface — future product decision,
  not part of the mechanical rename.
- Dedicated `ji` GitHub org/handle — launch-time branding decision.
