# CP extension-kit seam disposition

## Summary

The Phase 2 step 1 `cp` follow-up is now explicitly dispositioned without additional production-code changes. Current source inspection shows that `sdl flow cp` already consumes the above-SDK `@sdl/extension-kit` boundary through the flow worktree/checkpoint seam:

- `ts/packages/extensions/flow/src/commands/cp.ts` is a thin command shell for command-specific policy: trunk refusal, clean-worktree refusal, dry-run wording, checkpoint message generation, and final output formatting.
- `ts/packages/extensions/flow/src/shared/worktree.ts` routes pending-worktree Git inspection through `loadPendingWorktreeSnapshot()` with `execGit(ctx, ...)`, and that helper delegates to `execFlowGit` from the flow Git shim.
- `ts/packages/extensions/flow/src/shared/git.ts` is now only a compatibility re-export over `@sdl/extension-kit/git` (`execSdlGit`, `readSdlGitPorcelainStatus`).
- `worktree.ts` also re-exports `createSdlCliExecAdapter` and `execSdlCommand` from `@sdl/extension-kit/git`, keeping generic host command execution in extension-kit while flow retains checkpoint and pending-worktree wording.
- `createCommitWithPreparedMessage()` still lives in flow because staging, committing, reading back the checkpoint, temporary-file naming, and failure text are flow checkpoint policy, not neutral SDK host adaptation.

A new `runCpCore()` / `InMemoryGitGateway` split is not required for this row. Unlike `push`, `cp` already delegates its repository snapshot semantics to the existing `@sdl/sdl/pending-worktree` seam and its host execution to extension-kit wrappers; forcing another gateway-injected core here would duplicate the pending-worktree/checkpoint abstraction rather than clarify the Phase 2 layer boundary.

## Objective Impact

The Phase 2 roadmap row **“1. Stand up `@sdl/extension-kit`”** is now complete. The remaining open work should move to step 2: locking cross-capability conventions (`@sdl/<cap>/api`, gateway-injected-core rule, and deep-import/cycle enforcement).

This disposition preserves the architecture decisions from `updates/2026-06-24-extension-kit-flow-gateway-boundary.md`:

- `@sdl/extension-kit` owns neutral SDL host-to-command/Git adaptation.
- Flow-specific command text, checkpoint semantics, pending-worktree wording, and model-generation policy stay in the flow capability.
- Gateway-injected domain cores should be introduced where they remove real host-coupling from domain logic; they should not be added ceremonially when an existing seam already carries that responsibility.

## Follow-Ups

- Start Phase 2 step 2 as the next semantic slice: ratify and document Peer API subpath mechanics, the gateway-injected-core rule, and enforcement against deep sibling imports/cycles.
- If future `cp` behavior grows beyond checkpoint policy into reusable repository-domain decisions, evaluate that new behavior against the same extension-kit versus capability-owned boundary instead of retroactively widening `@sdl/sdl/sdk`.
- Keep routine validation evidence on the relevant implementation branch; no new code was changed for this disposition.
