# Flow command migration rebaseline

## Summary

The Objective is rebaselined to the current `master` state after the grouped flow-command migration landed as commit `1df352356` (`Group SDL lifecycle commands under sdl flow` / #2048). The project-local extension surface now lives under `.sdl/extensions/flow/` with `package.json` command entries for the SDL lifecycle family, including `regenerate-pr` and `land`.

This corrects stale Objective tracking that still described `regenerate-pr`, `land`, and broader Pi mirror rework as incomplete. The durable command shape is now `sdl flow <command>` with static `/sdl:flow:*` Pi mirrors, not the earlier flat `sdl <command>` and flat `/sdl:*` mirror shape used by intermediate migration slices.

## Objective Impact

The roadmap now marks PR metadata regeneration, land, and Pi SDL mirror rework complete. `regenerate-pr` is recorded as `.sdl/extensions/flow/src/commands/regenerate-pr.ts`, mirrored by `/sdl:flow:regenerate-pr`, and intentionally kept in the project-local GitHub/PR-description policy layer rather than promoted into a public GitHub SDK.

`land` is recorded as `.sdl/extensions/flow/src/commands/land.ts`, mirrored by `/sdl:flow:land`, and deliberately implemented as a thin adapter over `@sdl/ccc/land`. That answers the land boundary question for this Objective: CCC lower-package delegation is acceptable for the command-first slice, and a public landing/Graphite-stack SDK should be revisited only if later extensions need the same portable contract.

The Objective narrative, assumptions, risks, completion criteria, and open questions now refer to the grouped flow extension and static Pi mirror model. The only active roadmap row left is the final command-first closure-boundary disposition: record what the experiment proved, park or spawn follow-up capability work, and avoid folding bundled extensions or sophisticated workflows into this Objective by accident.

## Follow-Ups

- Write the final command-first closure-boundary disposition and decide whether to close this Objective afterward.
- Treat dynamic arbitrary Pi mirrors, bundled first-party extensions, submit debundling, broader SDK helper promotions, and sophisticated workflow migrations as follow-up candidates unless explicitly chosen in that closure-boundary step.
- Revisit a public landing/Graphite-stack interface only if another command or future extension needs the CCC land behavior as a portable contract.
