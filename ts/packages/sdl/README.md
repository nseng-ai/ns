# sdl

`sdl` is the emerging customer-facing Source Development Lifecycle CLI. Unlike `asdl-dev`, which is repo-internal tooling for ASDL contributors, `sdl` is the product boundary intended to become installable by users and extensible through plugins.

This first slice is deliberately pre-canned and small: it exposes only checkpoint creation. The package exports several explicit workspace subpaths so existing ASDL packages can share the checkpoint capability during the migration; those subpaths are not the future customer plugin API. User-pluggable `sdl` extensions are intentionally out of scope for this slice.

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

- `SDL_TEXT_BACKEND`: text generation backend, currently `pi`.
- `SDL_CHECKPOINT_MODEL`: backend-native model reference.

During the transition from `asdl-dev cp`, unset `SDL_*` values fall back to `ASDL_DEV_TEXT_BACKEND` and `ASDL_DEV_CHECKPOINT_MODEL`.

Pi exposes the same capability as `/sdl:cp` through `.pi/extensions/sdl.ts`; `/code:cp` is not retained as a compatibility alias.
