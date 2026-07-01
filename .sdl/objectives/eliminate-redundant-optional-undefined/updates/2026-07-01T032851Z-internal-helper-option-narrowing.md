# Internal Helper Option Undefined Narrowing

## Summary

Narrowed a residual non-public/internal-helper cluster after classifying the remaining raw candidates. This slice removed raw `?: T | undefined` from omission-only helper/record fields and converted the one environment-map option to the Objective's typed explicit-undefined contract:

- `ts/packages/infra/cli-theme/src/report.ts`: `RenderBufferedReportOptions.titleStyle` → plain optional (`"accent" | "plain"`).
- `ts/packages/infra/clinkr/src/confirmation.ts`: `CreateClinkrInteractionOptions.injectedStdin` → plain optional function.
- `ts/packages/infra/exec/src/testing.ts`: `RunnerCall.cwd` and `ScriptedCommandExecCall.options` → plain optional call-record fields.
- `ts/packages/kernel/src/extension-registry.ts`: `LoadSdlCommandCatalogOptions.env` → `ExplicitUndefined<"env-map", Record<string, string | undefined>>`.
- `ts/packages/tools/areg/src/gateways/github-gateway.ts`: real adapter `listSkillDirectoryNames` `ref` option → plain optional, matching the gateway interface and fake.
- `ts/packages/worktree-status/test/test-support.ts`: `ScriptedExec.onCall` → plain optional callback.
- `ts/packages/tools/packagechk/src/cli.ts`: normalized the `resolveClinkrInteraction` producer with `optionalEntry("injectedStdin", deps.stdin)` after the clinkr contract was narrowed, so absent injected stdin is omitted rather than passed as a present `undefined` property.

Semantic claim: these fields are internal rendering/interaction/test-helper/adapter option or call-record shapes whose construction and consumption already treat `undefined` as absence (`=== undefined` defaulting, optional chaining, or `optionalEntry` omission). Present-key `undefined` has no separate domain meaning. The kernel `env` field is the exception where the value is an environment map/DI seam, so the raw redundant union was replaced with the existing `ExplicitUndefined<"env-map", T>` contract instead of silently tightening the seam.

Scorecard using `node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs`:

| Scope                                                                                                                                                                                                | Raw optional-undefined properties | Typed explicit-undefined contracts | Legacy preserve markers | Undefined-normalization/check lines |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------: | ---------------------------------: | ----------------------: | ----------------------------------: |
| `ts` before                                                                                                                                                                                          |                                42 |                                 85 |                       0 |                                2298 |
| `ts` after                                                                                                                                                                                           |                                35 |                                 86 |                       0 |                                2298 |
| scoped (`cli-theme/report.ts`, `clinkr/confirmation.ts`, `exec/testing.ts`, `kernel/extension-registry.ts`, `areg/github-gateway.ts`, `worktree-status/test-support.ts`, `packagechk/cli.ts`) before |                                 7 |                                  0 |                       0 |                                  46 |
| scoped after                                                                                                                                                                                         |                                 0 |                                  1 |                       0 |                                  46 |

The scoped undefined-normalization/check count stayed flat: the packagechk producer normalization reused `optionalEntry` and did not add a new explicit `=== undefined` construction guard; other touched call paths already had their required defaults/omission checks.

## Objective Impact

Reduces repo-wide raw optional-undefined debt by 7 (42 → 35) while converting one env-map seam to a typed explicit-undefined contract (85 → 86). This exhausts the small residual safe singleton cluster identified by the previous update without reopening the known deferred public/API surfaces.

Preserved/deferred categories now visible in the remaining repo-wide raw inventory:

- `ts/packages/infra/github/test/github-cli.test.ts` — 3 local callback-capture fields already classified as preserved/unsafe because they mirror a `CommandRunner` callback parameter typed `ExecOptions | undefined`.
- `ts/packages/roaster/src/api.ts` and `ts/packages/roaster/src/project-config.ts` — 5 public/API/schema-facing residuals; still deferred pending a separate Roaster compatibility/API review.
- `ts/packages/sdl-capability-kit/src/{git,sdl-command,sdl-context}.ts` — 12 capability-kit tier fields; still deferred per Objective non-goals unless a separate normalized internal boundary justifies tightening.
- `ts/packages/sdl-sdk/src/{command,execution}.ts` — 15 public SDK tier fields; still deferred per Objective non-goals.

## Validation

- `pnpm --dir ts --filter @sdl/cli-theme run check` and `run test`: passed (76 tests).
- `pnpm --dir ts --filter @sdl/clinkr run check` and `run test`: passed (264 tests).
- `pnpm --dir ts --filter @sdl/exec run check` and `run test`: passed (3 tests).
- `pnpm --dir ts --filter @sdl/kernel run check` and `run test`: passed (97 tests).
- `pnpm --dir ts --filter @sdl/areg run check` and `run test`: passed (157 tests).
- `pnpm --dir ts --filter @sdl/worktree-status run check` and `run test`: passed (57 tests).
- `pnpm --dir ts --filter @sdl/packagechk run check` and `run test`: passed (26 tests).
- `just ts-format-check`: passed.
- `just ts-lint`: passed.
- `just ts-check`: passed.

## Follow-Ups

- The next substantive optional-undefined work likely needs a deliberate compatibility/API review for one of the remaining deferred groups: Roaster public/API/schema shapes, capability-kit gateway/command/context tier fields, or public `sdl-sdk` command/execution contracts. Do not narrow those mechanically just to reduce the remaining count.
- If an autonomous runner wants another local cleanup before touching public/deferred tiers, first re-inventory for newly introduced raw candidates rather than revisiting the already-classified deferred groups.
