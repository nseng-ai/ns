---
name: ns-typescript
description: "TypeScript overlay for ns-style projects. Use when editing or reviewing TS in this repo: tsconfig baseline, pnpm/Vitest/oxlint/oxfmt/native tsc commands, relative .ts imports, workspace subpath exports, and the exactOptionalPropertyTypes spread idiom. Repo-specific enforcement (test lanes, time seams, style guard) lives in the host repo's AGENTS.md."
references:
  - references/internal-import-alternatives
---

# ns-typescript

Follow `typescript-style` for how TypeScript code reads. This skill is the project overlay:
toolchain, compiler baseline, import conventions, and construction idioms. It is written for reuse
in other projects that adopt the same stack; repo-specific enforcement — test-lane hard gates, the
time-seam package inventory, and the style-guard lane — is owned by the host repository's agent
instructions (in ns: `ts/AGENTS.md`).

Load this after `typescript-style` whenever the task touches TypeScript in this repository.

## Toolchain baseline

- Package manager: pnpm 11 in `ts/`.
- Runtime: Node 24.12 or newer.
- Dependency governance: pnpm catalog plus Syncpack via `just ts-deps-check`.
- Default tests: Vitest 4 via `pnpm --dir ts run test` or `just ts-test`; specialized integration,
  isolated, and TypeScript style guard lanes are explicit commands.
- Development typecheck: stable native TypeScript 7 / `tsc`, via `pnpm --dir ts run check` or `just ts-check`.
- Formatting: oxfmt via `pnpm --dir ts run fmt:check` / `just ts-format-check`; autofix with `pnpm --dir ts run fmt` / `just ts-format-fix`.
- Linting: oxlint via `pnpm --dir ts run lint` / `just ts-lint`; autofix with `pnpm --dir ts run lint:fix` / `just ts-lint-fix`.
- Repo Markdown/TOML formatting remains dprint via `dprint check` / `just dprint-check`; autofix with `just dprint-fix`.

## Compiler baseline

`ts/tsconfig.json` is intentionally strict and strip-only. Treat these settings as the project contract:

- `target: "ES2024"`
- `lib: ["ES2024"]`
- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
- `allowImportingTsExtensions: true`
- `verbatimModuleSyntax: true`
- `isolatedModules: true`
- `erasableSyntaxOnly: true`
- `noEmit: true`
- `skipLibCheck: true`
- `moduleDetection: "force"`
- `noFallthroughCasesInSwitch: true`
- `noImplicitOverride: true`
- `noUncheckedSideEffectImports: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `forceConsistentCasingInFileNames: true`

The unused-local and unused-parameter flags are deliberately stricter than many WIP workflows. Prefer
small, complete changes that leave no dead scaffolding.

## Import convention

- Intra-package imports are relative and include the explicit `.ts` suffix:
  `../failures.ts`, `./models.ts`.
- Cross-package imports use curated workspace package exports, for example
  `@nseng-ai/foundation/primitives`, `@nseng-ai/foundation/exec`, and `@nseng-ai/clinkr/raw`.
- Do not deep-import another package's `src/` tree.
- Do not add root-only barrels that hide ownership. Prefer explicit subpath exports for public package
  surfaces.

The `#`-subpath import alternative is documented in
`references/internal-import-alternatives.md`; it is not the current standard and should not be migrated
opportunistically.

## Optional properties under `exactOptionalPropertyTypes`

When conditionally including an optional property, use object spread to omit the key entirely when the
value is `undefined`:

```ts
const options = {
  cwd: request.cwd,
  ...(request.env === undefined ? {} : { env: request.env }),
};
```

This is intentional. Do not copy rules from projects that ban this pattern unless they also share
ns `exactOptionalPropertyTypes` contract. Under this setting, `{ env: undefined }` is not equivalent
to omitting `env`.

Preferred review fix: when a finding is caused by `prop: maybeUndefined`, rewrite construction to omit
the key instead of widening the field type just to make the object literal type-check or silence review:

```ts
const item = {
  name,
  ...(description === undefined ? {} : { description }),
};
```

Use these type shapes deliberately:

- `foo?: T` means omission is the state; if the key is present, the value is a real `T`.
- `foo: T | undefined` means the key is part of the shape, but the value may be unavailable.
- Raw `foo?: T | undefined` is suspicious unless explicit present-key `undefined` is a meaningful contract.
- Permanent explicit-undefined support should be expressed as `foo?: ExplicitUndefined<Reason, T>` from
  `@nseng-ai/foundation/primitives`.

`ExplicitUndefined<Reason, T>` is for permanent API/input/compatibility/external contracts, such as env
maps, abort-signal seams, external schema mirrors, null-tolerant inputs, key-event payloads,
overload selectors, or deliberate DI seams. It is not a convenience escape hatch for object
construction sites.

Review guidance:

- For domain, context, result, command metadata, registry/catalog entry, and durable record objects,
  prefer `foo?: T` plus omission on construction; question raw `?: T | undefined` unless explicit
  `undefined` is a meaningful present-key state.
- If construction code can omit the field with object spread, do that rather than widening the field type.
- Treat `?: T | undefined` as an API contract, not a convenience escape hatch.
- If every consumer expects the property to exist and checks the value, prefer `foo: T | undefined`.
- Do not turn this into a blanket ban: option/input/override/compatibility bags can legitimately accept
  explicit `undefined`, but do not widen `foo?: T` to raw `foo?: T | undefined`; if explicit `undefined`
  is truly permanent, use `ExplicitUndefined<Reason, T>`.
- Construction code should still omit optional keys via conditional spread unless present-key
  `undefined` is part of the contract.

## Encoded contracts over ambient bags

Follow the portable `typescript-style` rule: first-party dependencies must be encoded as typed
fields, parameters, gateway methods, or curated APIs instead of implicit string-keyed bags.
In ns, extension API dynamic data remains available only for genuinely project-local or
extension-owned dynamic data. Do not use it to transport first-party SDK/capability values between
packages; promote those values to typed SDK fields, Capability API parameters, or gateway seams. For
example, prefer `ctx.renderCapabilities: RenderCapabilities` over
`ctx.extensions?.["ns.clinkr.caps"]`.

## Time seams

Production code does not hand-roll raw timers or wall-clock reads: inject clock and timer-scheduler
seams and drive them with manual test helpers in default tests. The host repo's AGENTS.md owns the
package-level seam inventory and the enforcement ban (in ns: `ts/AGENTS.md` "Time seams",
`NS_TS_BAN_RAW_PRODUCTION_TIMERS`).

## Test lanes and shared-cache safety

Default tests are fake-driven. Real adapter/runtime boundaries belong under `test/integration/`;
tests whose subject genuinely requires ambient Vitest module state or process-global state belong
under `test/isolated/`. Isolation is not a synonym for integration or a general slow-test lane;
first prefer injected dependencies, gateways, manual time helpers, explicit env/cwd, or a narrow
owned lifecycle seam. The shared-lane hard bans, per-ban remediation, lane commands, and CI split
are owned by the host repo's AGENTS.md (in ns: `ts/AGENTS.md` "Test isolation hard gates") with
placement detail in `ts/TESTING.md`.

## Style-guard enforcement

Rule semantics and preferred fixes for the mechanical hard bans — `as unknown as` laundering,
first-party import aliases, empty interface extension, imported-binding local aliases — live in
`typescript-style` (`core-rules.md`, `checklist.md`). The host repo's AGENTS.md owns the enforced-id
inventory and the guard-lane command (in ns: `ts/AGENTS.md` "TypeScript style guard",
`just ts-test-typescript-style-guard`).

Run the TypeScript validation gates before declaring TypeScript work done:

```bash
just ts-deps-check
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-isolated
just ts-test-typescript-style-guard
```
