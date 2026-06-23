# Flow shared-code consolidation track

## Summary

After the command-first closure boundary, the `flow` group still carries substantial duplicated command-author code. `regenerate-pr.ts` re-implements roughly 600 lines of PR-description machinery (the system prompt, managed-region parse/format, prompt/model resolution, lockfile filtering, diff truncation, prompt hashing, validation, `commandFailure`, `withTemporaryFile`, `isRecord`) that already exist in `@sdl/core/submit`. Generic exec/format/JSON helpers are duplicated between `regenerate-pr.ts`, `autobranch.ts`, and the `submit.ts` bundle. `land.ts`, `pull-trunk.ts`, and `autoslot.ts` repeat an identical CCC-CLI delegation shape. And `submit.ts` is a ~3017-line checked-in bundle that `.sdl/extensions/AGENTS.md` explicitly calls a liability, even though `@sdl/core/submit` already exposes `runSubmitCommand`/`orchestratePrDescription`.

This update opens a "flow shared-code consolidation" track to remove that duplication. Three decisions were made with the user:

- Scope: full consolidation, including a shared GitHub-PR access seam and rewriting the `submit.ts` bundle into a readable delegating command.
- SDK boundary: stay within the internal-migration-export subpaths (`@sdl/sdl/pr-description` and siblings) and the project-local `flow/src/shared/` helper tier; add no new public `@sdl/sdl/sdk` author API in this track.
- Tracking: record the work as new roadmap rows on this Objective rather than spawning a child Objective, reopening `sdl-extension-architecture` as the active consolidation track.

## Objective Impact

This update reopens active work; the Objective is intentionally kept open rather than closed. Scope, Completion Criteria, Assumptions and Risks, and Open Questions in `objective.md` now name the flow shared-code consolidation track and its no-new-public-SDK boundary. `roadmap.md` gains a `## Flow shared-code consolidation` section with six unchecked rows:

1. Extract shared exec/format/JSON utilities.
2. Consolidate PR-description machinery behind shared helpers (and widen the `@sdl/sdl/pr-description` internal-migration-export subpath).
3. Introduce a shared GitHub-PR access seam reusing `@sdl/core/submit`'s `RealGithubPrGateway`.
4. Consolidate the CCC-CLI delegation boilerplate across `land`/`pull-trunk`/`autoslot`.
5. Replace the checked-in `submit.ts` bundle with a readable delegating command.
6. Document the expanded internal-migration-export and shared-helper model.

This supersedes the earlier closure-boundary update's open choice ("decide later whether to close `sdl-extension-architecture` or keep it open for a residual decision") by keeping it open for this named track. That earlier update remains an accurate historical record of the command-first closure.

## Follow-Ups

- Sequence the rows roughly in the listed order: shared utilities and PR-description consolidation unblock the GitHub-PR seam, which together with the shared helpers unblocks the `submit` bundle rewrite; documentation lands last.
- Revisit the deferred public-`@sdl/sdl/sdk` promotion decision only after the shared-helper tier has re-exposed most of `@sdl/core/submit` and cross-extension evidence justifies graduating specific helpers.
- Preserve the submit behavior matrix with faked `git`/`gt`/`gh` scenario tests across the bundle rewrite rather than trusting the rewrite by inspection.
