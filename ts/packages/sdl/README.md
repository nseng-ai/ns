# sdl

`sdl` is the Source Development Lifecycle CLI. It is the durable public command boundary for software-development-lifecycle workflows that have migrated out of repo-internal tooling.

`asdl-dev` is private ASDL contributor tooling and should shrink as lifecycle commands migrate. Lower packages such as `@asdl/ccc` may continue to own repo-specific orchestration internals, but SDL owns the public lifecycle command surface once a workflow moves to `sdl`.

## Command ownership and hard cutover

Migrated lifecycle commands target these surfaces:

- CLI: `sdl <name>`
- Pi, when a mirror exists: `/sdl:<name>`

A migration slice should delete the old `asdl-dev <name>` command and old `/code:<name>` Pi mirror in the same slice unless an explicit, documented exception is approved before implementation. Do not keep compatibility aliases only for autocomplete or habit.

## Project-specific command extensions

SDL treats project-specific lifecycle behavior as first-class. The first-pass extension shape is a flat per-command TypeScript module:

```text
.asdl/commands/<command>.ts
```

Use single-segment command names for the first pass, such as `submit`, `changes`, `autobranch`, `autoslot`, `land`, and `push`. Nested command groups can be revisited after the flat model proves itself.

Current implementation support is intentionally narrower than the documented direction: today, only `sdl cp` has a project override at `.asdl/commands/cp.ts`. Later migration slices will standardize command loading beyond that one-off path.

## Public command-module SDK

Command authors should import only from `@asdl/sdl/sdk`:

```ts
import { defineCommand, failed, ok } from "@asdl/sdl/sdk";
```

That SDK subpath is the public author API for SDL command modules. It exposes the command shape and helpers, including:

- `defineCommand()` for declaring the default command export;
- `ok()` and `failed()` for returning command results;
- `SdlContext` for command execution capabilities;
- `SdlResult` for success/failure results.

`SdlContext` provides:

- `ctx.cwd`: repository working directory for the command;
- `ctx.env`: environment visible to the command;
- `ctx.exec(command, args, options)`: low-level argv execution;
- `ctx.model`: raw text-generation capability.

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

Projects may override `sdl cp` by adding `.asdl/commands/cp.ts` with a default export created by `defineCommand()` from `@asdl/sdl/sdk`. The command object must be named `cp`.

Pi exposes the same capability as `/sdl:cp` through `.pi/extensions/sdl.ts`; `/code:cp` is not retained as a compatibility alias.

## Testing future command migrations

Future SDL command slices should update tests and docs with the command surface change:

- SDL CLI scenario tests should cover user-facing `sdl <name>` behavior, including project-specific command modules when relevant.
- Pi registration and parity tests should cover `/sdl:<name>` mirrors when a command is exposed in Pi.
- Source searches should prove stale `asdl-dev <name>` and `/code:<name>` surfaces were deleted or are mentioned only as explicitly labeled migration-away context.
