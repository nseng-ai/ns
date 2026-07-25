# Standing Test Performance Boundaries

## Thesis

Keep default test suites fast, deterministic, and safe under shared module caches. Move real-boundary behavior to explicit integration tests. Contain irreducibly ambient behavior in isolated lane. Preserve application behavior in fake-driven default tests. This is standing maintenance Objective: package moves, new adapters, and new tests can reintroduce boundary leaks after earlier cleanups land.

## Scope

- Periodically inspect default tests for real Git, subprocesses or cold runtimes, sqlite/metadata stores, network/backend adapters, real sleeps or wall-clock assertions, dynamic module loading, filesystem-heavy setup, and repeated per-case integration setup.
- Classify each behavior independently. Temp directories are not automatically integration; dynamic imports differ from subprocess/filesystem behavior; shared-cache contamination differs from integration.
- Keep application behavior in default tests through narrow injected seams, gateway fakes, command/process/sqlite adapters, catalog inspection, and Foundation's manual clock/timer helpers.
- Keep representative real-adapter and runtime smoke coverage in `test/integration/` directly under package test root so shared Vitest globs discover it.
- Keep tests whose subject irreducibly requires module-cache or process-global mutation in `test/isolated/`, after preferring injection, explicit inputs, auto-restored stubs, manual schedulers, and owned lifecycle seams.
- Preserve explicit TypeScript lanes: default, integration, isolated, and TypeScript style guard. Reverify discovery after package moves or test-tree restructures.
- Record durable performance evidence only when measured: command, before/after timing, repetitions/noise, whether cost disappeared or shifted lanes, and retained coverage.
- Feed reusable lessons back into this Objective, `ts/TESTING.md`, or narrowly enforced conventions.

## Non-Goals

- Deleting, hiding, or skipping real-boundary coverage to improve timing.
- Moving behavior to integration without equivalent default-path confidence where application behavior belongs in fast lane.
- Treating isolation as generic slow-test lane or integration synonym.
- Introducing broad shared abstractions, CI changes, test-framework rewrites, or timing thresholds without repeated concrete evidence.
- Claiming speedup when work only improves containment or shifts cost.
- Publishing, deploying, submitting PRs, or mutating external systems without explicit human authorization.

## Completion Criteria

Standing Objective with no goal-met finish line. Close only when periodic test-boundary maintenance is obsolete, superseded, intentionally abandoned, or no longer worth carrying cost. Closure must explain why standing goal ended or where tracking moved.

## Definition of Progress

Progress keepable when concrete boundary leak or shared-cache hazard is evidenced, behavior confidence preserved through appropriate fake/default and real-adapter coverage, retained real behavior discoverable through explicit lane, any production seam narrow and boundary-named, and targeted validation covers changed lanes.

Do not keep work that only hides slow coverage, adds new real services or sleeps to defaults, introduces unproved generic abstraction, weakens sole user-visible behavior coverage, or leaves moved tests outside documented lane commands.

Useful evidence: candidate timing, boundary classification, before/after file-list discovery, greps for stale real setup, targeted default/integration/isolated tests, and honest performance measurements.

## Runner Policy

Runner may take one bounded slice when evidence and coverage retention are clear. It may add narrow testing seam, fake-driven tests, representative integration smoke coverage, isolated containment for irreducibly ambient contracts, package-local documentation, and material Objective update.

Ask first before changing global test commands, CI topology, repository-wide conventions, public APIs, broad shared abstractions, deleting coverage, materially weakening assertions, or reclassifying only user-visible behavior test. Leave candidate plan instead of code when seam or layer is ambiguous.

## Implementation Guidance

- Establish or verify lane discovery before moving coverage. TypeScript integration and isolated directories must sit directly under package `test/` root. Shared globs cover top-level packages, grouped packages, and review tools.
- Migrate one boundary family per slice where practical: cold runtime, real Git, sqlite/metadata, loader/orchestration, or time/timers.
- Apply cross-product coverage model in `ts/TESTING.md`: default tests own application claims through fakes; focused integration tests own each meaningful real adapter/runtime surface.
- Detect repeated integration setup for localized logic. Move case fan-out onto injected fake seam and retain only representative real loading/adaptation smokes.
- Treat shared-cache hazards separately. Module mocking/reset, fake timers, direct env/cwd mutation, process-global listeners, and singleton lifecycle mutation require remediation or focused isolation, not automatic integration placement.
- Prefer `Clock`, `TimerScheduler`, `createManualClock()`, and `createManualTimerScheduler()` to sleeps, elapsed-time assertions, or broad fake timers.
- After restructures, probe both presence and discovery. Current representative paths include Foundation's exec integration smoke, Extension Kit's Git/Graphite smokes, Branch Context's real-Brmem smoke under incubator, and SDK flow-extension registry smoke.
- Keep Objective examples on current paths and ownership. Flow now lives under `ts/packages/incubator/flow`; registry smoke and registry owner live under `ts/packages/sdk`.

## Assumptions and Risks

Assumptions:

- New integration-style default tests and shared-cache hazards will continue appearing as packages evolve, making standing maintenance useful.
- Most leaks can be resolved with narrow seams, fake-driven behavior tests, and smaller real-boundary smokes.
- Local timing is adequate for directional evidence when methodology and noise are explicit.

Risks:

- Fakes can omit real contract behavior, and moved smokes can stop exercising meaningful adapter.
- Some tests combine user-visible behavior with real setup and require production design work, not file move.
- Shared-cache source guard currently applies to `ts/packages/` tests, while Vitest lane globs also admit `.ns/reviews/*/tools/*`; broad documentation can overstate enforcement outside package tests.
- No structural guard currently rejects misplaced nested `integration/` directories, so package move can silently return real-boundary tests to default lane.
- Performance claims can overstate benefit when cost merely shifts to integration or isolation.

## Open Questions

- Should repository add structural guard rejecting `integration/` or `isolated/` directories outside shared lane globs?
- Should shared-cache source guards cover review-tool tests admitted by third Vitest root, or should documentation explicitly narrow enforcement scope?
- When repeated timing sweeps provide stable signal, is automated slow-test inventory or threshold worthwhile?
