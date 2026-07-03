# Submit and PR package seams

## Summary

Commit `b61869b8e` (`Extract submit and PR metadata helpers into SDL package seams`) materially advanced the flow shared-code consolidation track after the A1+A9 foundation update. The checked-in flow `submit.ts` bundle was replaced by a readable command wrapper, and PR-regeneration/submit behavior moved behind package-owned internal migration seams instead of command-local flow duplication.

Implemented state:

- `.sdl/extensions/flow/src/commands/submit.ts` is now a hand-authored wrapper around `@sdl/sdl/submit` and `@sdl/sdl/checkpoint`, with terminal output and submit-failure summarization policy remaining command-local.
- `.sdl/extensions/flow/src/commands/regenerate-pr.ts` now delegates PR preparation and application to `@sdl/sdl/pr-description`.
- `ts/packages/sdl/src/submit.ts` owns the temporary submit runtime seam, but current validation shows that seam is stale after the Graphite extraction: it still imports submit orchestration symbols from `@sdl/core/submit` that now live under `@sdl/graphite/submit`.
- `ts/packages/sdl/src/pr-description.ts` owns PR-regeneration preparation/application over `@sdl/core/submit` helpers and `RealGithubPrGateway`.
- Flow worktree users moved toward package-owned pending-worktree/checkpoint models, while some flow-level Git disposition remains unresolved.

## Objective Impact

The roadmap is rebaselined to the landed package-seam shape:

- A3 GitHub-PR access is marked complete through the `@sdl/sdl/submit` and `@sdl/sdl/pr-description` seams, rather than through a separate `@sdl/sdl/github-pr` subpath.
- A4 PR-description consolidation is marked complete because regenerate-pr and submit now share package-owned PR-description orchestration and no new public `@sdl/sdl/sdk` surface was added.
- The submit-bundle replacement row is marked partial: the large checked-in bundle is gone from the flow command, but `just` currently fails at `ts/packages/sdl/src/submit.ts` because the runtime seam imports Graphite submit symbols from the old package.
- A2+A8 is marked partial: submit/regenerate-pr/checkpoint work moved to package-owned seams, but the remaining flow-level Git seam/disposition still needs one focused pass, especially around direct `ctx.exec("git", …)` use in `push` and the accepted boundary between flow-shared and package-owned Git helpers.

`objective.md` is updated to treat the submit bundle risk as de-risked, with remaining risk concentrated in submit wrapper policy and future public-SDK overpromotion.

## Follow-Ups

- First, repair the stale `@sdl/sdl/submit` runtime imports so `just` and submit scenario validation are green again; the likely target is the new `@sdl/graphite/submit` export boundary.
- Then finish A2+A8 by inspecting remaining direct Git use in flow commands and either routing it through the flow seam or recording why the mixed package-owned/per-command boundary is the accepted disposition.
- Preserve the no-new-public-`@sdl/sdl/sdk` boundary unless a later steer-first decision explicitly promotes a helper.
- Keep submit and regenerate-pr scenario coverage in the validation set for any changes to the package-owned seams or flow wrappers.
