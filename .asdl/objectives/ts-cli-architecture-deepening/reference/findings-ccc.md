# Findings — ccc (Cmux Command and Control)

Largest orchestration CLI (~11.6k LOC): composes Pi, cmux, Graphite, Objective, handoff, branch-context, autobranch/land, and owns worktree-status observability. Four candidates. Paths relative to `ts/packages/ccc/src/`.

---

## B1 — Collapse slot-dispatch orchestration · Strong → roadmap #3

**Files:** `cmux/dispatch-prompt.ts` (432; handlers ~72–138, 140–209), `cmux/dispatch-from-trunk.ts` (198; ~24–97), `cmux/slot-dispatch-plan.ts` (548; ~106–200), `cmux/slot.ts` (~45–73).

**Problem:** Dispatch commands (prompt, from-trunk, dispatch-plan) thread a shallow sequence: branch creation → Branch Memory storage → slot checkout → cmux workspace opening. Each module exports a tiny interface mirroring its implementation; understanding the correct composition order means reading handlers across four files. Orchestration is embedded in handlers, not a reusable module.

**Deletion test:** Delete `dispatch-prompt.ts` and the same shallow four-step structure still sits in `dispatch-from-trunk.ts` and `slot-dispatch-plan.ts`. The Branch-Memory-payload × slot-checkout seam repeats across files rather than being one primitive.

**Proposed deepening:** A `SlotDispatchPlan` module (interface-only to callers) that owns the orchestration: accept `(branchName, payload, metadata)`; internally stash payload in Branch Memory → resolve slot → open workspace → notify. Command handlers delegate to it, not to 5 ad-hoc helpers.

**Tests improve:** `autobranch-flow.test.ts` shows the target pattern (one `createAutobranchCheckpointFlow` with injected `exec`). A unified `SlotDispatchPlan` test can mock one gateway covering all branch/checkout/workspace primitives, instead of coordinating multiple mock scenarios across files.

**Open question (carried to objective):** `slot-dispatch-plan.ts` may already be most of the target shape — confirm whether this is a consolidation of the two dispatch handlers onto it rather than a new module.

---

## B2 — Autobranch dirty/latest-commit bifurcation · Strong

**Files:** `autobranch/flow.ts` (~39–62), `autobranch/latest-commit.ts` (~1–65), `autobranch/transaction.ts` (~36–76).

**Problem:** `createAutobranchCheckpointFlow()` branches on `snapshot.clean`: either `runDirtyAutobranchFlow()` or `createLatestCommitAutobranchFlow()`. Both paths share structure (preparation → validation → transaction → summary) but differ internally, and the main flow passes everything through (`cwd`, `args`, `exec`, checksums) so each branch re-threads the same arguments through its own helpers. Hard to test "when does checkpoint-message preparation happen relative to stash?" — the answer is "in a different file depending on a boolean."

**Deletion test:** Deleting either path forces `createAutobranchCheckpointFlow()` to wire a different transaction type, not just remove a module — there's no common `AutobranchTransaction` abstraction.

**Proposed deepening:** A `WorktreeAutobranchStrategy` interface (`prepare()` → `execute(plan)` → `format(execution)`); the flow selects a strategy and delegates. New variants (e.g. "recover from merge conflict") become new implementations, not new branches in the orchestrator.

**Tests improve:** Test strategy selection once; test each strategy's prepare/execute/format in isolation. A dirty-path regression doesn't require re-running the whole harness.

*Not promoted to the roadmap nine to keep package variety; record here as the strongest ccc follow-up after B1. Revisit if autobranch grows a third variant (which would make the strategy seam real per the two-adapter rule).*

---

## B3 — Worktree-status multi-source composition (untestable) · Worth exploring

**Files:** `worktree-status.ts` (~160–248; `loadLocalWorktreeStatus`), `worktree-status/graphite-metadata.ts` (~1–100).

**Problem:** `loadLocalWorktreeStatus()` parallelizes three async loads (brmem, gt, identity) inline. Which sources load when, and how they compose, is scattered across `loadGtStatus()`, `loadGraphiteMetadataStatusAsync()`, and the worker interface. The worker (`ThreadWorker` in graphite-metadata.ts) is created inline, not injected — composition is untestable without a full worker harness. `loadLocalWorktreeStatus()` already accepts a `metadataLoader?` (lines 92–94), but the default factory + timeout behavior leak into `loadCurrentGraphiteMetadataStatusAsync()`.

**Deletion test:** Deleting the `graphite-metadata.ts` worker forces a rewrite of `loadLocalWorktreeStatus()` — the metadata-loading logic is baked into the orchestration; no simple fallback.

**Proposed deepening:** A `GraphiteMetadataGateway` encapsulating worker creation (accept a `GraphiteMetadataWorkerFactory`), timeout/cancellation, and fallback-to-unavailable. Inject it into `loadGtStatus()`; keep the default factory + timeout opaque to `loadLocalWorktreeStatus()`.

**Tests improve:** Add a `FakeGraphiteMetadataGateway` returning a known status without spawning workers; `loadGtStatus()` composition can verify tracked/untracked/unavailable without worker lifecycle.

---

## B4 — Landing operations scattered across two entry points · Worth exploring

**Files:** `land-stack.ts` (~78–150), `land-stack/landing-operations.ts` (~105–184, 262–377), `land-stack/landing-plan.ts` (~24–99), `land.ts` (~81–150).

**Problem:** Two entry points — `/sdl:code:land` (`land.ts`) and `executeStackLanding()` (`land-stack.ts`) — overlap. `land.ts` checks `isIsolatedFastPath()` inline, runs `runFastLand()`, then conditionally dispatches to `executeStackLanding()`. `landing-operations.ts` exports tiny steps (`confirmAndSubmitRequiredPrUpdates`, `confirmAndFreeManagedSlots`, `prepareMergeLoopState`, `runMergeLoop`); their orchestration order is buried inside `executeStackLanding()` across two files. "When does PR validation happen?" requires tracing three files and two branches.

**Deletion test:** The operations module can't be deleted cleanly (step logic is interleaved with command-context calls), but the prepare → confirm → execute → cleanup pattern isn't abstracted, so it would repeat if landing logic moved.

**Proposed deepening:** A `LandingWorkflow` (`preflight` → `confirmPreMerge` → `executeMerges` → `cleanup`); both `land.ts` and `executeStackLanding()` delegate. `isIsolatedFastPath` becomes a strategy selection, not two code paths.

**Tests improve:** Test the workflow once with a fake `LandStackExtensionAPI` simulating preflight failures, cancellations, merge failures; the fast-path/stack-path tests become thin dispatch checks. *Note: respect the runtime Graphite boundary — landing is a legitimately Graphite-named contract.*
