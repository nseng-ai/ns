# pkg-scope-sweep (ji → ns, phase 2 / PR-5)

One-shot tooling for the **internal sweep** row of the `rename-ji-to-ns`
objective: `@ji/*` → `@ns/*`, `src/ji/` → `src/ns/`, ji-named files,
`jicc` → `nscc`, `ji-ts-workspace` → `ns-ts-workspace`, the `"ji"` manifest
key → `"ns"`, and `ji.toml` → `ns.toml`. Runs **after** phase 1 (PR-4 core
cutover) lands; phase 1's baselines pin this phase's input untouched.

**Consumer artifact — throwaway after cutover, no promotion path.** Per
`docs/conventions/platform-and-consumer.md` this lives with the objective it
serves; it is not a platform capability and must not migrate into
`ts/packages/*`.

## Pieces

- `rename-map.ts` — pure rename data + `renameSpecifier()` transform (same
  exported API as the rename-sdl-to-ji predecessor). Includes a NUL guard for
  the style-guard's `"@ji/a\0@ji/b"` debt keys (hand-edit sites).
- `codemod.ts` — AST span-splice rewrite of TS string literals.
  Mode A: module-specifier positions, all files. Mode B: specifier-shaped
  strings elsewhere (empty exclusion list this time — the prior sweep's
  judgment files have no ji-hazard; see comment in the file).
- `manifest-rewrite.ts` — package.json names, dependency keys, exports
  subpaths, bin (`jicc`→`nscc`, plus a `ji`→`ns` phase-1 backstop), scripts,
  and — **new in this sweep** — the manifest key `"ji"` → `"ns"` itself,
  including the seven extension manifests under `<consumer>/extensions/*`
  (the predecessor only rewrote values inside an already-correct key).
  Preserves each manifest's existing indentation (tabs vs. two spaces).
- `git-moves.sh` — ordered `git mv` list (9 `src/ji` dirs, 21 ji-named files,
  `hosts/jicc`, `ji.toml`).
- `hand-edits.md` — the enumerated direct-edit checklist (manifest-key
  consumers, `ji.toml` reader literals, bare `ji:` fixture keys, docs/skills
  examples), with verified file:line anchors.

Both node scripts auto-detect the consumer dir (`.ns` if present, else `.ji`),
so they run identically before and after PR-4's `git mv .ji .ns`. On landing
day the tool itself lives under `.ns/objectives/...` — adjust paths below.

## Usage (from repo root, in order)

Dry-run first — both node scripts default to dry-run; run them without
`--write` and eyeball the counts/file list before applying. Both are
idempotent (a second `--write` run reports zero edits). They resolve the
workspace `typescript` package via `createRequire(ts/package.json)`, so no
workspace-glob changes are needed — do not reinstall `node_modules` first.

```bash
SWEEP=.ns/objectives/rename-ji-to-ns/tools/pkg-scope-sweep   # .ji/... before PR-4

bash "$SWEEP/git-moves.sh"
node "$SWEEP/manifest-rewrite.ts"           # dry run
node "$SWEEP/manifest-rewrite.ts" --write
node "$SWEEP/codemod.ts"                    # dry run
node "$SWEEP/codemod.ts" --write
# hand edits: work through hand-edits.md top to bottom
rm -rf ts/node_modules && corepack pnpm --dir ts install
just dprint-fix && just ts-format-fix && just ts-lint-fix
env -u FORCE_COLOR just
```

The `rm -rf ts/node_modules` is mandatory: pnpm can no-op on a dirty store
and leave stale `.bin` entries alive. After install, `ts/node_modules/.bin/nscc`
must exist and `.bin/jicc` must not.

## Phase-2 residual invariants (run after the gate is green)

Grep only for leftover **ji** (never verify by searching for `ns` — too
common a token; ns-correctness is proven by the gate + smoke tests). Shared
history allowlist, per the plan:

```
ALLOW=':!.ns/objectives/**' ':!docs/adr/**' ':!docs/ji-naming-brief.md' \
      ':!ts/pnpm-lock.yaml' ':!.ns/objective-archive/**'
```

(Closed-objective trees, all `updates/**`, both rename record trees — which
include this tool's own frozen artifacts — the objective archive, ADR bodies,
the superseded naming brief, and the lockfile stay verbatim.)

```bash
git grep -nE '@ji/'              -- . $ALLOW
git grep -nE '(^|/)src/ji(/|["'"'"'])' -- . $ALLOW
git grep -n  'jicc'              -- . $ALLOW
git grep -n  'ji\.toml'          -- . $ALLOW
git grep -nE '"ji"\s*:'          -- '**/package.json' $ALLOW
git grep -nE '(^|[^a-z-])ji-(command|context|runtime|extension|cli-fakes|command-harness)' -- ts $ALLOW
git ls-files | grep -E '(^|/)(ji[-.]|jicc|repo-local-ji|handoff-ji)' \
  | grep -vE '^(\.ns/|docs/ji-naming-brief\.md)'
```

Every hit must be either allowlisted history or an explicitly recorded
exception. Post-sweep smoke: `nscc` launches; `ns flow --help` text
spot-check; `ns objective list --minimal --format md`.
