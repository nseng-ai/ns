# Established the @sdl/objective/api Capability API facade (row 1)

## Summary

Row 1 of the child Objective is complete: `@sdl/objective` now exposes a curated `@sdl/objective/api` Capability API. Per the user's steer-first shape choice (#2, "full client object" like `@sdl/slot/api`), `ts/packages/objective/src/api.ts` provides a `createObjectiveClient(options)` factory returning an `ObjectiveClient` with `listObjectives`, `readObjective`, and `listActiveCandidates`, each returning clean `{ ok: true, ... } | { ok: false, failure }` results — no `ClinkrExit`/command-face types leak across the API boundary.

Implementation notes:

- `ts/packages/objective/package.json` `exports` now maps `"./api": "./src/api.ts"` and `"./command-face": "./src/cli.ts"`, matching the slot precedent (`@sdl/slot` exports `./api` + `./command-face`).
- The gateway-injected Domain Core seam already existed: `ObjectiveCliContext` carries `git: GitGateway` and `storage: ObjectiveStorage`. The client resolves a real context lazily via `createRealObjectiveContext`, or accepts an injected `context` through `ObjectiveClientOptions` for in-memory testing. No raw `ctx`/`SdlExtensionApi` is exposed.
- To keep the API free of `ClinkrExit`, the inner domain reader in `operations/read-objective.ts` was exported as `readObjectiveRecord` (returns the clean `{type:"ok"|"storage-error"}` union); the single internal caller (`runReadObjective`) was repointed. `listObjectives` builds on `buildObjectiveListResult` and `listActiveCandidates` on `storage.checkoutInventory()` + `matchesStatusFilter`, all of which already return clean domain unions.
- New unit coverage: `test/unit/api.test.ts` (6 tests) covers active-candidate filtering (open-only), default/`all` status filters, ok and not_found reads, and storage-failure → `ok:false` mapping, using `FakeObjectiveStorageGateway` + `InMemoryGitGateway`.

Validation (all green): `pnpm --dir ts run check` (tsgo), objective Vitest suite (12 files / 73 tests, incl. the 6 new), `just ts-format-check`, `just ts-lint`, `just ts-guard` (style/private-peer-import guard), `just ts-deps-check` (syncpack).

## Objective Impact

- Roadmap row 1 ("Establish the `@sdl/objective/api` Capability API surface and the gateway-injected Domain Core boundary") moves to `[x]` with the evidence above.
- Establishes the target surface that row 2's relocation (objectives domain out of `@sdl/pi/objectives/*`) and row 3's consumer repoint (`ccc`/`sdlcc`) build onto. The Pi selection/skill-prompt surface is deliberately not yet on the client.
- No change to the parent `sdl-extension-architecture` records in this step.

## Follow-Ups

- Row 2: relocate `@sdl/pi/objectives/{selection,picker,list,extension}` into `@sdl/objective` as a gateway-injected Domain Core, growing `ObjectiveClient` with the selection/skill-prompt surface and leaving a thin Pi shell.
- Row 3: repoint `ccc` (`objective-stack-impl.ts`, `cmux/sidebar.ts`) and `sdlcc` (`objective-tab.ts`) to `@sdl/objective/api`, and resolve the reverse `@sdl/objective` → `@sdl/pi/runner-subagents/usage` dependency so `@sdl/objective` drops `@sdl/pi`.
- When the selection surface lands on the client, decide whether `readObjective`/`listObjectives` result shapes need any consumer-driven additions.
