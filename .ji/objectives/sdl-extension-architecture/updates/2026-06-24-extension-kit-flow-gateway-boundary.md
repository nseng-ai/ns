# Extension-kit flow gateway boundary

## Semantic Update

`@sdl/extension-kit` now exists as the above-SDK substrate package for SDL host-to-gateway adaptation. It owns:

- `createSdlCommandRunner()` and `SdlCommandExecApi`, moved out of `sdl-flow`;
- neutral SDL-host command helpers (`execSdlCommand`, `createSdlCliExecAdapter`);
- neutral Git host helpers (`createSdlGitGateway`, `execSdlGit`, `readSdlGitPorcelainStatus`).

Flow now consumes the package for submit and PR-description runtime gateway construction, and its old flow-local Git helper is a thin compatibility wrapper over `@sdl/extension-kit/git`. The flow worktree/CCC delegation seam also routes generic command execution through extension-kit while retaining flow-owned checkpoint and pending-worktree policy.

The push command now has an exported gateway-injected `runPushCore()` covered by `InMemoryGitGateway` unit tests for dirty, clean, and gateway-failure decisions. The CLI command face intentionally keeps the existing porcelain-status readback path so `sdl flow push` dirty-output compatibility and scenario assertions remain unchanged.

## Boundary decisions

- `@sdl/extension-kit` depends only on `@sdl/core` and `@sdl/sdl`; it does not depend on capability packages.
- Flow-specific command text, submit guidance, checkpoint semantics, pending-worktree wording, and PR-description policy stayed in `sdl-flow`.
- The Phase 2 Step 1 roadmap row should remain `[~]` until `cp` is explicitly rewired through extension-kit or a follow-up records why the current worktree/command seam is sufficient for cp construction.
