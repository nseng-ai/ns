# Kernel → SDK rename spec

Resolves the ontology-reshape roadmap row "Spec the kernel → sdk rename (grilling)",
2026-07-12. Rationale lives in ADR 0035; this spec is mechanics only — what changes, in
what order, and how to verify. Execution is owned by the `execute-kernel-sdk-rename-spec`
Objective (the reshaping handoff vehicle's New-Objective hatch).

## Landed vs. not

Nothing below is executed. As of 2026-07-12 the only landed artifacts are ADR 0035, this
spec, and the roadmap/tracking edits around them. Every item is an unexecuted decision.

## Volatile inventory (as of 2026-07-12; re-enumerate at execution)

- 182 `@nseng-ai/kernel/sdk` import lines and 263 total `@nseng-ai/kernel*` lines in
  `ts/packages/**/*.ts`, across 15 importer packages (all 11 capabilities,
  capability-kit, hosts/ns, hosts/pi, internal/typescript-style-guard, tools/areg) plus
  kernel itself.
- Kernel `package.json`: 12 export subpaths, `ns.tier: "sdk"`,
  `publicPluginApi: ["./sdk"]`, 11 internal workspace exports.
- `hosts/ns`: four folded exports `./kernel/{cli,command-io,context,sdk}` backed by
  `src/kernel/*.ts`, driven by `scripts/kernel-export-entries.json`; kernel references
  in `build-bundle.mjs` (5), `prepare-local-package.mjs` (7), `smoke-checkout-free.mjs`
  (4), `README.md` (2); `ns.subpackages` includes `kernel`.
- Runtime literal: `SDK_SPECIFIER = "@nseng-ai/kernel/sdk"` in
  `kernel/src/runtime/module-loader.ts` — the jiti `virtualModules` key extension
  modules resolve against at runtime.
- Style guard: `tier-directory-projection.ts` has `sdk: { kind: "exact-dir", dir:
  "kernel" }`; `package-tier-taxonomy.ts` carries a debt edge `from: "@nseng-ai/kernel"`;
  further hits in `config.ts` and `source-rules.ts`.
- Live surfaces outside `ts/packages/`:
  `skills/architecture-topology-report/scripts/example-spec.mjs` (10 lines),
  `docs/guides/points.md` (1), `ts/scripts/prepare-source-publish-package.mjs` (2
  `@nseng-ai/ns/kernel` literals).
- Prose: root `CONTEXT.md` ~11 kernel-bearing lines (incl. the Extension Stack,
  Intrinsic host service, SDK-provided, Runtime harness code, Capability, Capability
  Kit, Host-only Subpackage, Checkout-free distribution, and Package preparation
  entries), `CONTEXT-MAP.md` 11 lines, `kernel/CONTEXT.md` 28 hits, `kernel/README.md`
  20, `kernel/docs/sdk-reference.md` 24, `kernel/docs/writing-an-ns-extension.md` 11.
- npm: `@nseng-ai/kernel@0.1.2` published; `@nseng-ai/sdk` unclaimed; `@nseng-ai/ns@0.1.2`
  published.

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
  `@nseng-ai/sdk`; every importer's `package.json` dependency key; all
  `@nseng-ai/kernel*` specifiers via the two ordered pairs (author subpath imports
  become `@nseng-ai/sdk/sdk` temporarily — resolved by item 2); the module loader's
  `SDK_SPECIFIER` literal; style-guard projection `dir: "kernel"` → `dir: "sdk"` and the
  debt-edge `from` literal; `ts/packages/kernel` path references (own test script,
  root tsconfig/vitest wiring if present — re-enumerate); pnpm lockfile refresh.
- **Scope facts:** 263 import lines / 15 importer packages / 4 style-guard files, as
  dated above.
- **Ride-alongs:** none (prose waits for item 4; `CONTEXT.md`/`README.md`/`docs/` move
  with the directory unedited).
- **Verification:** `just` green; `rg '@nseng-ai/kernel'` and `rg 'ts/packages/kernel'`
  over live source return nothing; `ts/packages/sdk/` exists, old dir gone.

### 2. Author entry point becomes the package root — `kernel-sdk-rename/root-entry-point`

- **Change:** add `".": "./src/sdk/index.ts"` to exports, drop `"./sdk"`;
  `ns.publicPluginApi` → `["."]`; rewrite all `@nseng-ai/sdk/sdk` imports (the 182
  author-API lines) to `@nseng-ai/sdk`; module-loader `SDK_SPECIFIER` → `@nseng-ai/sdk`;
  update `skills/architecture-topology-report/scripts/example-spec.mjs` and
  `docs/guides/points.md` specifiers.
- **Scope facts:** 182 author-API lines as dated above; internal exports and the
  `./progress-phase-state` mapping unchanged.
- **Ride-alongs:** import-snippet lines in `sdk-reference.md`,
  `writing-an-ns-extension.md`, and READMEs rewrite mechanically (prose rewrite waits
  for item 4).
- **Verification:** `just` green; `rg '@nseng-ai/sdk/sdk'` returns nothing;
  `publicPluginApi` is `["."]`; extension loading works (`ns --help` resolves and a
  descriptor-loading test passes).

### 3. Checkout-free fold rename — `kernel-sdk-rename/rename-ns-fold`

- **Change:** `hosts/ns` exports `./kernel/{cli,command-io,context,sdk}` →
  `./sdk/{cli,command-io,context}` plus `./sdk` for the author API (the two ordered
  `ns/kernel` pairs); `src/kernel/*.ts` → `src/sdk/*.ts`;
  `scripts/kernel-export-entries.json` → `scripts/sdk-export-entries.json` with rekeyed
  entries; `build-bundle.mjs`, `prepare-local-package.mjs`, `smoke-checkout-free.mjs`,
  `ts/scripts/prepare-source-publish-package.mjs`; `ns.subpackages` `kernel` → `sdk`.
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
  folding"); `CONTEXT-MAP.md`; full rewrite of `ts/packages/sdk/CONTEXT.md` and
  `README.md`; prose of `sdk-reference.md` and `writing-an-ns-extension.md`;
  `hosts/ns/README.md`; live-source comments that use kernel as a concept. Add
  `kernel` to the relevant Avoid lists (anti-vocabulary, like CCC).
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
- The "SDK boundary" glossary term stays; item 4 rewords it only as needed for
  coherence with the literal package.
- No compatibility aliases, shims, or deprecation re-exports for any kernel name.
