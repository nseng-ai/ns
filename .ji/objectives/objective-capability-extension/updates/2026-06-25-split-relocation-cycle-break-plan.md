# Split Objective relocation and cycle-break plan into four slices

## Summary

The broad attached implementation plan for Objective API relocation and Pi/CCC cycle-breaking was intentionally narrowed before code edits. The plan remains useful roadmap context, but it is too expansive for one implementation pass because it mixes a small neutral dependency move, Objective-domain relocation, downstream consumer repoints, and risky Pi/CCC command-registration ownership changes.

Durable planning decision: carry the work as four separate roadmap items/slices, each with its own stale-edge gate:

1. **Bottom slice: runner-usage neutralization**
   - Move `@sdl/pi/runner-subagents/usage` primitives to neutral `@sdl/core/runner-usage`.
   - Repoint Objective and Pi imports.
   - Remove `@sdl/pi` from `@sdl/objective/package.json`.
   - Gate: `rg "@sdl/pi" ts/packages/objective/src ts/packages/objective/package.json` should have no matches.

2. **Objective API relocation slice**
   - Move list/picker/selection/prompt/command-policy domain logic into `@sdl/objective`.
   - Export the surface via `@sdl/objective/api` as `createObjectiveClient(...)` plus named helper exports.
   - Keep Pi wrappers thin: command registration, immediate acknowledgement, Pi `CommandContext` adaptation, notifications, `sendMessage`, skill expansion, and runtime-specific presentation remain in Pi.
   - Move pure/domain tests to Objective; keep Pi tests for Pi behavior.
   - Gate: Objective/Pi package tests plus typecheck.

3. **Consumer repoint slice**
   - Repoint `ccc` and `sdlcc` from `@sdl/pi/objectives/*` to `@sdl/objective/api`.
   - Adjust package manifests.
   - Gate: `rg "@sdl/pi/objectives" ts/packages` should show no production consumer imports.

4. **Separate risky slice: Pi→CCC cycle break**
   - Execute the chosen direction: `@sdl/ccc` may continue depending on neutral `@sdl/pi` helper subpaths, while `@sdl/pi` must stop importing `@sdl/ccc` and drop the `@sdl/ccc` dependency.
   - Move/remove Pi imports of CCC: Objective stack implementation registration, worktree-status, handoff-tab, branch-context upstack implementation, cmux focused-terminal-tab shim, old flow wrappers (`land`, `trunk-pull`), and parity records.
   - Preserve user-visible command names and behavior; only ownership/dependency direction changes.
   - Gate: `rg "@sdl/ccc" ts/packages/pi/src ts/packages/pi/package.json` should have no matches.

The topological `ts-guard` acyclicity check and final Objective `CONTEXT.md` documentation remain parked until after the real graph is acyclic enough to document and enforce without false failures.

### Planning context retained for future implementation sessions

Current branch/context when this split was recorded:

- Branch: `objective-api-relocation-pi-ccc-cycle-break`.
- Graphite parent considered: `add-objective-api-facade`.
- Local branch diff above parent at update time: empty.
- Worktree status at update time: clean before the Objective update.
- Row 1 is already complete: `@sdl/objective/api` exposes `createObjectiveClient(...)` with `listObjectives`, `readObjective`, and `listActiveCandidates`, backed by gateway-injected `ObjectiveCliContext` and tested in `ts/packages/objective/test/unit/api.test.ts`.

Important current code facts from the prior plan/inventory:

- `ts/packages/objective/src/api.ts` already exports the initial `@sdl/objective/api` facade.
- `ts/packages/objective/package.json` currently declares `@sdl/pi` because `ts/packages/objective/src/operations/runner-subagent-usage.ts` imports parser/totals primitives from `@sdl/pi/runner-subagents/usage`.
- `ts/packages/pi/src/runner-subagents/usage.ts` owns the neutral-looking JSONL parser/totals primitives:
  - `RuntimeRunnerSubagentUsageTotals`
  - `RuntimeRunnerSubagentUsageCostTotals`
  - `RunnerSubagentUsageModelRef`
  - `RunnerSubagentUsageRecord`
  - `ParseRunnerSubagentUsageJsonlResult`
  - `parseRunnerSubagentUsageJsonl`
  - `addRuntimeRunnerSubagentUsageTotals`
  - `addRuntimeRunnerSubagentUsageCostTotals`
- `ts/packages/pi/src/objectives/list.ts` owns `ObjectiveList`, `ObjectiveListRecord`, and `parseObjectiveList(stdout)` over Pi machine-envelope parsing.
- `ts/packages/pi/src/objectives/picker.ts` owns changed-objective path parsing, label formatting, changed-first ordering, and picker-title helpers.
- `ts/packages/pi/src/objectives/selection.ts` mixes pure prompt construction and selection policy with Pi `CommandContext` adaptation and host command execution.
- `ts/packages/pi/src/objectives/extension.ts` mixes Pi command registration/presentation with Objective-specific `/objective:list` args, completions, candidate parsing, and Objective skill command specs.
- Production consumers of `@sdl/pi/objectives/*` include:
  - `ts/packages/ccc/src/objective-stack-impl.ts`
  - `ts/packages/ccc/src/cmux/sidebar.ts`
  - `ts/packages/sdlcc/src/objective-tab.ts`
- Test/type consumers include `ts/packages/sdlcc/test/unit/objective-tab.test.ts` and Pi objective tests.
- Current `@sdl/pi`→`@sdl/ccc` edges include:
  - `ts/packages/pi/src/objectives/extension.ts` importing `@sdl/ccc/objective-stack-impl`
  - `ts/packages/pi/src/flow/land.ts` importing `@sdl/ccc/land`
  - `ts/packages/pi/src/flow/trunk-pull.ts` importing `@sdl/ccc/trunk-pull`
  - `ts/packages/pi/src/worktree-status/{extension,footer-format}.ts` importing `@sdl/ccc/worktree-status`
  - `ts/packages/pi/src/cmux/focused-terminal-tab.ts` re-exporting `@sdl/ccc/cmux/focused-terminal-tab`
  - `ts/packages/pi/src/handoff/tab.ts` importing `@sdl/ccc/handoff-tab`
  - `ts/packages/pi/src/branch-context/from-plan-commands.ts` importing `@sdl/ccc/branch-context-up-and-impl`
  - `ts/packages/pi/package.json` declaring `@sdl/ccc`
- Current `@sdl/ccc`→`@sdl/pi` imports include neutral/runtime helper subpaths such as `commands/ack`, `skills/expansion`, `terminal/presentation`, `cmux/types`, `cmux/primitives`, `cmux/pi-launch`, `runtime/machine-envelope`, `branches/slug`, and `sessions/replacement`; these may remain under the chosen direction unless a local move is needed for correctness.

Architectural decisions preserved:

- Capability domain logic belongs in capability packages, not in the Pi runtime host.
- Cross-package consumers should use curated package exports such as `@sdl/objective/api`, not `@sdl/objective/src/...` deep imports.
- `@sdl/objective` must not import `@sdl/pi`.
- `@sdl/pi` must not import `@sdl/ccc` in the final cycle-break state.
- `@sdl/ccc` may continue importing neutral `@sdl/pi` helper subpaths; this is the chosen direction.
- Project-local `.pi/extensions/*.ts` adapters may import CCC directly as discovery/registration surfaces; that does not count as an `@sdl/pi` package dependency.
- User-visible command names should not be renamed or removed to break the cycle.
- Routine validation belongs as evidence on rows/updates, not as standalone roadmap work.

Suggested stale-edge gates for future slices:

```bash
rg "@sdl/pi" ts/packages/objective/src ts/packages/objective/package.json
rg "@sdl/pi/objectives" ts/packages
rg "@sdl/ccc" ts/packages/pi/src ts/packages/pi/package.json
rg "@sdl/pi" ts/packages/sdlcc
```

Suggested final validation once the slices are implemented:

```bash
just ts-deps-check
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-guard
just dprint-check
```

## Objective Impact

- Roadmap row 1 remains complete.
- The previous combined row for Objective relocation and consumer/dependency cleanup has been split into three independently reviewable rows: runner-usage neutralization, Objective API relocation, and consumer repoint.
- The Pi/CCC cycle-break is now explicitly isolated as its own risky row after the lower Objective relocation work.
- The `ts-guard` acyclicity check and final Objective context documentation are parked until after the graph is truly acyclic and the boundary can be documented accurately.
- Open questions were narrowed: the runner-usage home and Pi/CCC direction are now decisions, while the remaining uncertainties are around Pi extension presentation split, behavior preservation during ownership moves, and the later acyclicity edge source.

## Follow-Ups

- Start with the bottom runner-usage neutralization slice; it is the smallest dependency prerequisite and prevents a temporary `@sdl/pi` ↔ `@sdl/objective` cycle when Pi later imports the expanded Objective API.
- Implement the Objective API relocation as its own branch/PR after runner-usage neutralization lands or is otherwise isolated.
- Repoint `ccc`/`sdlcc` only after the Objective API exports the needed selection/list helpers.
- Treat the Pi→CCC cycle break as a separate high-risk branch/plan, with explicit import smoke checks for changed `.pi/extensions/*.ts` adapters.
