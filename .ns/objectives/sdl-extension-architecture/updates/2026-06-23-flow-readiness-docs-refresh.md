# Flow Readiness Docs Refresh

## Summary

The flow capability-area consolidation track now has its documentation/readiness refresh. The durable docs and context surfaces describe the maturity ladder for repeated flow command-author seams:

1. raw command-local logic;
2. flow-shared helpers under `.sdl/extensions/flow/src/shared/`;
3. package-owned behavior through documented `@sdl/sdl/*` internal-migration-export subpaths;
4. deferred public `@sdl/sdl/sdk` promotion only after a separate explicit SDK decision.

The refresh also corrected grouped-flow wording and helper-path drift. Current repository flow commands are documented as `sdl flow <name>` with static `/sdl:flow:<name>` Pi mirrors, while generic flat `sdl <name>` extension entries remain a separate SDL extension capability.

## Objective Impact

This completes the docs/readiness row for the flow shared-code track. The Objective now records the area model in durable user/agent-facing places without implying any new public SDK surface:

- `.sdl/extensions/AGENTS.md` records the flow helper maturity ladder and the public-SDK promotion boundary.
- `ts/packages/sdl/docs/sdk-reference.md` points repeated helper code to `.sdl/extensions/flow/src/shared/` and keeps `internalMigrationExports` distinct from author API.
- `ts/packages/sdl/CONTEXT.md` names the flow capability-area maturity ladder and flow-shared helper boundary.
- `ts/packages/sdl/README.md` documents grouped flow command surfaces, internal migration exports, and the readiness ladder.
- `roadmap.md` now matches the current helper tree instead of preserving former helper-path claims that no longer match the file tree.

No public `@sdl/sdl/sdk` export was added or reclassified.

## Follow-Ups

- Treat the submit row's remaining validation evidence as routine validation/recording work unless it uncovers new semantic design issues.
- Revisit public SDK promotion only through a future steer-first decision with cross-extension evidence.
- Consider Objective closure once routine validation/PR evidence has been recorded and no new semantic flow-extension architecture work remains.
