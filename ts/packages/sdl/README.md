# sdl

`sdl` is the Source Development Lifecycle CLI. It is the durable public command boundary for software-development-lifecycle workflows that have migrated out of repo-internal tooling.

`asdl-dev` is private ASDL contributor tooling and should shrink as lifecycle commands migrate. Lower packages such as `@asdl/ccc` may continue to own repo-specific orchestration internals, but SDL owns the public lifecycle command surface once a workflow moves to `sdl`.

## Command ownership and hard cutover

Migrated lifecycle commands target these surfaces:

- CLI: `sdl <name>`
- Pi, when a mirror exists: `/sdl:<name>`

A migration slice should delete the old `asdl-dev <name>` command and old `/code:<name>` Pi mirror in the same slice unless an explicit, documented exception is approved before implementation. Do not keep compatibility aliases only for autocomplete or habit.

## Command extensions

SDL treats project-specific lifecycle behavior as first-class. Extension factories can contribute flat SDL commands from these roots, loaded in increasing precedence:

```text
built-in extensions / built-in command table < ~/.asdl/extensions < <cwd>/.asdl/extensions
```

Global and project roots support these one-level entry shapes:

```text
.asdl/extensions/greet.ts
.asdl/extensions/greet.js
.asdl/extensions/greet/index.ts
.asdl/extensions/greet/index.js
.asdl/extensions/package-name/package.json
```

Package manifests use an `asdl.extensions` array of relative entry paths:

```json
{
  "asdl": {
    "extensions": ["./src/index.ts"]
  }
}
```

Extension modules default-export a factory. The prototype `ExtensionAPI` has one method: `registerCommand(command)`.

```ts
import type { ExtensionAPI } from "@asdl/sdl/sdk";
import { defineCommand, ok } from "@asdl/sdl/sdk";

export default function extension(api: ExtensionAPI): void {
  api.registerCommand(defineCommand({
    name: "greet",
    description: "Say hello.",
    run() {
      return ok("hello");
    },
  }));
}
```

Command names must be flat and match `[a-z][a-z0-9-]*`. Nested groups, slashes, colons, spaces, and uppercase names are not supported in this prototype.

Duplicate command names within one source level are errors. Across source levels, higher-precedence sources override lower-precedence sources: project overrides global and built-in; global overrides built-in. Overrides are recorded as non-fatal diagnostics.

Extension factories are eagerly executed for every `sdl` invocation, including `sdl --help`, because SDL must run factories to know contributed commands. There is no trust gate or opt-out yet; only run SDL in repositories whose extension code you are willing to execute.

The legacy `.asdl/commands/<command>.ts` path has been removed. It is not a compatibility fallback.

Dynamic Pi `/sdl:*` mirrors are not part of this first general extension-loading slice. Existing exact mirrors such as `/sdl:changes`, `/sdl:cp`, and `/sdl:submit` continue to delegate to `sdl`, but arbitrary extension commands are not dynamically mirrored into Pi.

## Public extension SDK

Extension authors should import only from `@asdl/sdl/sdk`:

```ts
import type { ExtensionAPI } from "@asdl/sdl/sdk";
import { defineCommand, failed, ok, z } from "@asdl/sdl/sdk";
```

That SDK subpath is the public author API for SDL extensions. It exposes the extension and command shapes and helpers, including:

- `ExtensionAPI` and `ExtensionFactory` types for extension factories;
- `defineCommand()` for declaring command contributions;
- `ok()` and `failed()` for returning command results;
- `z` for declaring command schemas through the SDK-owned Zod boundary;
- `SdlContext` for command execution capabilities;
- `SdlResult` for success/failure results.

`SdlContext` provides:

- `ctx.cwd`: repository working directory for the command;
- `ctx.env`: environment visible to the command;
- `ctx.exec(command, args, options)`: low-level argv execution with timeout and stdout/stderr chunk callbacks;
- `ctx.model`: raw text-generation capability;
- optional durable output hooks (`ctx.stdout`, `ctx.stderr`), live-output hook (`ctx.onOutput`), and confirmation hook (`ctx.confirm`) for command-owned progress and prompts.

Command modules own their prompts, validation, repair policy, and exact external commands. They should not import internal SDL implementation modules.

## Internal migration exports

`@asdl/sdl/package.json` marks only `./sdk` as `asdl.publicPluginApi`. Other package subpaths are `asdl.internalMigrationExports`: they exist so ASDL workspace packages can share primitives during migration, but they are not plugin-author APIs and should not be documented as stable extension surfaces.

## `cp`

Create a checkpoint commit for the current worktree diff.

```bash
sdl cp
```

Behavior:

- refuses trunk branches (`main` and `master`);
- refuses clean worktrees;
- asks the configured text-generation gateway for a valid `[cp] ...` commit message;
- makes one repair attempt for an invalid model draft;
- stages all changes and commits with the prepared message;
- prints the created commit summary followed by the commit message.

Environment:

- `SDL_CHECKPOINT_MODEL`: model reference for the checkpoint message.

During the transition from `asdl-dev cp`, an unset `SDL_CHECKPOINT_MODEL` falls back to `ASDL_DEV_CHECKPOINT_MODEL`.

Projects may override `sdl cp` by registering a command named `cp` from `.asdl/extensions` or `~/.asdl/extensions`. When no extension override exists, SDL uses the built-in `cp` implementation.

Pi exposes the same capability as `/sdl:cp` through `.pi/extensions/sdl.ts`; `/code:cp` is not retained as a compatibility alias.

## `changes`

Summarize outstanding worktree changes without committing.

```bash
sdl changes
```

Behavior:

- captures the current pending worktree snapshot with read-only git commands;
- prints `Working tree is clean; no outstanding changes.` for clean worktrees;
- for dirty worktrees, asks the configured text-generation model for 1–4 reviewer-facing bullets, then prints the bullets and raw porcelain status lines;
- does not stage, commit, stash, switch branches, run Graphite, or call GitHub.

Environment:

- `SDL_CHANGES_MODEL`: model reference for generated changes summaries.
- `PI_DRAFT_MODEL`: transitional fallback for the old Pi changes-summary model selection.

Pi exposes the same capability as `/sdl:changes`; `/code:changes` is not retained as a compatibility alias.

## `submit`

Checkpoint outstanding changes, then submit the current Graphite stack.

```bash
sdl submit [--restack]
```

Behavior:

- runs the existing SDL checkpoint flow before submit when the worktree is dirty;
- uses `@asdl/core/submit` for Graphite submit, PR metadata prewrite, current-PR verification, and PR-description generation;
- streams live Graphite output through SDL runtime hooks while preserving command-owned final stdout/stderr;
- prompts through `ctx.confirm` when Graphite reports a required restack, or runs restack directly with `--restack`;
- asks the configured model to append a concise interpretation and recommended next steps to failed submit output when model access is available;
- exposes the Pi mirror as `/sdl:submit` from SDL command metadata.

Environment:

- `ASDL_DEV_PR_DESCRIPTION_MODEL`: model reference for generated PR descriptions.
- `ASDL_DEV_PR_DESCRIPTION_PROMPT`: optional custom PR-description prompt file.
- `SDL_SUBMIT_FAILURE_MODEL`: model reference for failed submit output interpretation.

`submit` is a built-in SDL command, not a legacy repo-local `.asdl/commands/submit.ts` module. It can be overridden only through the `.asdl/extensions` extension factory path. `asdl-dev submit`, `/code:submit`, and project-local fake Pi metadata are not retained as compatibility surfaces.

## Testing future command migrations

Future SDL command slices should update tests and docs with the command surface change:

- SDL CLI scenario tests should cover user-facing `sdl <name>` behavior, including project/global extension factories when relevant.
- Pi registration and parity tests should cover `/sdl:<name>` mirrors when a command is exposed in Pi.
- Source searches should prove stale `asdl-dev <name>` and `/code:<name>` surfaces were deleted or are mentioned only as explicitly labeled migration-away context.
