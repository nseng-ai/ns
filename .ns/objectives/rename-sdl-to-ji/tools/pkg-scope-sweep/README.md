# pkg-scope-sweep

One-shot tooling for the **package scope sweep** row of the `rename-sdl-to-ji`
objective: `@sdl/*` → `@ji/*`, `sdl-flow` → `@ji/flow`, `sdlcc` → `jicc`,
`@sdl-local/pi-tools` → `@internal/pi-tools`, `src/sdl/` → `src/ji/`, and
sdl-named files/dirs/export-subpaths.

**Consumer artifact — throwaway after cutover, no promotion path.** Per
`docs/platform-and-consumer.md` this lives with the objective it serves; it is
not a platform capability and must not migrate into `ts/packages/*`.

## Pieces

- `rename-map.ts` — pure rename data + `renameSpecifier()` transform.
- `codemod.ts` — AST span-splice rewrite of TS string literals.
  Mode A: module-specifier positions, all files. Mode B: specifier-shaped
  strings elsewhere, minus an exclude list of judgment files.
- `manifest-rewrite.ts` — package.json names, dependency keys, exports
  subpaths, bin, `ji.subpackages`.
- `git-moves.sh` — ordered `git mv` list (dirs, files, package dirs).

## Usage (from repo root, in order)

```bash
bash .ji/objectives/rename-sdl-to-ji/tools/pkg-scope-sweep/git-moves.sh
node .ji/objectives/rename-sdl-to-ji/tools/pkg-scope-sweep/manifest-rewrite.ts --write
node .ji/objectives/rename-sdl-to-ji/tools/pkg-scope-sweep/codemod.ts --write
rm -rf ts/node_modules && corepack pnpm --dir ts install
just dprint-fix && just ts-format-fix && just ts-lint-fix
```

Both node scripts default to dry-run and are idempotent (a second `--write`
run reports zero edits). They resolve the workspace `typescript` package via
`createRequire(ts/package.json)`, so no workspace-glob changes are needed.
