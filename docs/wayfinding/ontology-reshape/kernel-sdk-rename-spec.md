# Kernel → SDK rename spec

Resolves the ontology-reshape roadmap row "Spec the kernel → sdk rename (grilling)",
2026-07-12. Rationale lives in ADR 0035; this spec is mechanics only — what changes, in
what order, and how to verify. Execution is owned by the `execute-kernel-sdk-rename-spec`
Objective (the reshaping handoff vehicle's New-Objective hatch).

## Landed vs. not

Nothing below is executed. As of 2026-07-12 the only landed artifacts are ADR 0035, this
spec, and the roadmap/tracking edits around them. Every item is an unexecuted decision.

## Volatile inventory (re-verified 2026-07-12 by the execution sweep; re-enumerate per slice)

- 183 `@nseng-ai/kernel/sdk`-bearing lines in `ts/packages/**/*.ts` (170 static `from`
  imports, 2 dynamic imports in `kernel/test/unit/sdk-module-loader.test.ts:10-11`, 11
  comment/string mentions) and 265 total `@nseng-ai/kernel*` lines. Non-`/sdk`
  specifier-line counts: `/command-io` 15, bare `@nseng-ai/kernel` 15 (all
  strings/comments/config data — no bare imports), `/cli` 14,
  `/extensions/declared-descriptors` 10, `/extensions/acquisition` 8, `/context` 7,
  `/project-config/points` 5, `/project-config` 3, `/progress-phase-state` 3,
  `/testing` 2. No kernel imports in non-`.ts` files under `ts/packages`.
- Dependents: 16 workspace `package.json`s declare `@nseng-ai/kernel` (11 capabilities,
  capability-kit, hosts/ns, hosts/pi, internal/typescript-style-guard, tools/areg —
  tools/areg is dep-only with zero source imports) plus the root `ts/package.json:42`
  devDependency. Kernel itself carries 52 self-referencing import lines (tests
  importing via package subpaths).
- Kernel `package.json`: 12 export subpaths, `ns.tier: "sdk"`,
  `publicPluginApi: ["./sdk"]`, 11 `internalWorkspaceExports` entries; test script
  references `packages/kernel/test` (line 49).
- Runtime literal: `SDK_SPECIFIER = "@nseng-ai/kernel/sdk"` at
  `kernel/src/runtime/module-loader.ts:6` — the jiti `virtualModules` key extension
  modules resolve against at runtime; its doc comment (`:11`) spells the specifier
  too, and `kernel/test/unit/sdk-module-loader.test.ts:11` passes the same string to
  `createNsJiti().import(...)`.
- Kernel test fixtures embed `@nseng-ai/kernel/...` specifiers inside template-literal
  fixture source (string content, not real imports — the ordered pairs still match
  them): `extension-loader-cli.test.ts:73,109,137,165,213,279`;
  `extension-registry-shim-loading.test.ts:24,33`; `completion-cli.test.ts:29,52,77,147`;
  `extension-point-descriptor-resolution.test.ts:151`;
  `descriptor-extension-cli.test.ts:13,39,84,129`; `cp-cli.test.ts:113` (expected
  stdout embeds name, dir path, and a `bin kernel` token derived from the package
  name), `:145`; `extension-points-cli.test.ts:209`;
  `extension-registry.test.ts:40,87,209,263`; `extension-loader.test.ts:33,81`. Plus
  the `command-registry.ts:286` error message asserted by
  `extension-loader-cli.test.ts:247`, the `sdk-runtime-exports.test.ts:82` describe
  label, the `src/sdk/index.ts:2` comment path, and concept comments in
  `src/extensions/zod-issue-path.ts:4,6`.
- hosts/pi allowed-specifier lists:
  `hosts/pi/test/integration/node-runtime-imports.test.ts:27,41,42,44`.
- `hosts/ns` (`package.json` 59 lines): `files` entry `"kernel"` (:11); exports
  `./kernel/{cli,command-io,context,sdk}` (:17-20) backed by `src/kernel/*.ts`; dep
  (:40); `ns.subpackages: ["cli", "kernel"]` (:55); `scripts/kernel-export-entries.json`
  (4 `kernel/*`-keyed entries whose values carry `kernel/src/...` source paths);
  kernel refs in `build-bundle.mjs` (5), `prepare-local-package.mjs` (7),
  `smoke-checkout-free.mjs` (4), `README.md` (2); consumer imports in
  `src/cli/index.ts:8-9` and `src/cli/pi-text-generation.ts:13`; test surfaces in
  `test/ns-cli.test.ts` (~16 lines: `KernelExportSurface`, `kernelExportSurfaces()`,
  the barrel-exhaustiveness test), `test/support/cli-harness.ts:43` fixture string, and
  `test/integration/slot-alias-cli.test.ts:3`; `src/kernel/sdk.ts:63-66` re-exports the
  Kernel-named completion type aliases (see Parked).
- Style guard (`internal/typescript-style-guard`): `src/config.ts:111`;
  `src/source-rules.ts:1,153,228,492`; `src/tier-directory-projection.ts:13,28`
  (`sdk: { kind: "exact-dir", dir: "kernel" }`); `src/package-tier-taxonomy.ts:108,111`
  (debt edge); `package.json:22` dep. Its test file lives at
  `ts/packages/internal/typescript-style-guard/test/typescript-style-guard/typescript-style-guard.test.ts`
  (there is no `ts/test/` directory): kernel-import fixtures `:205,:211,:500`;
  kernel-path fixtures `:218,:242,:248,:254,:931` plus the `:929` fixture-name string;
  data literals `:727,:740,:761,:766`; subpackage fixtures `:858,:878`; topology
  fixtures `:1620,:1625,:1626` inside the `syntheticCapabilityKernelPiCycleEdges`
  identifier (`:1623,:1645`). Do-not-rename: `:937` (`ts/packages/infra/kernel`, a
  deliberate negative case) and `:1128-1163` (generic `kernel` subpackage-name
  fixtures, e.g. `@nseng-ai/base/kernel`).
- The then-current release tooling had six kernel-bearing files covering public-package
  inventory, source-package preparation, verification, qualification, consumer smoke,
  and public-subpath definitions. The rename changed `assertKernelExports`,
  `criticalKernelExports`, `rewriteKernelImports`, the `./kernel/` export prefix,
  `@nseng-ai/kernel/` source rewrites, and the `NS_KERNEL_KEEP_SMOKE_DIR` environment
  variable together with the four public-subpath identifiers.
- Live surfaces outside `ts/packages/`:
  `skills/architecture-topology-report/scripts/example-spec.mjs` (21 kernel-bearing
  label/comment lines, zero imports); `docs/guides/points.md:8` (path link to
  `ts/packages/kernel/CONTEXT.md`), `:21` (prose), `:108` (`@nseng-ai/kernel/sdk`
  specifier); `docs/README.md:20`; `docs/conventions/subpackage-conventions.md:22`. No
  `.ns/` extension modules or workspace review tools import kernel; `.pi/`, `.claude/`,
  `.agents/`, and root config files are clean.
- Prose: root `CONTEXT.md` exactly 11 kernel-bearing lines (Extension Layering intro
  :179, Point catalog :202, SDK-provided service :225, Runtime Harness :229, the
  Extension entry's Avoid line :236, Capability :247, Capability Kit :255, the cmux
  capability Avoid line :268, Host-surface subpackage :299, Checkout-free distribution
  :311, Package preparation :315); `CONTEXT-MAP.md` 11 lines; `kernel/CONTEXT.md` 28;
  `kernel/README.md` 20; `kernel/docs/sdk-reference.md` 21;
  `kernel/docs/writing-an-ns-extension.md` 11; in-package docs
  `ts/packages/README.md:9,36`, `hosts/pi/AGENTS.md`,
  `capabilities/slots/README.md:11,44`, `capabilities/reviews/CONTEXT.md:17`,
  `capabilities/harness-artifacts/README.md:64`. "SDK boundary" is a prose phrase
  (`CONTEXT.md:179`, `CONTEXT-MAP.md:95`), not a glossary entry.
- npm: `@nseng-ai/kernel@0.1.2` published; `@nseng-ai/sdk` unclaimed (E404);
  `@nseng-ai/ns@0.1.2` published.

## Word-boundary safety

Every substitution pass must be followed by a global check that the diff touches only
the item's enumerated live-source set (precedent: a blanket `capability-kit/git`
substitution once corrupted 36 `github` imports).

| Pair                                             | Safety                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `@nseng-ai/kernel/sdk` → `@nseng-ai/sdk`         | Safe exact substring, but MUST run before the generic pair below or it never matches.                                    |
| `@nseng-ai/kernel` → `@nseng-ai/sdk` (remaining) | Safe after the pair above; no other live specifier has `@nseng-ai/kernel` as a prefix.                                   |
| `@nseng-ai/ns/kernel/sdk` → `@nseng-ai/ns/sdk`   | Safe, but MUST run before the pair below (a generic `ns/kernel/` pass would yield `ns/sdk/sdk`).                         |
| `@nseng-ai/ns/kernel/` → `@nseng-ai/ns/sdk/`     | Safe after the pair above.                                                                                               |
| `ts/packages/kernel` → `ts/packages/sdk`         | Safe; no `ts/packages/kernel-*` sibling. Also covers `packages/kernel/test` in the package's own test script.            |
| bare `kernel` / `Kernel`                         | NEVER blanket-substitutable: lives in immutable history, historical prose, and ADRs ≤ 0034. Classify per hit (item 4/5). |

## Immutable-history boundary

Nothing under `.ns/objectives/**` (other than the executing record's own tracking),
`docs/wayfinding/**` research assets (this spec itself may receive sweep corrections),
`docs/retros/**`, or ADRs ≤ 0034 is edited for the rename. Kernel names get no
compatibility aliases or re-export shims — "kernel" is anti-vocabulary in live prose
after item 4.

## Ordered items

Each item is one committed slice on a named fresh Graphite branch stacked on the
previous, `just` green per slice, local-only until user review. Items 1→2→3 are
order-dependent; 4 depends on 1–3; 5 is the closeout.

### 1. Package identity rename — `kernel-sdk-rename/rename-package`

- **Change:** `git mv ts/packages/kernel ts/packages/sdk`; `package.json` name →
  `@nseng-ai/sdk`; every dependent's `package.json` key (16 workspace manifests plus
  the root `ts/package.json` devDependency); all `@nseng-ai/kernel*` specifiers via
  the two ordered pairs (author subpath imports become `@nseng-ai/sdk/sdk` temporarily
  — resolved by item 2; the pairs also cover fixture template literals, comments, and
  the hosts/pi allowed-specifier lists); the module loader's `SDK_SPECIFIER` literal;
  style-guard projection `dir: "kernel"` → `dir: "sdk"`, the debt-edge `from` literal,
  and test-local kernel fixtures honoring the do-not-rename list (incl. the `:929`
  fixture-name string and the `syntheticCapabilityKernelPiCycleEdges` identifier);
  `ts/packages/kernel` path references (own test script, cp-cli/land-matrix/
  fleet-navigator fixtures, `src/sdk/index.ts:2` comment) and the `kernel/src/...`
  path *values* inside `hosts/ns/scripts/kernel-export-entries.json` (its filename and
  `kernel/*` keys wait for item 3); release scripts' source-package side
  (`@nseng-ai/kernel` mentions; `ns/kernel` fold targets wait for item 3); pnpm
  lockfile refresh.
- **Scope facts:** 265 `@nseng-ai/kernel*` lines / 16 dependent manifests + root
  devDep / 4 style-guard source files + its test file, as dated above.
- **Ride-alongs:** none (prose waits for item 4; `CONTEXT.md`/`README.md`/`docs/` move
  with the directory unedited).
- **Verification:** `just` green; `rg '@nseng-ai/kernel'` and `rg 'ts/packages/kernel'`
  over live source return nothing; `ts/packages/sdk/` exists, old dir gone.

### 2. Author entry point becomes the package root — `kernel-sdk-rename/root-entry-point`

- **Change:** add `".": "./src/sdk/index.ts"` to exports, drop `"./sdk"`;
  `ns.publicPluginApi` → `["."]`; rewrite all `@nseng-ai/sdk/sdk` occurrences (the 183
  author-API-bearing lines: 170 static imports, 2 dynamic imports, string/comment
  mentions incl. the `sdk-module-loader.test.ts:11` jiti specifier argument and the
  `module-loader.ts:11` doc comment) to `@nseng-ai/sdk`; module-loader `SDK_SPECIFIER`
  → `@nseng-ai/sdk`; update
  `skills/architecture-topology-report/scripts/example-spec.mjs` and
  `docs/guides/points.md:108` specifiers.
- **Scope facts:** 183 author-API-bearing lines as dated above; internal exports and
  the `./progress-phase-state` mapping unchanged.
- **Ride-alongs:** import-snippet lines in `sdk-reference.md`,
  `writing-an-ns-extension.md`, and READMEs rewrite mechanically (prose rewrite waits
  for item 4).
- **Verification:** `just` green; `rg '@nseng-ai/sdk/sdk'` returns nothing;
  `publicPluginApi` is `["."]`; extension loading works (`ns --help` resolves and a
  descriptor-loading test passes).

### 3. Checkout-free fold rename — `kernel-sdk-rename/rename-ns-fold`

- **Change:** `hosts/ns` exports `./kernel/{cli,command-io,context,sdk}` →
  `./sdk/{cli,command-io,context}` plus `./sdk` for the author API (the two ordered
  `ns/kernel` pairs); `files` entry and `ns.subpackages` `kernel` → `sdk`;
  `src/kernel/*.ts` → `src/sdk/*.ts`; `scripts/kernel-export-entries.json` →
  `scripts/sdk-export-entries.json` with rekeyed entries; `build-bundle.mjs`,
  `prepare-local-package.mjs`, `smoke-checkout-free.mjs`, and the hosts/ns test
  surfaces tied to the fold (`test/ns-cli.test.ts` `KernelExportSurface` /
  `kernelExportSurfaces()` / barrel-exhaustiveness test); the release tooling's fold
  side, including `rewriteKernelImports`, `assertKernelExports`, the `./kernel/`
  prefix, `criticalKernelExports`, all four public-subpath identifiers and their
  importers, plus the consumer-smoke strings and the `NS_KERNEL_KEEP_SMOKE_DIR` →
  `NS_SDK_KEEP_SMOKE_DIR` environment variable.
- **Scope facts:** 4 folded entries; script hit counts as dated above.
- **Ride-alongs:** the root `CONTEXT.md` "Checkout-free distribution" and "Package
  preparation" entries' folded-path claims (`@nseng-ai/ns/kernel/*` →
  `@nseng-ai/ns/sdk*`) ride this slice so the glossary never claims a state the code
  does not have.
- **Verification:** `just` green; `rg 'ns/kernel'` over live source returns nothing;
  `smoke-checkout-free.mjs` passes (or its failure is a STOP, not a widen).

### 4. Vocabulary and docs rewrite — `kernel-sdk-rename/glossary-and-docs`

- **Change:** sdk-throughout prose per ADR 0035 decision 4: root `CONTEXT.md`
  kernel-bearing entries reword to "the SDK" ("implementations hidden in the SDK",
  "SDK-loaded CLI/Pi commands", "SDK extension descriptor loading", "SDK subpath
  folding") — the eleven live lines enumerated in the inventory above, including the
  Point catalog entry and the Extension / cmux capability Avoid lines;
  `CONTEXT-MAP.md`; full rewrite of `ts/packages/sdk/CONTEXT.md` and `README.md`;
  prose of `sdk-reference.md` and `writing-an-ns-extension.md`; `hosts/ns/README.md`;
  in-package and guide docs (`ts/packages/README.md`, `hosts/pi/AGENTS.md`,
  `capabilities/slots/README.md`, `capabilities/reviews/CONTEXT.md`,
  `capabilities/harness-artifacts/README.md`, `docs/guides/points.md:8,21`,
  `docs/README.md:20`, `docs/conventions/subpackage-conventions.md:22`);
  `skills/architecture-topology-report/scripts/example-spec.mjs` label strings;
  live-source comments that use kernel as a concept (e.g.
  `zod-issue-path.ts` "Kernel-local", `tier-directory-projection.ts:13`). Add `kernel`
  to the relevant Avoid lists (anti-vocabulary, like CCC).
- **Scope facts:** prose hit counts as dated above.
- **Ride-alongs:** this item *is* the doc work; no code changes beyond comments.
- **Verification:** `just` green (dprint via `just dprint-fix`); a word-boundary
  `kernel` grep over live docs/source returns only hits classified as deliberate
  (Avoid-list entries, historical references).

### 5. Closeout — on the top slice, no new branch

- **Change:** trust-nothing sweep: final word-boundary `kernel`/`Kernel` grep over live
  source with every hit accounted (migrated, Avoid term, guard/fixture, historical,
  explicit out-of-scope); scope-diff justification of each slice against its item's
  enumeration; confirmation no submit/push happened and no `[cp]` commits exist.
  Accounting fixes may commit on the top slice.
- **Verification:** `just` green on the top slice; the accounted inventory is recorded
  in the executing Objective's closure evidence.

## Operator's-own-hands items

- **npm registry:** claim/publish `@nseng-ai/sdk` and optionally deprecate
  `@nseng-ai/kernel@0.1.2` at the next publish. Never runner work.
- **`gt submit` / PR creation** for the stack after review.

## Parked and out of scope

- Internal `src/sdk/` directory layout and the internal `sdk` entry in
  `ns.subpackages` inside the renamed package: unchanged (no public surface; a purely
  internal restructure is a separate decision if ever wanted).
- `publishConfig` stays as-is; publishing policy is the operator item above.
- Immutable history keeps kernel wording (boundary above).
- The "SDK boundary" phrase (prose in `CONTEXT.md:179` and `CONTEXT-MAP.md:95`; not a
  glossary entry) stays; item 4 rewords it only as needed for coherence with the
  literal package.
- Kernel-named exported type aliases — `KernelCommandCompletionCandidate` /
  `Provider` / `Request` / `Result` in `kernel/src/sdk/command.ts:40-50` with the
  `NsCommandCompletionProvider` alias (`:133`), re-exported by the sdk barrel
  (`index.ts:13-16`) and the hosts/ns fold (`src/kernel/sdk.ts:63-66`), documented in
  `sdk-reference.md` — stay as-is: an exported-identifier rename is a separate
  API-naming decision not ratified by ADR 0035. The closeout classifies these hits as
  explicit out-of-scope.
- No compatibility aliases, shims, or deprecation re-exports for any kernel name.
