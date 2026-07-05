# TypeScript Agent Instructions (`ts/`)

Rules for working under `ts/`, the pnpm workspace holding ji's first-party TypeScript packages. Read this before editing any `.ts` file here. Deeper packages may add their own nested `AGENTS.md` (for example `ts/packages/capabilities/ccc/AGENTS.md`); read the nearest applicable one as well. Repo-wide rules and orientation live in the root `AGENTS.md`.

## TypeScript

- Before TypeScript work, read `.agents/skills/typescript-style/SKILL.md` and `.agents/skills/ns-typescript/SKILL.md`.
- Typecheck only through tsgo: `just ts-check` or `pnpm --dir ts run check`.
- `ts/` package tests are Vitest-backed; default to the full TS validation suite rather than asking to narrow scope.
- Do not add Bun-runner package tests. Only standalone Bun templates/projects may use Bun tests, and then run `bun test --sequential`.

## Package and subpackage structure

Before creating a workspace package, declaring or renaming `ns.subpackages` entries, adding `exports` subpaths to a container package, or restructuring a package's `src/` layout, read `docs/conventions/subpackage-conventions.md` (rank test, subpackage kinds, importer rules; decisions in ADR 0022/0023).

## Time seams

Do not add raw production `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, or wall-clock reads in ji-owned TypeScript logic. Inject/use `Clock` from `@nseng-ai/core/clock` for wall-clock reads and `TimerScheduler` / `ScheduledTimer` from `@nseng-ai/core/timers` for scheduling, cancellation, and awaited delays. Concrete system adapters (`systemClock`, `systemTimerScheduler`) live in `@nseng-ai/core/time`; manual test fakes (`createManualClock()`, `createManualTimerScheduler()`, and related harnesses) live in `@nseng-ai/core/time/testing`. Use `unrefTimerScheduler` from `@nseng-ai/pi/shared/timers` for Pi host background timers that must not keep the process alive. Raw timers belong in timer adapter modules or narrowly justified tests/integration smoke.

## Formatting and validation

- Use autofixers instead of hand-editing formatter output, then rerun validation:
  - TypeScript formatting failures → `just ts-format-fix`
  - Autofixable TypeScript lint failures → `just ts-lint-fix`
- Hand-edit only real lint/type/test bugs the autofixer cannot fix.

## CLI work

Before designing, authoring, or reviewing CLI commands, command groups, `exec` subgroups, machine output, exit/error behavior, or destructive flows, read `skills/ns-cli-design/SKILL.md`. Ambient CLI hard gates:

- CLI scenario tests must cover `--version`, `--runtime`, and `-h` when those surfaces are part of the user-facing contract.
- Skill/agent-only commands must live under a nested `exec` `ClinkrGroup` constructed with `isHidden: true`; keep top-level `--help` human-focused.
