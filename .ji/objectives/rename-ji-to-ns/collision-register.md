# ns collision register

Frozen 2026-07-03. This register classifies every in-repo hit of the ns-shaped scan
below so the ji→ns edit-agent brief can carry precise DO-NOT-TOUCH entries. Because `ns`
is an extremely common token, cutover verification uses **leftover-ji greps only** —
never a positive-ns search.

Scan command (34 hits at freeze):

```sh
git grep -nIE '@ns/|\.ns/|NS_[A-Z]|(^|[^A-Za-z0-9_@/-])ns([^A-Za-z0-9_-]|$)' \
  -- . ':!ts/pnpm-lock.yaml' ':!.ji/objectives' ':!.ji/objective-archive' ':!*node_modules*'
```

## DO NOT TOUCH — pre-existing non-brand `ns`

These are real, load-bearing `ns` tokens that predate the rename and are not the product
name. Never rename, "normalize", or brand-case them.

- `ts/packages/infra/brmem/src/ref-layout.ts:9` — `export const BRMEM_NS_SEGMENT = "ns";`
  This is brmem's **namespace** ref segment: named Namespace Entries live under
  `refs/brmem/ns/<namespace>/<branch>`. Renaming it corrupts every existing brmem ref on
  every machine. Also lines 155, 183, 219 (segment interpolation, parse dispatch, prefix
  enumeration).
- `skills/brmem/SKILL.md:75, 78, 82, 94, 283` — `--namespace <ns>` CLI option
  placeholders in the brmem skill. `<ns>` abbreviates "namespace", not the product.
- `.ji/objectives/migrate-areg-and-ns-skills/` — closed Objective slug (excluded from
  the scan by path filter; recorded here for completeness). Historical: `ns-*` was the
  skill prefix of the owner's old `nonslop` repo. Slugs are durable identity; never
  rename.

## Regex artifacts — `NS_[A-Z]` substring matches inside longer identifiers

Ordinary identifiers that merely contain the byte sequence `NS_`. Not `ns` tokens at
all; listed so no one "investigates" them twice. Do not touch.

- `docs/retros/cli-surface-conformance-audit.md:425` — `PLANS_ERROR_TYPE` (historical
  retro prose).
- `ts/packages/hosts/pi/test/integration/node-runtime-imports.test.ts:9, 16, 115, 116,
  120` — `PI_EXTENSIONS_PACKAGE_ROOT`, `PI_EXTENSIONS_WORKSPACE_IMPORTS`.
- `ts/packages/local/pi-tools/src/context-profiler/render.ts:29, 102, 130, 360` and
  `test/context-profiler/context-profiler-render.test.ts:41, 169, 472` —
  `TOKENS_COLUMN_WIDTH`.
- `ts/packages/local/pi-tools/src/context-profiler/runtime.ts:45, 243` and
  `segmentation.ts:35` — `MIN_TURNS_FOR_SEGMENTATION`.
- `ts/packages/tools/vibechk/src/cli.ts:52, 58` — `DEFAULT_RUNS_LIMIT`;
  `reports.ts:25, 103` — `RUNS_TABLE_COLUMNS`; `store.ts:13, 72, 117, 122, 217` —
  `RUNS_DIR_NAME`.

## Surprises

None. Every hit classified as an expected collision or a regex substring artifact; no
pre-existing `@ns/` scope, `.ns/` path, or `NS_*` env var exists anywhere in the repo.

## Verification consequence

Post-cutover residual-grep invariants search only for leftover ji forms (`.ji/`,
`/ji:`, `@ji/`, `JI_*`, `ji` bin references, `ji.toml`, `jicc`, `ji-*.ts`,
`skills/ji-flow-*`) outside historical records. No invariant asserts the presence or
absence of `ns` tokens, because the entries above are permanent legitimate uses.
