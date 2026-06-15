# Plan 001: Add unit tests for sdl command discovery, validation, and runtime module loading

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `shadcn-improve/plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat d637e619b..HEAD -- ts/packages/sdl/src/command-registry.ts ts/packages/sdl/src/sdk-module-loader.ts ts/packages/sdl/src/sdk.ts`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts below against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `d637e619b`, 2026-06-15

## Why this matters

`sdl` lets a project drop TypeScript command override files into
`.asdl/commands/*.ts`; `sdl` discovers them, validates their shape, transpiles
and loads them at runtime via `jiti`, and runs them. Two modules carry this
load-bearing behavior and currently have **zero** test references anywhere in
the repo: `command-registry.ts` (discovery + validation + execution) and
`sdk-module-loader.ts` (the `jiti` loader that injects the host SDK so the
override shares the host's `defineCommand`/`ok`/`failed` instance). A regression
in filename validation, schema validation, error messages, or SDK injection
would silently break user command overrides and only surface in manual CLI use.
This plan adds focused unit tests so those paths have an automated guard,
matching the coverage the package's other modules already have.

## Current state

Files in scope (read them before writing tests):

- `ts/packages/sdl/src/command-registry.ts` — discovery + validation + execution. Key exported functions:
  - `discoverProjectCommandNames(cwd)` — scans `<cwd>/.asdl/commands`, returns `{ ok: true, names }` or `{ ok: false, message }`. Returns empty names when the directory is absent; errors when the path is a non-directory; rejects filenames not matching `^[a-z][a-z0-9-]*$` (excluding `.d.ts`).
  - `validateSdlCommand(command, expectedName, commandPath)` — Zod-validates a loaded module's default export; name must equal `expectedName`.
  - `validateSdlResult(result, commandName)` — coerces an invalid command result into a `failed(...)` with exit code 2.
  - `executeSdlCommand(ctx, command, request)` — parses `request` against `command.schema`, runs `command.run`, validates the result, and converts thrown errors into `failed(...)`.
  - `loadSdlCommand(commandName, cwd)` — loads a project override if `<cwd>/.asdl/commands/<name>.ts` exists, else falls back to a built-in (`changes`/`cp`/`submit`), else `Unknown SDL command`.
  - `isBuiltInCommandName`, `listSdlCommandInfos`.

  Excerpt — discovery validation (lines 73–115):
  ```ts
  export function discoverProjectCommandNames(cwd: string): ProjectCommandDiscoveryResult {
    const commandsDirectory = projectCommandsDirectory(cwd);   // <cwd>/.asdl/commands
    if (!existsSync(commandsDirectory)) {
      return { ok: true, names: [] };
    }
    // ... statSync → "must be a directory" on non-dir
    // ... readdirSync, for each *.ts (not *.d.ts) file:
    const stem = entry.name.slice(0, -".ts".length);
    if (!PROJECT_COMMAND_NAME_PATTERN.test(stem)) {   // /^[a-z][a-z0-9-]*$/
      return { ok: false, message: `Invalid SDL command module filename: ${...}` };
    }
    commandNames.add(stem);
    // returns { ok: true, names: [...commandNames].sort() }
  }
  ```

  Excerpt — result validation (lines 201–211):
  ```ts
  export function validateSdlResult(result: unknown, commandName: string): SdlResult {
    const parsed = sdlResultSchema.safeParse(result);
    if (parsed.success) return parsed.data;
    if (hasInvalidFailureExitCode(parsed.error.issues)) {
      return failed(`Command ${commandName} returned an invalid failure result.`, 2);
    }
    return failed(`Command ${commandName} returned an invalid result.`, 2);
  }
  ```
  `sdlResultSchema` (lines 68–71) is a discriminated union on `ok`:
  `{ ok: true, message: string }` or `{ ok: false, exitCode: number, message: string }`.

- `ts/packages/sdl/src/sdk-module-loader.ts` — the runtime loader (full file is 78 lines).
  ```ts
  export async function loadSdkCommandModule(modulePath: string): Promise<unknown> {
    const jiti = createJiti(import.meta.url, {
      alias: { [SDK_SPECIFIER]: SDK_MODULE_PATH },   // SDK_SPECIFIER = "@asdl/sdl/sdk"
      moduleCache: false,                            // fresh load each call
      virtualModules: { [SDK_SPECIFIER]: sdlSdk },   // inject THIS process's SDK instance
    });
    return jiti.import(modulePath, { default: true });
  }
  ```
  The point of `virtualModules` is **SDK identity**: an override file that does
  `import { defineCommand, ok } from "@asdl/sdl/sdk"` gets the host's exact SDK
  object, not a copy from the user's `node_modules`. `moduleCache: false` means
  editing the file and reloading picks up the new contents.

- `ts/packages/sdl/src/sdk.ts` — the SDK surface a command file imports. Relevant exports:
  - `defineCommand(command)` — identity-ish factory returning the command.
  - `ok(message): SdlResult` → `{ ok: true, message }`.
  - `failed(message, exitCode = 1): SdlResult` → `{ ok: false, exitCode, message }`.
  - `z` (re-exported from `zod`), `type SdlContext` (has `cwd: string`, plus I/O members), `type SdlResult`, `defineCommand` overloads.

### Conventions to match

- **Test layout**: unit tests live in `ts/packages/sdl/test/unit/`. Model new
  files structurally on `ts/packages/sdl/test/unit/checkpoint-message.test.ts`
  (real file). Its shape:
  ```ts
  import { describe, expect, test } from "vitest";
  import { validateCheckpointMessage } from "../../src/checkpoint-message.ts";

  describe("validateCheckpointMessage", () => {
    test("accepts a minimal valid message with one bullet", () => {
      const result = validateCheckpointMessage(validOneBullet);
      expect(result.ok).toBe(true);
      if (result.ok) { expect(result.message.subject).toBe("[cp] Update checkpoint tests"); }
    });
  });
  ```
  Note the imports use the `.ts` suffix and relative paths into `../../src/`.
- **TypeScript style** (`.agents/skills/typescript-style/core-rules.md`): no
  `any` (none exists in this package — keep it that way; use `unknown` + narrowing),
  `function` declarations for module-level test helpers, errors-as-values are
  asserted by switching on the discriminant (`result.ok` / `result.type`).
- **Temp directories**: there is no shared temp-dir fixture in this package.
  Use Node built-ins directly: `mkdtempSync(join(tmpdir(), "sdl-cmd-"))` from
  `node:fs` + `node:os`, write fixture files with `writeFileSync`/`mkdirSync`,
  and clean up in an `afterEach` with `rmSync(dir, { recursive: true, force: true })`.
- Do **not** add new dependencies. `jiti`, `zod`, and `vitest` are already present.

## Commands you will need

| Purpose                       | Command                                                                                                                                   | Expected on success               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Typecheck this package        | `cd /Users/schrockn/code/asdl-tools/ts/packages/sdl && pnpm run check`                                                                    | exit 0, no tsc errors             |
| Run this package's tests      | `pnpm --dir /Users/schrockn/code/asdl-tools/ts/packages/sdl run test`                                                                     | all pass, including the new tests |
| Run one new file              | `pnpm --dir /Users/schrockn/code/asdl-tools/ts exec vitest run --config vitest.config.ts packages/sdl/test/unit/command-registry.test.ts` | pass                              |
| Install (if a fresh checkout) | `pnpm --dir /Users/schrockn/code/asdl-tools/ts install`                                                                                   | exit 0                            |

If `pnpm run check` or `run test` fails with "command not found" or missing
modules, run the install command once, then retry.

## Scope

**In scope** (the only files you should create):

- `ts/packages/sdl/test/unit/command-registry.test.ts` (create)
- `ts/packages/sdl/test/unit/sdk-module-loader.test.ts` (create)

**Out of scope** (do NOT modify):

- Any file under `ts/packages/sdl/src/` — this is a test-only plan. If a test
  reveals a real bug in source, that is a STOP condition (report it; do not fix
  it here).
- The built-in command definitions and other packages.

## Git workflow

- Branch: `advisor/001-sdl-command-tests` (create with `gt create` per the repo's Graphite convention, or a plain branch if you are executing outside Graphite).
- Commit message style matches recent history (short imperative subject, e.g. `Add unit tests for sdl command discovery and loader`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Test `command-registry.ts` pure/validation functions

Create `ts/packages/sdl/test/unit/command-registry.test.ts`. Import from
`../../src/command-registry.ts` and `../../src/sdk.ts`. Cover:

- `discoverProjectCommandNames`:
  - absent directory → `{ ok: true, names: [] }` (point `cwd` at a fresh temp dir with no `.asdl`).
  - directory with valid `.ts` files (e.g. `deploy.ts`, `cp.ts`) → `{ ok: true, names: ["cp", "deploy"] }` (sorted).
  - `.d.ts` files are ignored; non-`.ts` files ignored; subdirectories ignored.
  - an invalid filename (e.g. `Bad_Name.ts` or `1bad.ts`) → `{ ok: false }` with a message containing `must match [a-z][a-z0-9-]*`.
  - `.asdl/commands` existing as a **file** rather than a directory → `{ ok: false }` with a message containing `must be a directory`.
- `validateSdlCommand`:
  - a valid command object built with `defineCommand({ name: "x", description: "d", run: () => ok("done") })` and `expectedName: "x"` → `{ ok: true }`.
  - name mismatch (`expectedName: "y"`) → `{ ok: false }` with message containing `command name must be "y"`.
  - non-object / missing `run` → `{ ok: false }`.
- `validateSdlResult`:
  - a valid success result `{ ok: true, message: "hi" }` → returned unchanged.
  - an invalid result (e.g. `{ ok: false, message: "x" }` with no `exitCode`) → a `failed(...)` with `exitCode === 2` and message containing `invalid failure result`.
  - a totally malformed result (`{}`) → `failed(...)` with message containing `invalid result`.
- `isBuiltInCommandName`: `"cp"` → true; `"nope"` → false.
- `listSdlCommandInfos`: with no project names, returns the three built-ins
  (`changes`, `cp`, `submit`) sorted by name; with `projectCommandNames: ["zeta"]`,
  includes `zeta`.
- `executeSdlCommand` (use a minimal `SdlContext` — `cwd: "/tmp"` plus whatever
  the type requires; read `sdk.ts` lines 26–46 for the exact shape and stub the
  I/O members with no-op functions):
  - a command whose `run` returns `ok("done")` and an empty schema → `{ ok: true, message: "done" }`.
  - a command whose `run` throws → `failed(...)` with `exitCode === 2` and message containing the command name.
  - a request that fails schema validation (define a command with `schema: z.object({ count: z.number() })` and pass `{}`) → `failed(...)` with `exitCode === 2` and message containing `Invalid request`.

**Verify**: `pnpm --dir /Users/schrockn/code/asdl-tools/ts exec vitest run --config vitest.config.ts packages/sdl/test/unit/command-registry.test.ts` → all pass.

### Step 2: Test `sdk-module-loader.ts` runtime loading + SDK identity

Create `ts/packages/sdl/test/unit/sdk-module-loader.test.ts`. This test writes a
real TypeScript command file into a temp dir and loads it through
`loadSdkCommandModule`, proving that (a) the file transpiles and loads, (b) the
injected `@asdl/sdl/sdk` resolves even though the temp dir has no `node_modules`,
and (c) `moduleCache: false` means an edited file reloads fresh.

Pattern for the fixture file content (write with `writeFileSync`):

```ts
import { defineCommand, ok } from "@asdl/sdl/sdk";
export default defineCommand({
  name: "demo",
  description: "demo command",
  run: () => ok("loaded-v1"),
});
```

Cover:

- **Loads and is valid**: write the fixture as `<tmp>/demo.ts`, call
  `await loadSdkCommandModule(path)`, then pass the result through
  `validateSdlCommand(result, "demo", "demo.ts")` (import from
  `../../src/command-registry.ts`) → `{ ok: true }`. Then run the command via
  `executeSdlCommand(ctx, loaded.command, {})` → `{ ok: true, message: "loaded-v1" }`.
  (That the import resolved at all is the SDK-injection proof — the temp dir has
  no `@asdl/sdl` in `node_modules`.)
- **`moduleCache: false` reloads**: load once (expect `loaded-v1`), overwrite the
  same path with `run: () => ok("loaded-v2")`, load again → second load runs and
  yields `loaded-v2`. (If this proves flaky due to jiti internals, see STOP
  conditions — do not weaken the assertion to make it pass.)
- **Bad module throws**: write a file with a syntax error (e.g. `export default (`),
  and assert `loadSdkCommandModule(path)` rejects (use `await expect(...).rejects.toThrow()`).
  This documents the contract that callers must wrap it in try/catch (see
  `loadSdlCommand` lines 141–158).

Clean up temp dirs in `afterEach`.

**Verify**: `pnpm --dir /Users/schrockn/code/asdl-tools/ts exec vitest run --config vitest.config.ts packages/sdl/test/unit/sdk-module-loader.test.ts` → all pass.

### Step 3: Typecheck and full-package test

**Verify**:

- `cd /Users/schrockn/code/asdl-tools/ts/packages/sdl && pnpm run check` → exit 0.
- `pnpm --dir /Users/schrockn/code/asdl-tools/ts/packages/sdl run test` → all pass (existing + new).

## Test plan

- New file `test/unit/command-registry.test.ts`: cases enumerated in Step 1
  (discovery happy path + 3 error paths, validation happy + mismatch + malformed,
  result coercion, built-in lookup, info listing, execute happy + throw + bad request).
- New file `test/unit/sdk-module-loader.test.ts`: load-and-validate, reload-on-edit,
  throw-on-bad-module (Step 2).
- Structural pattern: `test/unit/checkpoint-message.test.ts`.
- Verification: the two `vitest run` commands above, then the full-package
  `run test`.

## Done criteria

ALL must hold:

- [ ] `cd /Users/schrockn/code/asdl-tools/ts/packages/sdl && pnpm run check` exits 0.
- [ ] `pnpm --dir /Users/schrockn/code/asdl-tools/ts/packages/sdl run test` exits 0; the two new files run and pass.
- [ ] `git status --porcelain` shows only the two new test files added (no source files modified).
- [ ] `shadcn-improve/plans/README.md` status row for 001 updated to DONE.

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts don't match the live code (drift since `d637e619b`).
- A test you wrote to document *correct* behavior fails because the source is
  actually wrong — report the suspected bug; do not edit source to make the test pass.
- `loadSdkCommandModule` cannot resolve `@asdl/sdl/sdk` from a temp dir in the
  test environment (e.g. jiti behaves differently under vitest) — report it; the
  fix may require a different fixture strategy, which is a design decision.
- The reload-on-edit assertion (Step 2) is irreducibly flaky — report it rather
  than deleting the assertion.
- Writing a test would require touching any `src/` file.

## Maintenance notes

- If the SDK injection mechanism in `sdk-module-loader.ts` changes (e.g. dropping
  `virtualModules` for `alias`-only resolution), the identity assertion in Step 2
  must be revisited.
- If `PROJECT_COMMAND_NAME_PATTERN` or the built-in command set changes, update
  the discovery/listing assertions.
- Reviewer should confirm the tests assert on discriminant fields (`.ok`, `.type`,
  `.exitCode`, messages) rather than snapshotting whole objects, to stay robust to
  unrelated message wording tweaks.
  </content>
  </invoke>
