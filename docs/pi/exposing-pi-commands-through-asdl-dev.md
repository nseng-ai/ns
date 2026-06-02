# Exposing Pi Commands Through `asdl-dev`

This guide describes the pattern established by the `preview-url` and `cp` work: durable repo-local developer commands should live in the `asdl-dev` CLI first, then be mirrored into Pi as `/dev:*` slash commands.

Use this when promoting a Pi-only workflow into a headless command that humans, agents, and tests can all run outside Pi.

## What the `preview-url` and `cp` migrations established

The stack around `asdl-dev preview-url` and `asdl-dev cp` created this boundary:

- `ts/packages/asdl-dev/` owns CLI parsing, help text, gateway-backed workflow logic, stdout/stderr output, exit codes, and CLI scenario tests.
- `ts/packages/asdl-dev/src/cli.ts` owns a flat command table and exports `listAsdlDevCommands()`.
- `ts/packages/pi-extensions/src/asdl-dev-extension.ts` reads that command table and registers each CLI command under the Pi `/dev:*` namespace.
- `ts/packages/pi-extensions/src/cli-command-extension.ts` is the generic Pi adapter: it waits for Pi to become idle, tokenizes slash-command args, invokes `runCli()`, captures stdout/stderr, and emits a displayed custom message.
- `.pi/extensions/asdl-dev.ts` is only the project-local discovery adapter that lets Pi load the engineered package code.

The intended direction is therefore:

```text
shared workflow logic -> asdl-dev CLI -> /dev:* Pi command mirror
```

Do not add a new Pi command first and later make the CLI shell out to Pi. Pi should be a runtime surface over the CLI, not the canonical implementation for headless developer tasks.

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

Hybrid flows are allowed. Keep the reusable deterministic core in `asdl-dev`, then let Pi-only commands compose it. Current examples are `dev:autobranch` and `dev:submit`, which reuse checkpoint-message and pending-worktree logic from `asdl-dev` while retaining Pi-specific UI and Graphite workflow behavior.

## File map

| Layer                  | Files                                                                         | Responsibility                                                                              |
| ---------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Project Pi discovery   | `.pi/extensions/asdl-dev.ts`                                                  | Thin adapter that Pi auto-discovers. Imports and exports the engineered extension.          |
| Pi command mirror      | `ts/packages/pi-extensions/src/asdl-dev-extension.ts`                         | Registers every `asdl-dev` command as `/dev:<command>`.                                     |
| Generic Pi CLI adapter | `ts/packages/pi-extensions/src/cli-command-extension.ts`                      | Converts a Pi slash command invocation into a `runCli()` call and displays captured output. |
| CLI command table      | `ts/packages/asdl-dev/src/cli.ts`                                             | Owns `COMMANDS`, top-level help, per-command parsing, and `listAsdlDevCommands()`.          |
| CLI context            | `ts/packages/asdl-dev/src/context.ts`                                         | Assembles real gateways used by `runCli()`.                                                 |
| Command logic          | `ts/packages/asdl-dev/src/<command>.ts`                                       | Owns workflow decisions and typed results. Should avoid Pi command-context types.           |
| Real gateways          | `ts/packages/asdl-dev/src/gateways/*.ts`                                      | Shell/API adapters with command construction and output parsing.                            |
| Test fakes             | `ts/packages/asdl-dev/test/support/`                                          | In-memory gateways and scripted runners.                                                    |
| CLI tests              | `ts/packages/asdl-dev/test/scenario/`                                         | User-facing command behavior via `runCli()`.                                                |
| Pi registration tests  | `ts/packages/pi-extensions/test/asdl-dev-extension.test.ts` and `dev.test.ts` | Ensure Pi exposes the CLI commands once, under the intended namespace.                      |

## Implementation recipe

### 1. Choose the CLI shape

`asdl-dev` uses a flat list of task commands. Prefer:

```text
asdl-dev preview-url
asdl-dev cp
asdl-dev branch-summary
```

Avoid nested command groups such as:

```text
asdl-dev preview url
```

Pick a command name that can become `/dev:<name>` without a legacy alias.

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

### 5. Let Pi mirror it through the existing adapter

Do not register the command again in `ts/packages/pi-extensions/src/dev.ts`.

The existing `.pi/extensions/asdl-dev.ts` adapter loads `asdlDevExtension()`, and that function mirrors every command from `listAsdlDevCommands()` as `/dev:<command>`.

A user invoking:

```text
/dev:my-command --flag "value with spaces"
```

will run the equivalent CLI argv:

```text
asdl-dev my-command --flag "value with spaces"
```

through `runCli(["my-command", "--flag", "value with spaces"], deps)`.

### 6. If migrating an existing Pi command, remove the duplicate public surface

When moving a Pi command to `asdl-dev`:

1. Move the headless workflow logic into `ts/packages/asdl-dev/src/`.
2. Keep only Pi-specific UI/composition in `ts/packages/pi-extensions/` if anything still needs it.
3. Remove the old `pi.registerCommand()` call for the migrated command.
4. Remove legacy aliases rather than preserving them for autocomplete convenience.
5. Update docs and tests that listed the old source file.

The expected final state is one public slash command name, usually `/dev:<command>`, owned by `.pi/extensions/asdl-dev.ts`.

## Output and UX conventions

- Default successful stdout should be concise and shell-friendly.
- Use stderr for human failure text when not emitting JSON.
- Add `--json` when agents or scripts need structured success and failure details.
- Use stable error codes inside JSON payloads.
- Keep command descriptions specific; Pi shows them as `asdl-dev <command>: <description>`.
- Treat nonzero exit codes as part of the command contract. The Pi adapter will display them as error-level custom messages.
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
- `ts/packages/pi-extensions/test/asdl-dev-extension.test.ts` expects the new `/dev:<command>` registration.
- `ts/packages/pi-extensions/test/dev.test.ts` confirms there is no duplicate registration from `devExtension()`.
- Docs list the command under `.pi/extensions/asdl-dev.ts`, not `.pi/extensions/dev.ts`, once the migration is complete.

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

- **Adding a command to Pi but not `asdl-dev`:** creates a surface only Pi users can run and makes tests harder to write.
- **Keeping a migrated command in `dev.ts`:** causes duplicate registration or suffix-prone Pi command names.
- **Relying on shell parsing:** `cli-command-extension.ts` tokenizes the raw slash-command arg string; it does not invoke a shell.
- **Using global process state in command logic:** pass `cwd`, `env`, stdout, stderr, and gateways through `runCli()` dependencies.
- **Throwing for expected user errors:** return an exit code and stderr/JSON failure instead.
- **Making Graphite implicit:** generic repo facts should come from git. If a command requires Graphite stack semantics, name that in the command/help/docs.
- **Forgetting docs/source updates:** once mirrored through `asdl-dev`, `/dev:<command>` is sourced from `.pi/extensions/asdl-dev.ts` even if older docs pointed at `.pi/extensions/dev.ts`.
