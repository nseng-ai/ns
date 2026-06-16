# Exposing Pi Commands Through `asdl-dev`

This guide describes the consolidation pattern established by the `preview-url`, `cp`, `changes`, and `submit` work: durable repo-local developer commands should have one headless implementation in a native CLI, then be exposed in Pi under the project domain namespace through a thin command-surface adapter. Historical examples here use `asdl-dev`; pending-worktree inspection, checkpoint creation, and submit have since moved to primary native SDL mirrors (`sdl changes` / `/sdl:changes`, `sdl cp` / `/sdl:cp`, and `sdl submit` / `/sdl:submit`) plus nested `/sdl:code:*` aliases without `/code:*` compatibility aliases.

Use this when converting a Pi-only workflow into a command that humans, agents, scripts, and tests can all run outside Pi.

In this guide, **mirror** means “register the CLI command table as Pi slash commands.” It does not mean maintaining parallel CLI and Pi implementations.

## Consolidation model

The goal is one implementation with multiple entrypoints:

```text
headless workflow logic -> native CLI -> domain-specific Pi command surface
```

Consolidation has three rules:

1. **The CLI owns durable behavior.** The native CLI owns argument parsing, help text, gateway-backed workflow decisions, stdout/stderr, exit codes, and CLI scenario tests.
2. **Pi owns only the runtime surface.** The Pi adapter waits for idle, tokenizes slash-command args, calls `runCli()`, captures stdout/stderr, passes generic runtime UI capabilities such as confirmation prompts when available, and displays the result. It should not reimplement workflow decisions.
3. **Duplicate public surfaces are temporary migration scaffolding.** Once the CLI path covers the behavior, remove the old `pi.registerCommand()` call, legacy aliases, and tests for the former Pi-only implementation.

Do not add a new Pi command first and later make the CLI shell out to Pi. Pi should be a runtime surface over the CLI, not the canonical implementation for headless developer tasks.

## Harness-neutral references

Durable documentation, saved implementation plans, public skills, and agent-facing instructions should cite the native CLI command when a workflow has both a CLI and a Pi slash-command adapter. This keeps the instruction usable by Pi, Claude Code, Codex, shell-only agents, humans, and tests.

Use harness-specific command names only when the subject is that runtime surface itself: registration, command discovery, UI behavior, slash-command argument restoration, or Pi-only session semantics. Otherwise, describe the adapter as secondary to the CLI. For pending-worktree inspection, checkpoint creation, and submit, write `sdl changes`, `sdl cp`, or `sdl submit` in plans and docs; mention `/sdl:*` or `/sdl:code:*` only when discussing the Pi adapter over the SDL command.

## What the migrations established

The stack around `asdl-dev preview-url`, former `asdl-dev cp`, and former `asdl-dev submit` created this boundary. SDL hard-cutover slices now apply the same pattern through `sdl changes` / `/sdl:changes`, `sdl cp` / `/sdl:cp`, and `sdl submit` / `/sdl:submit`:

- `ts/packages/asdl-dev/` owns remaining `asdl-dev` CLI parsing, help text, gateway-backed workflow logic, stdout/stderr output, exit codes, and CLI scenario tests.
- `ts/packages/sdl/` owns native pending-worktree inspection, checkpoint CLI parsing, and checkpoint workflow behavior.
- `ts/packages/asdl-dev/src/cli.ts` and `ts/packages/sdl/src/cli.ts` own command tables and export command metadata for Pi adapters.
- `ts/packages/pi-extensions/src/asdl-dev-extension.ts` reads the remaining `asdl-dev` command table and registers commands under the Pi namespace chosen for their domain: `/dev:preview-url` for preview URL lookup and `/code:pr-regen` for the remaining unported PR-description workflow.
- `ts/packages/pi-extensions/src/sdl-extension.ts` reads the `sdl` command table and registers primary `/sdl:changes`, `/sdl:cp`, and `/sdl:submit` mirrors plus nested `/sdl:code:changes`, `/sdl:code:checkpoint`, and `/sdl:code:submit` aliases for SDL-owned workflows.
- `ts/packages/pi-extensions/src/cli-command-extension.ts` is the generic Pi adapter: it waits for Pi to become idle, tokenizes slash-command args, invokes `runCli()`, passes generic UI capabilities such as confirmations when available, captures stdout/stderr, and emits a displayed custom message.
- `.pi/extensions/asdl-dev.ts` is only the project-local discovery adapter that lets Pi load the engineered package code.

`sdl:submit` is the current hard-cutover example: the transitional `/code:submit` bridge and `asdl-dev submit` surface were removed once the repo-local `sdl submit` command owned the workflow.

## When to expose a Pi workflow through `asdl-dev`

Move or add the command to `asdl-dev` when all of these are true:

- The command is useful outside an interactive Pi session.
- Its contract can be expressed as arguments, environment, stdout, stderr, and an exit code.
- Expected failures can be reported without throwing uncaught exceptions.
- The workflow can be tested with semantic in-memory gateways or real-adapter tests.
- The command belongs to this repository's developer workflow rather than to a portable public skill.

Keep the command Pi-only when its core behavior is Pi-specific:

- It needs session replacement, `/tree` navigation, editor mutation, or `sendUserMessage()` handoff semantics.
- It is primarily a custom TUI/picker/overlay flow.
- It streams long-running progress into widgets or custom renderers as the product surface.
- It registers LLM tools rather than a user-invoked slash command.

Hybrid flows are allowed, but they are not duplicate implementations. Keep the reusable deterministic core in a native package, then let a Pi-only command compose that core when the user-facing workflow still needs Pi session or UI behavior. `code:autobranch` remains a hybrid example: it reuses checkpoint-message and pending-worktree logic from `@asdl/sdl` while retaining Pi-specific UI and Graphite workflow behavior, including clean-worktree latest-commit extraction that preserves the original commit SHA. `sdl:submit` and `sdl:code:submit` are not hybrids after hard cutover; they are Pi surfaces for the repo-local `sdl submit` command module.

## File map

| Layer                  | Files                                                                                                   | Responsibility                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Project Pi discovery   | `.pi/extensions/asdl-dev.ts`                                                                            | Thin adapter that Pi auto-discovers. Imports and exports the engineered extension.                      |
| Pi command surface     | `ts/packages/pi-extensions/src/asdl-dev-extension.ts`, `ts/packages/pi-extensions/src/sdl-extension.ts` | Selects native CLI commands by domain namespace; contains no command-specific workflow logic.           |
| Generic Pi CLI adapter | `ts/packages/pi-extensions/src/cli-command-extension.ts`                                                | Converts a Pi slash command invocation into a `runCli()` call and displays captured output.             |
| CLI command table      | `ts/packages/asdl-dev/src/cli.ts`                                                                       | Owns `COMMANDS`, top-level help, per-command parsing, and `listAsdlDevCommands()`.                      |
| CLI context            | `ts/packages/asdl-dev/src/context.ts`                                                                   | Assembles real gateways used by `runCli()`.                                                             |
| Command logic          | `ts/packages/asdl-dev/src/<command>.ts`                                                                 | Owns workflow decisions and typed results. Should avoid Pi command-context types.                       |
| Real gateways          | `ts/packages/asdl-dev/src/gateways/*.ts`                                                                | Shell/API adapters with command construction and output parsing.                                        |
| Test fakes             | `ts/packages/asdl-dev/test/support/`                                                                    | In-memory gateways and scripted runners.                                                                |
| CLI tests              | `ts/packages/asdl-dev/test/scenario/`                                                                   | User-facing command behavior via `runCli()`.                                                            |
| Pi registration tests  | `ts/packages/pi-extensions/test/asdl-dev-extension.test.ts` and `code.test.ts`                          | Ensure Pi exposes the CLI commands once, under the intended namespace, without duplicate registrations. |

## Implementation recipe

### 1. Choose the CLI shape

`asdl-dev` uses a flat list of task commands. Prefer:

```text
asdl-dev preview-url
sdl cp
asdl-dev branch-summary
```

Avoid nested command groups such as:

```text
asdl-dev preview url
```

Pick a command name that can become a namespaced Pi command without a legacy alias.

### 2. Put workflow logic behind a CLI-friendly function

Create a command module in `ts/packages/asdl-dev/src/` that accepts explicit dependencies and returns a result rather than writing directly to global process streams.

A typical command-level shape is:

```typescript
export type MyCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export async function runMyCommand(options: {
  cwd: string;
  env: Record<string, string | undefined>;
  gateway: MyGateway;
}): Promise<MyCommandResult> {
  // expected failures return { exitCode, stderr }, not throw
}
```

Use exceptions only for programmer errors. The Pi adapter catches thrown errors and displays them as `Unhandled asdl-dev command error: ...`, which is worse than a typed failure for expected user-facing cases.

### 3. Add or extend gateways

If the command needs git, Vercel, GitHub, files, model calls, or external binaries, define a semantic gateway interface and wire its real implementation through `AsdlDevContext`.

For example:

```typescript
export type AsdlDevContext = {
  git: GitGateway;
  vercel: VercelDeploymentGateway;
  myGateway: MyGateway;
};
```

Testing rules of thumb:

- Scenario tests should use in-memory gateways and call `runCli()`.
- Real gateway tests should own exact command construction, parsing, and failure mapping.
- Keep `cwd` and `env` injectable; do not read `process.cwd()` or `process.env` from command logic.
- Prefer the git gateway for ordinary branch/repo facts. Add Graphite dependencies only when the command's user-facing contract explicitly names Graphite or `gt`.

### 4. Wire the command table in `cli.ts`

Add a `CommandSpec` entry:

```typescript
const COMMANDS: CommandSpec[] = [
  {
    name: "my-command",
    description: "Do the repo-local thing.",
    help: myCommandHelp,
    run: runMyCliCommand,
  },
];
```

Then implement:

- a parse-result type,
- a `parseMyCommandArgs()` function,
- a `runMyCliCommand()` adapter that calls command logic,
- a `myCommandHelp()` function.

`listAsdlDevCommands()` maps over `COMMANDS`, so no separate Pi registration is needed. The command table drives both `asdl-dev --help` and Pi autocomplete descriptions.

### 5. Expose the CLI command through the existing Pi adapter

Do not register duplicate Pi implementations for commands already owned by `asdl-dev`.

The existing `.pi/extensions/asdl-dev.ts` adapter loads `asdlDevExtension()` for `/dev:preview-url`; `.pi/extensions/code.ts` loads `codeExtension()`, which mounts remaining code workflow commands such as `/code:pr-regen`; `.pi/extensions/sdl.ts` loads `sdlExtension()` for primary `/sdl:changes`, `/sdl:cp`, and `/sdl:submit` mirrors plus nested `/sdl:code:changes`, `/sdl:code:checkpoint`, and `/sdl:code:submit` aliases.

A user invoking a mapped Pi mirror such as:

```text
/sdl:code:checkpoint --flag "value with spaces"
```

will run the equivalent CLI argv:

```text
sdl cp --flag "value with spaces"
```

through `runCli(["cp", "--flag", "value with spaces"], deps)` when the Pi surface is an explicit alias for the underlying CLI command entry.

### 6. If migrating an existing Pi command, delete the duplicate implementation

When moving a Pi command to `asdl-dev`:

1. Move the headless workflow logic into `ts/packages/asdl-dev/src/`.
2. Keep only explicitly Pi-specific UI/composition in `ts/packages/pi-extensions/` if the workflow still needs it.
3. Remove the old `pi.registerCommand()` call for the migrated command.
4. Delete the old Pi-only implementation file when it no longer owns any Pi-specific behavior.
5. Remove legacy aliases rather than preserving them for autocomplete convenience.
6. Replace old Pi behavior tests with `asdl-dev` CLI scenario/gateway tests plus narrow Pi registration tests.
7. Update docs and inventories that listed the old source file.

The expected final state is one public slash command name in the correct domain namespace, backed by `asdl-dev`.

If the old Pi implementation cannot be deleted or reduced to Pi-specific composition, the migration is not complete; document the remaining Pi-only responsibility instead of presenting the command as consolidated.

## Output and UX conventions

- Default successful stdout should be concise and shell-friendly.
- Use stderr for human failure text when not emitting JSON.
- Add `--json` when agents or scripts need structured success and failure details.
- Use stable error codes inside JSON payloads.
- Keep command descriptions specific; Pi shows them as `asdl-dev <command>: <description>`.
- Treat nonzero process exit codes as part of the command contract. The Pi adapter will display them as error-level custom messages. For Clinkr rendered commands, `negative(...)` is a successful domain-negative answer that exits 0 by default; shell/CI callers that need nonzero semantic negatives should pass `--shell-exit-code`. This flag affects the process exit status only, not the JSON machine envelope: machine consumers should read envelope `exit_code`, where negative remains semantic `1`.
- Prefer `ok + data` when a command successfully answers a predicate/query and “no” is ordinary result data, such as `brmem check` returning `{ present: false }`. Use `negative` when the command completed but the requested outcome did not occur and generic machine consumers should treat the result as semantically non-ok, such as an empty selection or no actionable work.
- Avoid large output. If a command can produce long logs, summarize by default and provide a flag or temp-file evidence path for details.

## Test checklist

For each new or migrated command:

- `ts/packages/asdl-dev/test/scenario/...` covers:
  - top-level metadata from `listAsdlDevCommands()`,
  - `asdl-dev --help`,
  - `asdl-dev <command> --help`,
  - success output,
  - expected failure output and exit codes,
  - argument parsing errors.
- Unit tests cover pure command logic when scenarios would be too coarse.
- Gateway tests cover real command construction and output parsing for shell/API adapters.
- `ts/packages/pi-extensions/test/asdl-dev-extension.test.ts` expects any non-code `/dev:<command>` registration.
- `ts/packages/pi-extensions/test/code.test.ts` expects code/source-control commands under `/code:<command>` and confirms no duplicate `/dev:*` registration.
- Migrated-command tests for the former Pi implementation are deleted or narrowed to whatever Pi-specific composition remains.
- Docs list the visible Pi command under the adapter that loads it (for example `.pi/extensions/code.ts` for `/code:*`) while also naming the headless `asdl-dev` implementation.

## Validation checklist

Run the narrow TypeScript checks first:

```bash
just ts-check
just ts-test
```

For docs-only changes, also run:

```bash
just dprint-check
```

After changing project-local Pi resources, reload an interactive Pi session with:

```text
/reload
```

Then verify the visible command inventory from Pi rather than inferring ownership from file names. The canonical inventory source is Pi RPC `get_commands`; capture `name`, `description`, `source`, and `sourceInfo` when doing a surface audit.

## Common mistakes

- **Treating “mirror” as duplicate implementation:** the mirror is the Pi command surface over `runCli()`, not a second workflow implementation.
- **Adding a command to Pi but not `asdl-dev`:** creates a surface only Pi users can run and makes tests harder to write.
- **Keeping a migrated command in `dev.ts`:** causes duplicate registration or suffix-prone Pi command names.
- **Keeping the old Pi implementation after consolidation:** increases drift risk and makes future behavior changes ambiguous.
- **Relying on shell parsing:** `cli-command-extension.ts` tokenizes the raw slash-command arg string; it does not invoke a shell.
- **Using global process state in command logic:** pass `cwd`, `env`, stdout, stderr, and gateways through `runCli()` dependencies.
- **Throwing for expected user errors:** return an exit code and stderr/JSON failure instead.
- **Making Graphite implicit:** generic repo facts should come from git. If a command requires Graphite stack semantics, name that in the command/help/docs.
- **Forgetting docs/source updates:** once exposed through `asdl-dev`, a command may still be sourced through a domain-specific adapter such as `.pi/extensions/code.ts`; document the visible Pi command and the headless `asdl-dev` implementation together.
