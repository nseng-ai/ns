# sdl

`sdl` is the Source Development Lifecycle CLI. It is the durable public command boundary for software-development-lifecycle workflows that have migrated out of repo-internal tooling.

The retired `asdl-dev` package no longer owns current command surfaces. Lower packages such as `@asdl/ccc` may continue to own repo-specific orchestration internals, but SDL owns the public lifecycle command surface once a workflow moves to `sdl`.

## Command ownership and hard cutover

Migrated lifecycle commands target these surfaces:

- CLI: `sdl <name>`
- Pi, when a mirror exists: `/sdl:<name>`

A migration slice should delete old command names and old `/code:<name>` Pi mirrors in the same slice unless an explicit, documented exception is approved before implementation. Do not keep compatibility aliases only for autocomplete or habit.

## SDL extensions

SDL treats project-specific lifecycle behavior as first-class. SDL extensions can contribute command entries today and are expected to grow additional contribution points later. Command catalogs are discovered in increasing precedence:

```text
built-in command table < ~/.asdl/extensions < <cwd>/.asdl/extensions
```

Global and project roots support these one-level entry shapes:

```text
.asdl/extensions/greet.ts
.asdl/extensions/greet.js
.asdl/extensions/greet/index.ts
.asdl/extensions/greet/index.js
.asdl/extensions/package-name/package.json
```

Direct files and directory indexes infer one SDL command-entry name from the file or directory name. They appear in top-level help with a generic description until selected. Package manifests can provide top-level help metadata without executing TypeScript:

```json
{
  "asdl": {
    "commands": [
      {
        "name": "greet",
        "description": "Say hello.",
        "fullDescription": "Say hello with custom project policy.",
        "entry": "./src/greet.ts"
      }
    ]
  }
}
```

Manifest command entries require `name`, `description`, and a relative POSIX-style `entry` path to a `.ts` or `.js` file. `fullDescription` is optional and defaults to `description`.

SDL extension modules default-export an extension object created with `defineExtension()`. A command contribution is one entry in the extension's optional `commands` array; extensions may omit `commands` when they have no command contributions for the current SDL surface.

```ts
import { defineExtension, ok } from "@asdl/sdl/sdk";

export default defineExtension({
  commands: [
    {
      name: "greet",
      description: "Say hello.",
      run() {
        return ok("hello");
      },
    },
  ],
});
```

Command names must be flat and match `[a-z][a-z0-9-]*`. Nested groups, slashes, colons, spaces, and uppercase names are not supported in this prototype.

Duplicate command names within one source level are errors. Across source levels, higher-precedence sources override lower-precedence sources: project overrides global and built-in; global overrides built-in. Overrides are recorded as non-fatal diagnostics.

Discovery is side-effect-light: `sdl --help`, `sdl -h`, `sdl --version`, `sdl --runtime`, and unselected command lookup read only built-in definitions, filesystem entries, and JSON manifests. Malformed discovery entries that do not affect the selected command are printed as stderr warnings while the invocation continues and stdout remains reserved for primary output. Discovery diagnostics that affect the selected command are fatal, including higher-precedence broken overrides that would otherwise fall back to lower-precedence commands. SDL imports and validates exactly one external SDL extension contribution only when that command is selected, including selected-command help and JSON schema.

The legacy `.asdl/commands/<command>.ts` path has been removed. It is not a compatibility fallback.

Dynamic Pi `/sdl:*` mirrors are not part of this first general extension-loading slice. Existing exact mirrors such as `/sdl:changes`, `/sdl:cp`, and `/sdl:submit` continue to delegate to `sdl`; nested code-lifecycle mirrors such as `/sdl:code:regenerate-pr` may delegate to SDL commands without adding flat mirrors. Arbitrary SDL extension command entries are not dynamically mirrored into Pi.

## Public SDL extension API

SDL extension authors should import only from `@asdl/sdl/sdk`:

```ts
import { defineExtension, failed, ok, z } from "@asdl/sdl/sdk";
import type { SdlContext, SdlResult } from "@asdl/sdl/sdk";
```

That SDK subpath is the public author API for SDL extensions. It exposes:

- `defineExtension()` for declaring SDL extension contributions, including commandless extensions and arbitrary-length inline `commands` arrays;
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

SDL command entries own their prompts, validation, repair policy, and exact external commands. They should not import internal SDL implementation modules.

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

For compatibility with existing local environments, an unset `SDL_CHECKPOINT_MODEL` falls back to `ASDL_DEV_CHECKPOINT_MODEL`.

Projects may override `sdl cp` by contributing an SDL command entry named `cp` from `.asdl/extensions` or `~/.asdl/extensions`. When no SDL extension override exists, SDL uses the built-in `cp` implementation.

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
sdl submit [--restack] [--verbose]
```

Behavior:

- runs the existing SDL checkpoint flow before submit when the worktree is dirty;
- uses `@asdl/core/submit` for Graphite submit, PR metadata prewrite, current-PR verification, and PR-description generation;
- prints concise phase-oriented progress by default while preserving captured Graphite output for PR-link extraction and failure diagnostics;
- streams raw Graphite/subprocess output for debugging with `--verbose`;
- skips model regeneration and `gh pr edit` for unchanged PR descriptions when the stored managed-region fingerprint matches the current GitHub PR diff patch id, prompt hash, and generator version;
- when regeneration is needed, updates the PR title and replaces only the machine-owned generated body region, preserving human text outside it;
- prompts through `ctx.confirm` when Graphite reports a required restack, or runs restack directly with `--restack`;
- asks the configured model to append a concise interpretation and recommended next steps to failed submit output when model access is available;
- exposes the Pi mirror as `/sdl:submit` from SDL command metadata.

Environment:

- `ASDL_DEV_PR_DESCRIPTION_MODEL`: model reference for generated PR descriptions.
- `ASDL_DEV_PR_DESCRIPTION_PROMPT`: optional custom PR-description prompt file.
- `SDL_SUBMIT_FAILURE_MODEL`: model reference for failed submit output interpretation.

`submit` is a built-in SDL command, not a legacy repo-local `.asdl/commands/submit.ts` module. It can be overridden through an SDL command entry or manifest descriptor under `.asdl/extensions`. Legacy submit surfaces are not retained as compatibility surfaces.

## `regenerate-pr`

Regenerate the current branch PR title and body.

```bash
sdl regenerate-pr [--force]
```

Behavior:

- resolves the current branch PR through GitHub;
- reads commit messages and PR diff through `@asdl/core/submit`;
- generates a replacement title/body with the PR-description prompt;
- updates the PR title/body and writes success output with the PR number, URL, title, and prompt source;
- accepts `--force` as a compatibility no-op and does not support `--format`.

Environment:

- `ASDL_DEV_PR_DESCRIPTION_MODEL`: model reference for generated PR descriptions.
- `ASDL_DEV_PR_DESCRIPTION_PROMPT`: optional custom PR-description prompt file.

Pi exposes this capability only as the nested `/sdl:code:regenerate-pr` adapter in this slice. There is no flat `/sdl:regenerate-pr` Pi mirror.

## `pr-regen`

Regenerate the current branch PR title and managed generated body region.

```bash
sdl pr-regen
```

Behavior:

- resolves the current branch PR through GitHub;
- computes the same stable patch id as `gh pr diff <number> | git patch-id --stable`;
- asks the configured PR-description model for a fresh title and body even when `sdl submit` would skip the PR as unchanged;
- replaces only the open `<details>` managed generated body region and preserves human PR body text outside that region;
- exposes the Pi mirror as `/sdl:pr-regen`.

Environment matches PR description generation for `sdl submit`:

- `ASDL_DEV_PR_DESCRIPTION_MODEL`: model reference for generated PR descriptions.
- `ASDL_DEV_PR_DESCRIPTION_PROMPT`: optional custom PR-description prompt file.

`asdl-dev pr-regen` and `/code:pr-regen` are not retained as compatibility surfaces.

## Testing future command migrations

Future SDL command slices should update tests and docs with the command surface change:

- SDL CLI scenario tests should cover user-facing `sdl <name>` behavior, including project/global SDL extension command entries when relevant.
- Pi registration and parity tests should cover `/sdl:<name>` mirrors when a command is exposed in Pi.
- Source searches should prove stale old command names and `/code:<name>` surfaces were deleted or are mentioned only as explicitly labeled migration-away context.
