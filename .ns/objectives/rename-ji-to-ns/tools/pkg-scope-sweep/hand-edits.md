# PR-5 hand edits (ji → ns internal sweep)

Direct-edit checklist executed by the orchestrator after `git-moves.sh`,
`manifest-rewrite.ts --write`, and `codemod.ts --write`. Every anchor below was
verified against the tree on 2026-07-03 (pre-phase-1; line numbers may drift
±a few lines after PR-4's content edits — re-anchor by the quoted code, not
the number). The codemod only rewrites *specifier-shaped string literals*;
everything here is a bare identifier, object key, non-specifier string, or
markdown prose it deliberately cannot touch.

## 1. Kernel extension-manifest schema and discovery (`manifest.ji` → `manifest.ns`)

- `ts/packages/kernel/src/sdk/extension-manifest.ts:20` — schema property
  `ji: sdlExtensionManifestSchema.optional()` → `ns:`. (The stale
  `sdlExtensionManifest*` / `SdlExtensionManifest*` identifier family is a
  PR-6 candidate; rename only if fan-out is small.)
- `ts/packages/kernel/src/extensions/discovery.ts`
  - `:82` `ManifestStructureIssueKind = "missing-ji" | ...` → `"missing-ns"`
  - `:85-87` classifier rows: `value: "missing-ji"` (x2), `pattern: ["ji"]`,
    `pattern: ["ji", "commands"]` → `ns`
  - `:218` `resolution.manifest.ji?.commands` → `.ns?.commands`
  - `:287-304` `manifest.ji`, `manifest.ji.group`, `manifest.ji.description`,
    `manifest.ji.commands` → `.ns`
  - `:337` `if (kind === "missing-ji")` (also calls stale
    `missingSdlDiagnostic` — rename to ns-neutral while here if trivial)
  - `:348` diagnostic code `"extension_manifest_missing_ji"` →
    `"extension_manifest_missing_ns"`
  - `:357` message `"Extension manifest ji.commands must be an array"` → `ns.commands`
- `ts/packages/kernel/src/runtime/module-loader.ts:67-69` —
  `join(CCC_SRC_DIR, "ji", "autoslot.ts" | "land.ts" | "trunk-pull.ts")` →
  `"ns"` (must match the `src/ji` → `src/ns` dir move).
  **Plan correction:** the plan cites `src/extensions/module-loader.ts`; the
  file actually lives at `src/runtime/module-loader.ts`.

## 2. Tests with bare `ji:` fixture object keys / manifest-key strings

Bare identifier keys in object literals — invisible to the string-literal codemod.

- `ts/packages/kernel/test/unit/extension-discovery.test.ts` — fixture `ji:`
  keys at `:43,88,123,146,172,215,245,259,261,275,288,315,333`; fixture dir
  name `"missing-ji"` at `:84`; expected code
  `"extension_manifest_missing_ji"` at `:114,268`. (The `"bad-sdl"` fixture
  dir name at `:261` is old-brand test data; leave or sweep in PR-6.)
- `ts/packages/kernel/test/unit/sdk-runtime-exports.test.ts:135` fixture `ji:`
  key; `:154-156` `parsed.ji?.owner` / `parsed.ji?.commands` assertions.
- `ts/packages/kernel/test/scenario/cp-cli.test.ts:144,192,207` — fixture `ji:` keys.
- `ts/packages/kernel/test/scenario/handoff-cli-contract.test.ts:106` — fixture `ji:` key.
- `ts/packages/capabilities/address/test/scenario/extension-manifest.test.ts:9`
  zod shape key `ji: z.object(...)` → `ns:`; `:27` `manifest.ji.commands`.
- `ts/packages/capabilities/flow/test/land/api-boundary.test.ts:220` —
  `readonly ji: { readonly tier: "capability" }` → `readonly ns:`.

## 3. typescript-style-guard support (reads the real manifests' key)

- `ts/packages/infra/core/test/support/typescript-style-guard/package-metadata.ts:40,49,50`
  — `parsed.ji` (x3) → `parsed.ns`. (Stale `readRawSdlTier`/`sdlTier`/
  `sdlSubpackages`/`sdlRemainder` naming: PR-6 candidate.)
- `ts/packages/infra/core/test/support/typescript-style-guard/config.ts:71,75,79,83`
  — NUL-joined debt keys `"@ji/kernel\0@ji/slot"`,
  `"@ji/kernel\0@ji/capability-kit"`, `"@ji/brmem\0@ji/capability-kit"`,
  `"@internal/pi-tools\0@ji/capability-kit"`: rename **both** halves' `@ji/` →
  `@ns/`. The codemod's NUL guard skips these on purpose (a prefix rename
  would only rewrite the first half). Also the prose debt messages at
  `:72,76` mention `@ji/kernel` mid-string (not specifier-shaped).
- `ts/packages/infra/core/test/typescript-style-guard/typescript-style-guard.test.ts:1330,1366,1473`
  — bare `ji:` fixture keys → `ns:`. (This file's ~101 `@ji/` string
  literals ARE handled by the codemod; the deliberate `"sdl"` fixtures at
  `:1036,1081,1085` are old-brand test data — leave them.)

## 4. `ji.toml` reader literals (file moves to `ns.toml` in git-moves.sh)

roaster:

- `ts/packages/capabilities/roaster/src/gateways/local-diff.ts:115`
  `join(repoRoot, "ji.toml")`; `:123` error message `Failed to read ji.toml: ...`
- `ts/packages/capabilities/roaster/src/operations/review-run.ts:290`
  `join(repoRoot.value, "ji.toml")`; `:305` error message
- tests: `test/gateways/local-diff.test.ts:43`,
  `test/unit/project-config.test.ts:77,80`, `test/unit/review-run.test.ts:29`

areg:

- `ts/packages/tools/areg/src/gateways/project-gateway.ts:74`
  `inspectTextFile(path.join(projectDir, "ji.toml"))` (field `sdlToml` is
  doubly stale — rename to `nsToml` if the fan-out stays inside areg)
- `ts/packages/tools/areg/src/gateways.ts:333` `relativePath` union member `"ji.toml"`
- `ts/packages/tools/areg/src/gateways/mutation-policy.ts:70` allowlist entry `"ji.toml"`
- `ts/packages/tools/areg/src/operations/init.ts:344-356` write plan/labels (5 literals)
- `ts/packages/tools/areg/src/operations/project-agents.ts:25,97-102` pathLabel
  defaults; `:31,40,47,52` error code `"ji_toml_invalid"` → `"ns_toml_invalid"`
  (stale `parseSdlAregAgents` name: PR-6 candidate)
- `ts/packages/tools/areg/src/fake-gateways.ts:158,217` fake file-state keys
- tests: `test/gateways/real-gateways.test.ts:398`,
  `test/scenario/init-cli.test.ts:96,108,121,182,189,202,231,256,269,292`

## 5. Stale ccc bin path (pre-existing bug, fix in passing)

- `ts/packages/capabilities/ccc/package.json` — `"bin": {"ccc": "./src/sdl/cli.ts"}`
  points at a directory that no longer exists (`src/sdl` became `src/ji` in
  the last sweep and the bin value was missed). manifest-rewrite does not
  touch `sdl` values; hand-fix to `"./src/ns/cli.ts"`.

## 6. Brand-casing table

- `ts/packages/capabilities/roaster/src/core/skill-reviews.ts:44` — `ACRONYMS`
  entry `["ji", "JI"]` → `["ns", "NS"]` (the `["sdl", "SDL"]` row was kept
  last time for old skill names; apply the same judgment).

## 7. `@ji/*` import examples in docs and skills

From `git grep -l '@ji/' -- docs skills` (2026-07-03). Edit the live ones:

- `docs/aretro.md`
- `docs/conventions/subpackage-conventions.md` (also documents the `"ji"`
  manifest key itself — update key name and examples)
- `docs/pi/README.md`
- `docs/pi/branch-context-workflow.md`
- `docs/pi/cmux-extension-pattern.md`
- `docs/pi/extension-command-checklist.md`
- `docs/roaster-pierre-diffs.md`
- `skills/architecture-topology-report/SKILL.md` +
  `scripts/example-spec.mjs`, `scripts/extract-graph.mjs`,
  `scripts/synthesize-spec.mjs` (`.mjs` — outside the codemod's `.ts` scan)
- `skills/sdl-cli-design/SKILL.md` + `references/clinkr-api-map.md`
- `skills/sdl-typescript/SKILL.md`

After editing anything under `skills/`, regenerate `skills-lock.json` hashes.

Skip (history allowlist): `docs/adr/0026-rename-ji-to-ns.md`,
`docs/pi/ts-plans-design-retrospective.md`,
`docs/retros/cli-surface-conformance-audit.md` — retros/ADRs are frozen;
leftover branding is PR-6's row.

## 8. Verify-only (no hand edit expected)

- `.pi/lib/workspace-packages.ts:11` — the key
  `"@ji/pi/worktree-status/extension"` is specifier-shaped and the codemod
  rewrites it (confirmed in dry run). Just confirm post-run.
