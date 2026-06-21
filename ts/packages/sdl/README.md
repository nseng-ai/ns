# sdl

`sdl` is the Source Development Lifecycle CLI. It is the durable public command boundary for software-development-lifecycle workflows that have migrated out of repo-internal tooling.

The retired `sdl-dev` package no longer owns current command surfaces. Lower packages such as `@sdl/ccc` may continue to own repo-specific orchestration internals, but SDL owns the public lifecycle command surface once a workflow moves to `sdl`.

## Command ownership and hard cutover

Migrated lifecycle commands target these surfaces:

- CLI: `sdl <name>`
- Pi, when a mirror exists: `/sdl:<name>`

A migration slice should delete old command names and old `/code:<name>` Pi mirrors in the same slice unless an explicit, documented exception is approved before implementation. Do not keep compatibility aliases only for autocomplete or habit.

## SDL extensions

SDL treats project-specific lifecycle behavior as first-class. SDL extensions can contribute command entries today and are expected to grow additional contribution points later. Command catalogs are discovered in increasing precedence:

```text
built-in command table < $XDG_DATA_HOME/sdl/extensions < <cwd>/.sdl/extensions
```

Global and project roots support these one-level entry shapes:

```text
.sdl/extensions/greet.ts
.sdl/extensions/greet.js
.sdl/extensions/greet/index.ts
.sdl/extensions/greet/index.js
.sdl/extensions/package-name/package.json
```

Direct files and directory indexes infer one SDL command-entry name from the file or directory name. They appear in top-level help with a generic description until selected. Package manifests can provide top-level help metadata without executing TypeScript:

```json
{
  "sdl": {
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
import { defineExtension, ok } from "@sdl/sdl/sdk";

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

Duplicate command names within one extension root are errors. Across roots, higher-precedence sources override lower-precedence sources: project overrides XDG global and built-in; XDG global overrides built-in. Overrides are recorded as non-fatal diagnostics.

Discovery is side-effect-light: `sdl --help`, `sdl -h`, `sdl --version`, `sdl --runtime`, and unselected command lookup read only built-in definitions, filesystem entries, and JSON manifests. Malformed discovery entries that do not affect the selected command are printed as stderr warnings while the invocation continues and stdout remains reserved for primary output. Discovery diagnostics that affect the selected command are fatal, including higher-precedence broken overrides that would otherwise fall back to lower-precedence commands. SDL imports and validates exactly one external SDL extension contribution only when that command is selected, including selected-command help and JSON schema.

The legacy `.sdl/commands/<command>.ts` path has been removed. It is not a compatibility fallback.

Dynamic Pi `/sdl:*` mirrors are not part of this first general extension-loading slice. In this repository, the exact `/sdl:changes`, `/sdl:cp`, `/sdl:autobranch`, `/sdl:submit`, `/sdl:regenerate-pr`, and nested `/sdl:code:changes` mirrors delegate to restored project-local SDL commands. Other repository workflow mirrors are unavailable until their SDL command entries migrate back. Arbitrary SDL extension command entries are not dynamically mirrored into Pi.

## Public SDL extension API

SDL extension authors should import only from `@sdl/sdl/sdk`:

```ts
import { defineExtension, failed, ok, z } from "@sdl/sdl/sdk";
import type { SdlContext, SdlResult } from "@sdl/sdl/sdk";
```

That SDK subpath is the public author API for SDL extensions. It exposes:

- `defineExtension()` for declaring SDL extension contributions, including commandless extensions and arbitrary-length inline `commands` arrays;
- `ok()` and `failed()` for returning command results;
- `commandSucceeded()` and `formatCommandEvidence()` for common command-result evidence formatting;
- `z` for declaring command schemas through the SDK-owned Zod boundary;
- `SdlContext` for command execution capabilities;
- `SdlResult` for success/failure results.

`SdlContext` provides:

- `ctx.cwd`: repository working directory for the command;
- `ctx.env`: environment visible to the command;
- `ctx.exec(command, args, options)`: low-level argv execution with timeout and stdout/stderr chunk callbacks;
- `ctx.textGenerator`: text-generation capability;
- optional durable output hooks (`ctx.stdout`, `ctx.stderr`), live-output hook (`ctx.onOutput`), and confirmation hook (`ctx.confirm`) for command-owned progress and prompts.

SDL command entries own their prompts, validation, repair policy, and exact external commands. They should not import internal SDL implementation modules.

Single-file SDL extension modules such as `.sdl/extensions/<name>.ts` are leaf authoring surfaces, not shared libraries. Workspace packages must not import from them. If package code needs behavior first proven inside a single-file extension, move or copy the reusable contract into a package-owned module and expose it deliberately through `@sdl/sdl/sdk` or another documented package export; do not create a package → extension dependency.

## Internal migration exports

`@sdl/sdl/package.json` marks only `./sdk` as `sdl.publicPluginApi`. Other package subpaths are `sdl.internalMigrationExports`: they exist so SDL workspace packages can share primitives during migration, but they are not plugin-author APIs and should not be documented as stable extension surfaces.

## `cp`

Create a checkpoint commit for the current diff.

```bash
sdl cp
sdl cp --dry-run
```

In this repository, `sdl cp` is provided by the project-local single-file extension `.sdl/extensions/cp.ts`; it is not a universal built-in SDL command.

Behavior:

- captures the current pending worktree snapshot with git fact commands;
- refuses `main` and `master` branches before generating a message or committing;
- refuses clean worktrees with `Working tree is clean; nothing to checkpoint.`;
- asks the configured text-generation model for a validated `[cp]` commit message, with one repair attempt for invalid output;
- stages all changes with `git add -A`, commits using the prepared message, reads `git log -1 --oneline`, then prints the commit summary plus checkpoint message;
- with `--dry-run`, previews the model-authored checkpoint message and branch without running `git add`, `git commit`, or `git log`.

Environment:

- `SDL_CHECKPOINT_MODEL`: model reference for generated checkpoint messages.
- `SDL_DEV_CHECKPOINT_MODEL`: transitional fallback for the old checkpoint model selection.

Pi exposes the same capability as `/sdl:cp`. Old compatibility aliases such as `/code:cp`, `/code:checkpoint`, `/sdl:code:cp`, and `/sdl:code:checkpoint` are not restored.

## `autobranch`

Create a Graphite branch from dirty worktree changes or the latest unpushed commit.

```bash
sdl autobranch
sdl autobranch --slug <slug>
```

In this repository, `sdl autobranch` is provided by the project-local SDK-only single-file extension `.sdl/extensions/autobranch.ts`; it is not a universal built-in SDL command. Hidden `ccc exec autobranch` remains for CCC/internal compatibility, but the public agent and Pi boundary is `sdl autobranch` / `/sdl:autobranch`.

Behavior:

- dirty worktree mode stashes tracked and untracked changes, creates a Graphite branch with `gt create`, restores the stash, and creates a checkpoint commit;
- clean worktree mode moves the latest eligible unpushed single-parent commit onto a new Graphite branch using a recovery branch, source reset, hard reset, HEAD verification, and cleanup;
- refuses unsafe latest-commit cases such as trunk, pushed HEAD, root commits, merge commits, or Graphite child branches;
- derives branch slugs with the SDL slug model unless `--slug` is supplied;
- generates dirty-worktree checkpoint messages with the same `[cp]` checkpoint-message policy as `sdl cp`.

Environment:

- `SDL_SLUG_MODEL`: model reference for generated branch slugs.
- `SDL_CHECKPOINT_MODEL`: model reference for generated checkpoint messages.
- `SDL_DEV_CHECKPOINT_MODEL`: transitional fallback for the old checkpoint model selection.

Pi exposes the same capability as `/sdl:autobranch`. `/sdl:code:autobranch`, `/code:autobranch`, and `/newbr` are not restored as compatibility surfaces.

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

Pi exposes the same capability as `/sdl:changes` and `/sdl:code:changes`; `/code:changes` is not retained as a compatibility alias.

## `submit`

Checkpoint outstanding changes, then submit the current Graphite stack.

```bash
sdl submit [--no-restack] [--verbose]
```

Behavior:

- checkpoints pending worktree changes before submission using the same `[cp]` checkpoint-message policy as `sdl cp`;
- preflights Graphite submit readiness with `gt submit -nps --no-ai --no-interactive --no-view --no-web --dry-run`;
- runs `gt restack --no-interactive` automatically when Graphite requires a restack, unless `--no-restack` is set;
- prepares initial PR metadata for new single-commit stack branches before submission when possible;
- submits with `gt submit -nps --no-ai --no-interactive --no-view --no-web`, verifies the current PR, and generates or validates managed PR descriptions through `gh pr view`, `gh pr diff`, `git patch-id --stable`, and `gh pr edit`;
- writes raw submit-failure transcripts and asks the configured model for concise failure summaries when submission, restack, verification, checkpoint, or PR-description phases fail;
- with `--verbose`, streams raw Graphite/subprocess stdout and stderr in addition to concise progress.

Environment:

- `SDL_CHECKPOINT_MODEL`: model reference for generated checkpoint messages.
- `SDL_DEV_CHECKPOINT_MODEL`: transitional fallback for the old checkpoint model selection.
- `SDL_DEV_PR_DESCRIPTION_MODEL`: model reference for generated PR descriptions.
- `SDL_DEV_PR_DESCRIPTION_PROMPT`: optional custom PR-description prompt file.
- `SDL_SUBMIT_FAILURE_MODEL`: model reference for generated submit-failure summaries.
- `SDL_SUBMIT_FAILURE_LOG_DIR`: optional directory for raw submit-failure transcripts.

Pi exposes the same capability as `/sdl:submit`. `/sdl:code:submit`, `/dev:submit`, `/submit`, and other legacy submit aliases are not restored.

## `regenerate-pr`

Regenerate the current branch PR title and SDL-managed generated body region.

```bash
sdl regenerate-pr [--force]
```

Behavior:

- resolves the current branch PR through `gh pr view --json number,url,title,body,headRefName,baseRefName`;
- computes the same stable patch id as `gh pr diff <number> | git patch-id --stable`;
- asks the configured PR-description model for a fresh title and body even when `sdl submit` would skip the PR as unchanged;
- replaces or inserts only the SDL-managed generated body region and preserves human PR body text outside that region;
- asks for confirmation immediately before `gh pr edit`; if confirmation is declined or unavailable, GitHub is not edited;
- accepts `--force` as a compatibility no-op that does not bypass confirmation.

Environment matches PR description generation for `sdl submit`:

- `SDL_DEV_PR_DESCRIPTION_MODEL`: model reference for generated PR descriptions.
- `SDL_DEV_PR_DESCRIPTION_PROMPT`: optional custom PR-description prompt file.

Pi exposes the same capability as `/sdl:regenerate-pr`. `sdl pr-regen`, `/sdl:pr-regen`, `/code:pr-regen`, and `/sdl:code:regenerate-pr` are not retained as compatibility surfaces.

## Testing future command migrations

Future SDL command slices should update tests and docs with the command surface change:

- SDL CLI scenario tests should cover user-facing `sdl <name>` behavior, including project/global SDL extension command entries when relevant.
- Pi registration and parity tests should cover `/sdl:<name>` mirrors when a command is exposed in Pi.
- Source searches should prove stale old command names and `/code:<name>` surfaces were deleted or are mentioned only as explicitly labeled migration-away context.
