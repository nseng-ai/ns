# Reopened for SDL Objective Execution Integration

## Summary

The Objective was closed prematurely after the capability/context-documentation slice. User review clarified the actual completion bar: Objective is not done until Objective is structured as an SDL execution and properly hooked into the SDL system as a vanilla extension.

Current CLI evidence shows the missing integration:

```bash
objective --help
```

works and shows the Objective command family, while:

```bash
sdl objective --help
```

falls back to generic `sdl` help and does not expose Objective commands. This means Objective remains reachable through the standalone top-level `objective` binary and Pi slash-command wrappers, but is not yet properly integrated as `sdl objective ...`.

Tracking changes made in response:

- Removed the premature Closure Marker so the Objective is active again.
- Removed `## Closure` prose from `objective.md` and replaced the closure meaning with active scope, completion criteria, assumptions/risks, and open-question guidance for SDL Objective execution integration.
- Added an open roadmap row for `SDL Objective execution / vanilla extension integration`.
- Kept the existing final-context documentation update as historical evidence, but superseded its closure conclusion with this corrective update.

## Objective Impact

The Objective remains open. Completed capability/cycle-break work is still valid: `@sdl/objective/api`, consumer repoints, Pi↔CCC edge removal, acyclicity guard, thermonuclear review, and context documentation remain completed rows. The remaining active work is the SDL command-system integration slice.

Completion now requires `sdl objective ...` to expose and run Objective commands through the SDL execution/extension system, plus an explicit compatibility decision for the top-level `objective` binary.

## Follow-Ups

- Implement the SDL Objective execution / vanilla extension integration slice.
- Decide whether top-level `objective` becomes a compatibility delegator/shim, remains temporarily supported with explicit documentation, or is retired after `sdl objective` works.
- Add targeted CLI tests and evidence for `sdl objective --help` and representative subcommands.
