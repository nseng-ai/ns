# TypeScript Agent Instructions (`ts/`)

Rules for working under `ts/`, the pnpm workspace holding the ns first-party TypeScript packages. Read this before editing any `.ts` file here. Deeper packages may add their own nested `AGENTS.md` (for example `ts/packages/incubator/herdr/AGENTS.md`); read the nearest applicable one as well. Repo-wide rules and orientation live in the root `AGENTS.md`.

## TypeScript

- Before TypeScript work, read `.agents/skills/typescript-style/SKILL.md` and `.agents/skills/ns-typescript/SKILL.md`.
- Typecheck with the native TypeScript 7 `tsc`: `just ts-check` or `pnpm --dir ts run check`.
- `ts/` package tests are Vitest-backed; default to the full TS validation suite rather than asking to narrow scope.
- Do not add Bun-runner package tests. Only standalone Bun templates/projects may use Bun tests, and then run `bun test --sequential`.

## Test isolation hard gates

The default, integration, and TypeScript style guard lanes share the Vitest module cache. Outside
`test/isolated/`, the TypeScript style guard enforces these hard bans:

- `NS_TS_BAN_SHARED_TEST_MODULE_STATE`: no `vi.mock` / `doMock` / `unmock` / `doUnmock` /
  `resetModules`; inject fakes/gateways instead.
- `NS_TS_BAN_SHARED_TEST_FAKE_TIMERS`: no `vi.useFakeTimers` or `vi.useRealTimers`; inject
  `TimerScheduler` and use `createManualTimerScheduler()`.
- `NS_TS_BAN_SHARED_TEST_PROCESS_MUTATION`: no direct `process.env` assignment/deletion or
  `process.chdir`; pass env/cwd explicitly or use `vi.stubEnv()`.
- `NS_TS_BAN_SHARED_TEST_GLOBAL_LISTENERS`: no process-global listener mutation; inject an event
  source.
- `NS_TS_BAN_SHARED_TEST_SINGLETON_STATE`: no module-global Graphite metadata worker lifecycle;
  inject an owned worker seam.

Shared Vitest configuration automatically restores mock functions/spies and values stubbed with
`vi.stubEnv()` / `vi.stubGlobal()`; that does not make direct process, module-cache, fake-timer,
listener, or singleton mutation safe. Put only tests whose subject genuinely requires ambient
module/process behavior under `test/isolated/`; this is distinct from `test/integration/`, which is
for real adapter/runtime boundaries. Run isolated tests with `just ts-test-isolated`. The default
`just` entrypoint deliberately omits isolated tests; CI runs them in a separate job. See `ts/TESTING.md`
for placement, automatic restore behavior, and the remediation hierarchy.

## Package and subpackage structure

Before creating a workspace package, declaring or renaming `ns.subpackages` entries, adding `exports` subpaths to a container package, or restructuring a package's `src/` layout, read `docs/conventions/subpackage-conventions.md` (rank test, subpackage kinds, importer rules; decisions in ADR 0022/0023).

## Time seams

Do not add raw production `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, or wall-clock reads in ji-owned TypeScript logic. Inject/use `Clock` from `@nseng-ai/foundation/clock` for wall-clock reads and `TimerScheduler` / `ScheduledTimer` from `@nseng-ai/foundation/timers` for scheduling, cancellation, and awaited delays. Concrete system adapters (`systemClock`, `systemTimerScheduler`) live in `@nseng-ai/foundation/time`; manual test fakes (`createManualClock()`, `createManualTimerScheduler()`, and related harnesses) live in `@nseng-ai/foundation/time/testing`. Use `unrefTimerScheduler` from `@nseng-ai/pi/shared/timers` for Pi host background timers that must not keep the process alive. Raw timers belong in timer adapter modules or narrowly justified tests/integration smoke; the TypeScript style guard rejects raw production timers and `node:timers/promises` imports outside those homes (`NS_TS_BAN_RAW_PRODUCTION_TIMERS`).

## TypeScript style guard

`just ts-test-typescript-style-guard` mechanically enforces the typescript-style hard rules; rule
semantics and preferred fixes live in `.agents/skills/typescript-style/` (`core-rules.md`,
`checklist.md`). Mechanically enforced ids: `NS_TS_BAN_AS_UNKNOWN_AS`,
`NS_TS_BAN_IMPORT_ALIAS_FOR_FIRST_PARTY`, `NS_TS_BAN_EMPTY_INTERFACE_EXTENDS`,
`NS_TS_BAN_RAW_PRODUCTION_TIMERS`, plus the five shared-test bans above.
`NS_TS_BAN_IMPORTED_BINDING_LOCAL_ALIAS` is review-only — legitimate constants share the same AST
shape, so do not work around alias bans with `const LocalName = ImportedName`.

## Formatting and validation

- Use autofixers instead of hand-editing formatter output, then rerun validation:
  - TypeScript formatting failures → `just ts-format-fix`
  - Autofixable TypeScript lint failures → `just ts-lint-fix`
- Hand-edit only real lint/type/test bugs the autofixer cannot fix.

## CLI work

Before designing, authoring, or reviewing CLI commands, command groups, `exec` subgroups, machine output, exit/error behavior, or destructive flows, read `skills/ns-cli-design/SKILL.md`. Ambient CLI hard gates:

- CLI scenario tests must cover `--version`, `--runtime`, and `-h` when those surfaces are part of the user-facing contract.
- Skill/agent-only commands must live under a nested `exec` `ClinkrGroup` constructed with `isHidden: true`; keep top-level `--help` human-focused.
