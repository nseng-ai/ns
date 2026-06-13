# sdl

`sdl` is the emerging customer-facing Source Development Lifecycle CLI. Unlike `asdl-dev`, which is repo-internal tooling for ASDL contributors, `sdl` is the product boundary intended to become installable by users and extensible through plugins.

This first slice is deliberately small: it exposes checkpoint creation and a project-overridable command module at `.asdl/commands/cp.ts`. Override authors should import only from `@asdl/sdl/sdk`; the other package subpaths remain internal migration exports so existing ASDL packages can share checkpoint primitives during the transition.

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

Pi exposes the same capability as `/sdl:cp` through `.pi/extensions/sdl.ts`; `/code:cp` is not retained as a compatibility alias.

## Command-module SDK

Projects may override `sdl cp` by adding `.asdl/commands/cp.ts` with a default export created by `defineCommand()` from `@asdl/sdl/sdk`. That SDK subpath is the public author surface for command modules. The package's other exported subpaths are internal migration surfaces for ASDL workspace packages, not plugin APIs.
