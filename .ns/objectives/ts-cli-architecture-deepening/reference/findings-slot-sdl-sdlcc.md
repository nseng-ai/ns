# Findings — slot, sdl, sdlcc

Three workflow CLIs. `slot` (~6.4k) — worktree slot lifecycle. `sdl` (~3.4k) — Source Development Lifecycle CLI + `@asdl/sdl/sdk`. `sdlcc` (~2.4k). Five candidates. Paths relative to `ts/packages/`.

---

## C1 — Hide occupancy reconciliation behind the inventory (slot) · Strong → roadmap #4

**Files:** `slot/src/inventory.ts` (96; `buildSlotInventory` ~67–96), `slot/src/operations/gt/navigation.ts` (132; `findWorktreeForBranch` ~109–132), `slot/src/planning.ts` (174; `planCheckout` ~42–66). Also `worktreeOperation()` detection ~280–289.

**Problem:** `SlotInventory` is a deep data structure (worktrees × occupancies × main-worktree state + branch lookups), but its assembly and its consumers (`findWorktreeForBranch`, `planCheckout`) tightly couple worktree/occupancy traversal with slot-record construction. The seam is leaky: callers pattern-match `SlotRecord.branch === null` to infer slot state, duplicating occupancy logic across `inventory.ts`, `planning.ts`, `navigation.ts`. Tests build hand-rolled `SlotInventory` fixtures rather than testing the orchestration.

**Deletion test:** Delete `buildSlotInventory` and worktree-listing, occupancy-merging, branch-tip lookups, and operation-detection scatter into every caller (5+ places). Complexity reappears → keep and deepen.

**Proposed deepening:** A `SlotOccupancyReconciler` interface: `reconcile(worktrees, occupancies): SlotRecord[]` + `findOccupiedBranch(branch): Operation | null`. Push operation-detection and occupancy-matching inside; callers see reconciled records and a pure lookup. `SlotRecord` becomes immutable output; `findWorktreeForBranch` queries the reconciled inventory instead of re-listing worktrees.

**Tests improve:** Inject reconciler fakes instead of building fixtures; occupancy edge cases (rebase/merge in progress) tested once; `gt-navigation-cli.test.ts` mocks the reconciler boundary, not the whole inventory machinery.

---

## C2 — Stack-navigator adapter over the Graphite seam (slot/gt) · Strong → roadmap #5

**Files:** `slot/src/operations/gt/navigation.ts` (`resolveOrCheckoutWorktreeForBranch` ~43–62), `slot/src/gateways/gt.ts` (`SlotGtGateway` ~88–94; impl 105–230), `slot/src/operations/gt/shared.ts` (`resolveRepoAndCurrentBranch` ~5–30).

**Problem:** `SlotGtGateway` is shallow: `parentOf()`, `childrenOf()`, `trunk()`, `stack()`, `stackGraph()` expose raw Graphite topology discriminants (`type: "parent" | "failure" | "untracked_branch"`); callers handle every variant. Meanwhile `resolveOrCheckoutWorktreeForBranch` knows Graphite semantics deeply: calls `checkoutBranch()` then reconciles the result back into Graphite terms to decide `isAlreadyAssigned`. Git operations and Graphite reasoning are entangled. Tests (`gt-navigation-cli.test.ts` ~28–50) set up both `gt.children` and `git.worktrees` for one navigation.

**Deletion test:** Try to extract "pure Graphite navigation planning" by deleting `SlotGtGateway` and callers must re-implement worktree-resolution; the dual-mock setup proves neither gateway alone owns the answer.

**Proposed deepening:** A `GraphiteStackNavigator` adapter with a narrow interface: `navigateUp(cwd): { parentBranch: string | null; error? }`, `navigateDown(cwd): { childBranch: string | null; error? }`. It absorbs `SlotGtGateway`, untracked-branch checks, and error classification. Navigation calls only the adapter + git.

**Bounded by:** the runtime Graphite boundary. Keep the adapter inside the `slot gt` group; use Graphite plumbing (`gt parent/children --no-interactive`), never parsed display output.

**Tests improve:** Drop redundant dual mocks; untracked-branch and graphite-missing failures (e.g. `up.ts` ~36–41) move inside the adapter; Graphite version drift (e.g. `stackGraph()` schema) stays contained.

---

## C3 — NavigationGateway: separate pure result-building from side effects (slot) · Strong

**Files:** `slot/src/navigation-result.ts` (`buildNavigationResultFields` ~13–57), `slot/src/operations/gt/navigation.ts` (`buildGtNavigationResult` ~65–86), `slot/src/shell/cd-directive.ts` (`writeCdDirectiveIfActive` ~39–64).

**Problem:** `buildNavigationResultFields` both calls `ctx.clipboard.copy()` (line 38) and orchestrates a cd-directive file write (`buildGtNavigationResult` line 70) and returns data. The interface is wide — it accepts the whole `SlotCliContext` (env, clipboard, storage). Callers can't test navigation output without mocking clipboard and directive writes; the "write directive, copy to clipboard, build result" orchestration is only touched by CLI integration tests.

**Deletion test:** Delete `buildNavigationResultFields` and the clipboard + directive orchestration scatters to callers, or tests split into "clipboard tests" + "result-building tests." It's a thin wrapper over two gateways — complexity moves to the caller.

**Proposed deepening:** A `NavigationGateway` interface (`copyToClipboard(text)`, `writeCdDirective(path)`). `buildNavigationResultFields` accepts the narrow gateway (not `SlotCliContext`) and just returns fields; a thin `performNavigation()` calls both gateway methods. The function becomes pure and injectable.

**Tests improve:** Pure result-building needs no mocks; clipboard/directive failures tested once in a gateway test; CLI scenario tests inject a fake `NavigationGateway`.

*Strong, but kept off the curated nine to limit the slot count to two; record as the next slot follow-up after C1/C2.*

---

## C4 — SDL extension discovery as a shallow seam (sdl) · Worth exploring

**Files:** `sdl/src/extension-discovery.ts` (`discoverExtensionsInRoot` ~78–200+), `sdl/src/extension-registry.ts` (`loadSdlCommandCatalog` ~79–134), `sdl/src/cli.ts` (~56–93).

**Problem:** The discovery → registry → CLI chain is almost all implementation. `discoverExtensionsInRoot()` returns a filesystem-coupled `DiscoveredExtensionCommand` (`entryPath`, `displayPath`, `kind: "file" | "dir-index" | "package"`). `loadSdlCommandCatalog()` re-traverses to classify by source level ("built-in"/"global"/"project") — a third pass. The CLI loops again to build command specs. Filesystem details are known at every layer; discovery is never separated from registration.

**Deletion test:** Delete `discoverExtensionsInRoot` alone and the file-kind discriminants + source-level merging must move somewhere; replacing it with a plain `SdlCommand[]` array, the catalog still must classify by source level and handle precedence — complexity reappears.

**Proposed deepening:** An `ExtensionCatalogBuilder` with `build(extensions: SdlExtension[]): { candidates: Map<string, SdlCommand>; diagnostics }`. Discovery returns module paths only; the builder accepts paths and returns commands; the CLI calls `build()` once.

**Tests improve:** Discovery tests focus purely on finding `.js`/`.json`/`package.json`; builder tests are pure (inject arrays, verify precedence/override warnings, no filesystem mocks); CLI tests stub `build()`.

---

## C5 — sdlcc tab registry as missing locality (sdlcc) · Worth exploring

**Files:** `sdlcc/src/tabs/registry.ts` (~1–12), `sdlcc/src/tabs/tab-module.ts` (`TabModule` ~1–34), `sdlcc/src/tabs/tab-controller.ts`, `sdlcc/src/stack-map-tab.ts` (`stackMapTabModule` ~25–35).

**Problem:** The registry is a static array of concrete `TabController` instances that erases the `TabModule<Model, State, Action, Effect>` generics at `createTabController()`. A code comment promises future `sdl`-extension discovery "replaces this array without changing the host loop," but there's no seam owning "find and load tab modules." Missing locality: adding a tab edits the registry file; future dynamic discovery has nowhere to plug in but `cli.ts`.

**Deletion test:** Delete the registry and discovery logic lands in `cli.ts`; wanting dynamic loading later forces carving out a `TabRegistry` — complexity reappears as unowned `cli.ts` code.

**Proposed deepening:** A `TabRegistry` interface (`loadTabs(): Promise<TabController[]>`); implement `StaticTabRegistry` now (returns the hardcoded array), leaving room for an `SdlExtensionTabRegistry` later without touching `cli.ts`.

**Tests improve:** CLI tests inject a `FakeTabRegistry` (e.g. a single "hello" tab); tab-module tests stay isolated. *Note: this is forward-looking — by the two-adapter rule it becomes a real seam only when the second (extension-backed) registry exists.*
