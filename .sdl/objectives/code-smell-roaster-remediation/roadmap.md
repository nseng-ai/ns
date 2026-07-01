# Roadmap

## Work

Each row is one package/area cluster from the code-smell-roaster sweep. Re-verify findings against current code before implementing; record a disposition (fixed / disposed / routed) per finding when the row is checked off, not just a single line for the whole cluster. A cluster may be split into multiple PRs (e.g., by sub-package) when it's too large for one coherent review unit — split the row into sub-rows at pickup time if so.

- [ ] **infra** — 29 findings (4 high / 13 medium / 12 low) across brmem, clinkr, core, exec, git, github, graphite, cli-runtime, cli-theme, time, test-kit. See `references/infra.md`. Check for overlap with `ts-cli-core-structural-cleanup`'s Git/GitHub gateway dedup rows before implementing.
- [ ] **capabilities** — 24 findings (7 high / 13 medium / 4 low) across flow, slot, land. See `references/capabilities.md`. Check for overlap with `ts-cli-core-structural-cleanup`'s Flow land-stack rows before implementing.
- [ ] **local-pi-tools** — 19 findings (5 high / 12 medium / 2 low) across context-profiler, grill, pr-feedback-watch, pr-previews, runner-subagents, thermo-council, backing-skill-commands. See `references/local-pi-tools.md`. Includes two large Divergent Change god-files (`thermo-council/orchestrator.ts`, `pr-feedback-watch/controller.ts`) that may warrant their own sub-slice.
- [ ] **capability-pi** — 13 findings (1 high / 6 medium / 6 low) across branch-context, ccc, flow, handoff, objective. See `references/capability-pi.md`.
- [ ] **tools** — 12 findings (3 high / 7 medium / 2 low) across areg, packagechk, vibechk. See `references/tools.md`. Check for overlap with `ts-cli-core-structural-cleanup`'s areg god-file decomposition row.
- [ ] **hosts** — 8 findings (2 high / 4 medium / 2 low) across hosts/pi, hosts/sdlcc. See `references/hosts.md`. Includes one large Divergent Change finding in `pi/src/commands/cli-extension.ts`.
- [ ] **objective** (package) — 6 findings (0 high / 4 medium / 2 low). See `references/objective-package.md`.
- [ ] **roaster** — 6 findings (0 high / 4 medium / 2 low). See `references/roaster.md`.
- [ ] **pi-extensions** (`.pi/extensions`, `.pi/lib`) — 5 findings (0 high / 3 medium / 2 low). See `references/pi-extensions.md`.
- [ ] **aretro** — 5 findings (0 high / 3 medium / 2 low). See `references/aretro.md`.
- [ ] **docs-site** — 4 findings (1 high / 2 medium / 1 low). See `references/docs-site.md`.
- [ ] **ccc** — 4 findings (1 high / 3 medium / 0 low). See `references/ccc.md`.
- [ ] **handoff** — 4 findings (0 high / 2 medium / 2 low). See `references/handoff.md`.
- [ ] **branch-context** — 3 findings (1 high / 2 medium / 0 low). See `references/branch-context.md`.
- [ ] **cmux** — 3 findings (1 high / 2 medium / 0 low). See `references/cmux.md`.
- [ ] **kernel** — 3 findings (1 high / 2 medium / 0 low). See `references/kernel.md`.
- [ ] **plans** — 3 findings (1 high / 2 medium / 0 low). See `references/plans.md`.
- [ ] **sdl-capability-kit** — 3 findings (1 high / 1 medium / 1 low). See `references/sdl-capability-kit.md`.
- [x] **address** — 3 findings (0 high / 1 medium / 2 low). See `references/address.md`.
  - fixed: Data Clumps for GitHub PR target payloads; `PrTargetPayload`, `prTargetPayloadSchema`, and `buildPrTargetPayload` now own the shared target shape used by download-feedback and pr-checks payloads/schemas, with `head_ref_oid` included only for pr-checks output.
  - disposed: Speculative Generality in `json-input.ts`; re-probe found file JSON input is existing test-covered behavior in `ts/packages/address/test/unit/json-input.test.ts`, and removing it would require behavior/test churn outside this Objective's no-test-source-edit boundary.
  - fixed: Repeated Switches for PR target failures; `prTargetFailureExit` now maps common `git_failure`, `pr_feedback_failure`, and `detached_head` results, leaving download-feedback and pr-checks operations to handle only their success/miss-specific cases.
  - validation: `pnpm --dir ts --filter @sdl/address run test`, `pnpm --dir ts --filter @sdl/address run check`, `just ts-format-check`, `just ts-lint`, and `just ts-check` passed on 2026-06-30.
- [x] **worktree-status** — 3 findings (0 high / 2 medium / 1 low). See `references/worktree-status.md`.
  - fixed: Repeated Switches for `GtCommitStatus`; `formatGtCommitStatus(commits, "full" | "compact")` now owns the variant switch and both status rendering and footer rendering derive their previous strings from it.
  - fixed: Duplicated Code for renderer contracts; `CustomMessage`, `RenderTheme`, `RenderComponent`, and `WorktreeStatusMessageRenderer` are canonical in `types.ts`, with `status.ts` and `extension.ts` importing the shared contracts instead of redeclaring them.
  - fixed: Data Clumps for GitHub PR status details; `GhPrDetails` now names the shared `prNumber`/`url`/`threads`/`checks` shape used by both available and head-mismatch statuses and by PR detail rendering.
  - validation: `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just ts-test` passed on 2026-06-30.
- [x] **ts-root** (`ts/scripts`, `ts/vitest.*.config.ts`) — 2 findings (0 high / 2 medium / 0 low). See `references/ts-root.md`.
  - fixed: Shotgun Surgery in `ts/vitest.config.ts`; default-test exclusions now derive from `SPECIALIZED_TEST_CATEGORIES`, so adding a specialized category is one registry edit plus its category-specific config rather than a manual exclude-list lockstep edit.
  - fixed: Duplicated Code in `ts/vitest.shared.ts`; `testGlobsFor(subdir?)` owns the canonical two-pattern package test glob shape, and the default, integration, and TypeScript style guard configs all derive their include/exclude globs from that helper/registry.
  - validation: `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just ts-test` passed on 2026-06-30.

## Parked

(none)
