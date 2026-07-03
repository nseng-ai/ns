# Semantic Update: Repeated Integration Setup for Localized Domain Logic Is an Anti-Pattern

## Insight (generalized anti-pattern)

A distinct and common default-lane performance anti-pattern: **a test repeatedly stands up
integration setup (temp project, real `.sdl/extensions` discovery + dynamic import, real Git,
etc.) once per case, when the thing actually under test is localized domain/bridge logic that
needs no real backend.** The repeated setup dominates wall time while proving nothing the
integration boundary needs to prove on every case.

The correct shape is a three-way split:

1. **Scenario/unit test for the localized logic** — exercise the business/bridge logic directly
   through an injected seam (fake `runCli`, fake gateway, in-memory collaborator). No integration
   setup. This is where per-case fan-out (e.g. "for each command…") belongs, because each case is
   cheap.
2. **One integration test at the real boundary** — a single representative case proves the real
   backend wiring works (real loader discovers/imports, real Git, etc.). It does not re-run once
   per localized case.
3. Keep the integration smoke in the explicit integration lane (`test/integration/`), not the
   default lane.

Heuristic for spotting it: if a `for (const case of cases)` loop re-creates a temp project / real
repo / real loader per iteration, ask "does each iteration need the real backend, or just the
seam?" If the loop only varies localized inputs and the backend behavior is identical, the loop
belongs on the fake seam and the backend gets one smoke.

## Applied slice

`packages/pi-extensions/test/sdl-extension.test.ts` registered the real `sdlExtension` and then,
**once per flow command (10×)**, created a temp project with a project-local `.sdl/extensions/flow`
package, mutated `process.env.HOME`, and invoked the command through the real SDL CLI loader — only
to assert that `/sdl:flow:<name>` routes to `sdl flow <name>` and renders one output message. That
is localized Pi-bridge routing logic, not loader behavior, repeated against full integration setup.

Changes:

- Added a narrow seam: `registerSdlExtension(pi, { runCli })` in
  `packages/pi-extensions/src/sdl-extension.ts`. Default `sdlExtension(pi)` still uses the real
  `runCli`; tests inject a fake.
- Rewrote the per-command tests to inject a fake `runCli`, assert argv routing
  (`[["flow", commandName]]`) and single rendered output. No temp project, no `HOME` mutation, no
  real discovery/import.
- Moved the all-flow-commands real-loader test
  (`checked-in flow extension command entries load successfully`) out of
  `packages/sdl/test/unit/extension-registry.test.ts` into a new integration test
  `packages/sdl/test/integration/flow-extension-registry.test.ts`. That single test still proves
  real discovery + dynamic import of every checked-in flow command entry.

## Performance evidence

- Measured command: `pnpm --dir ts exec vitest run packages/pi-extensions/test/sdl-extension.test.ts packages/sdl/test/unit/extension-registry.test.ts`
- Baseline (pre-change, verbose batch including these files): the per-command mirror tests ran
  12–37ms each plus the 121ms `checked-in flow extension command entries load successfully` test;
  the original five-suite verbose run reported `tests 698ms`.
- Post-change: these two files report `Tests 26 passed`, `tests 98ms` (`Duration 443ms`).
- Integration: `pnpm --dir ts run test:integration packages/sdl/test/integration/flow-extension-registry.test.ts`
  → 1 test passed, tests 160ms.
- Repetition/noise notes: single local runs each; directional.
- Cost handling: the default lane no longer performs real `.sdl/extensions/flow` discovery/import
  per flow command. That real-loader cost is now a single integration test, not 10 default-lane
  setups plus 1 unit-lane loader test.
- Coverage retention: argv routing + output rendering for every flow command still covered
  (now via fake seam); real discovery/import of all 10 checked-in entries still covered (now one
  integration test). Registration-surface test (`exposes only nested flow SDL lifecycle mirrors`)
  unchanged.

## Validation

- `pnpm --dir ts run check` (tsgo) clean.
- `just ts-lint`, `just ts-format-fix` clean.
- `pnpm --dir ts exec vitest run packages/pi-extensions packages/sdl` → 116 files, 1382 tests pass.
- Integration test runs only under `vitest.integration.config.ts` (confirmed excluded from default).
