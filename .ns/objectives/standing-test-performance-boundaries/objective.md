# Standing Test Performance Boundaries

## Thesis

Keep default test suites fast, deterministic, and safe under shared module caches by moving real-boundary behavior to explicit integration tests, containing irreducibly ambient behavior in an isolated lane, using a narrow sanity lane for code-unchanged concrete-adapter tests that mock only low-level runtime/vendor modules, and preserving application behavior in fake-driven default tests. This is a standing maintenance Objective: package moves, new adapters, and new tests can reintroduce boundary leaks after earlier cleanups land.

## Scope

- Periodically inspect default tests for real Git, subprocesses or cold runtimes, sqlite/metadata stores, network/backend adapters, real sleeps or wall-clock assertions, dynamic module loading, filesystem-heavy setup, and repeated per-case integration setup.
- Classify each behavior independently. Temp directories are not automatically integration; dynamic imports are distinct from subprocess/filesystem behavior; shared-cache contamination is distinct from integration.
- Keep application behavior in default tests through narrow injected seams, gateway fakes, command/process/sqlite adapters, catalog inspection, and Foundation's manual clock/timer helpers.
- Keep representative real-adapter and runtime smoke coverage in `test/integration/` directly under a package's test root so the shared Vitest globs discover it.
- Keep tests whose subject irreducibly requires ambient product/runtime module-cache or process-global mutation in `test/isolated/`, after preferring injection, explicit inputs, auto-restored stubs, manual schedulers, and owned lifecycle seams.
- Keep focused concrete-adapter tests that require low-level runtime/vendor module substitution in `test/sanity/` with `isolate: true`; never mock domain/workflow logic, semantic gateways, or the adapter subject. Retain integration coverage for actual Git, filesystem, process, and other external-system compatibility.
- Preserve the explicit TypeScript lanes: default shared-cache tests, integration, isolated, sanity, and TypeScript style guard. Default `just` / `just check` runs core validation plus sanity as a separate isolated invocation; opt-in `just ci` additionally includes integration and the style guard, while isolated remains explicit. Each specialized suite has a separate non-draft CI job. Reverify discovery after package moves or test-tree restructures.
- Record durable performance evidence only when measured: command, before/after timing, repetitions/noise, whether cost disappeared or shifted lanes, and retained coverage.
- Feed reusable lessons back into this Objective, `ts/TESTING.md`, or narrowly enforced conventions.

## Non-Goals

- Deleting, hiding, or skipping real-boundary coverage merely to improve timing.
- Moving behavior to integration without equivalent default-path confidence where application behavior belongs in the fast lane.
- Treating isolation as a generic slow-test lane, integration synonym, or adapter-mocking technique.
- Using sanity tests to mock domain/workflow logic, semantic gateways, or the concrete adapter subject.
- Introducing broad shared abstractions, CI changes, test-framework rewrites, or timing thresholds without repeated concrete evidence.
- Claiming a speedup when work only improves containment or shifts cost.
- Publishing, deploying, submitting PRs, or mutating external systems without explicit human authorization.

## Completion Criteria

This is a standing Objective with no goal-met finish line. Close it only when periodic test-boundary maintenance is obsolete, superseded, intentionally abandoned, or no longer worth its carrying cost. Closure must explain why the standing goal ended or where tracking moved.

## Definition of Progress

Progress is keepable when a concrete boundary leak or shared-cache hazard is evidenced, behavior confidence is preserved through the appropriate fake/default and real-adapter coverage, retained real behavior is discoverable through an explicit lane, any production seam is narrow and boundary-named, and targeted validation covers the changed lanes.

Do not keep work that only hides slow coverage, adds new real services or sleeps to defaults, introduces an unproved generic abstraction, weakens the sole user-visible behavior coverage, or leaves moved tests outside the documented lane commands.

Useful evidence includes candidate timing, boundary classification, before/after file-list discovery, greps for stale real setup, targeted default/integration/isolated/sanity tests, and honest performance measurements.

## Runner Policy

A runner may take one bounded slice when evidence and coverage retention are clear. It may add a narrow testing seam, fake-driven tests, representative integration smoke coverage, isolated containment for irreducibly ambient contracts, package-local documentation, and a material Objective update.

Ask first before changing global test commands, CI topology, repository-wide conventions, public APIs, broad shared abstractions, deleting coverage, materially weakening assertions, or reclassifying the only user-visible behavior test. The current command boundary is deliberate: default `just` / `just check` runs core validation plus sanity as a separate isolated invocation, `just ci` additionally runs integration and the TypeScript style guard plus metadata/policy checks, and isolated remains explicit. Leave a candidate plan rather than code when the seam or layer is ambiguous.

## Implementation Guidance

- Establish or verify lane discovery before moving coverage. TypeScript integration, isolated, and sanity directories must sit directly under the package `test/` root; the shared globs cover top-level packages, grouped packages, and review tools.
- Migrate one boundary family per slice where practical: cold runtime, real Git, sqlite/metadata, loader/orchestration, or time/timers.
- Apply the cross-product coverage model in `ts/TESTING.md`: default tests own application claims through fakes; focused integration tests own each meaningful real adapter/runtime surface.
- Detect repeated integration setup for localized logic. Move case fan-out onto an injected fake seam and retain only representative real loading/adaptation smokes.
- Treat shared-cache hazards separately. Ordinary shared-cache lanes retain all five bans on module mocking/reset, fake timers, direct env/cwd mutation, process-global listeners, and singleton lifecycle mutation. The source guard exempts only isolated-cache paths under `test/isolated/` and `test/sanity/`; use sanity solely for its narrow concrete-adapter contract.
- Prefer `Clock`, `TimerScheduler`, `createManualClock()`, and `createManualTimerScheduler()` to sleeps, elapsed-time assertions, or broad fake timers.
- After restructures, probe both presence and discovery. Current representative paths include Foundation's exec integration smoke, Extension Kit's Git/Graphite smokes, Branch Context's real-Brmem smoke under the incubator, and the SDK flow-extension registry smoke.
- Keep the Objective's examples on current paths and ownership. Flow now lives under `ts/packages/incubator/flow`; the registry smoke and registry owner live under `ts/packages/sdk`.

## Assumptions and Risks

Assumptions:

- New integration-style default tests and shared-cache hazards will continue to appear as packages evolve, making standing maintenance useful.
- Most leaks can be resolved with narrow seams, fake-driven behavior tests, and smaller real-boundary smokes.
- Local timing is adequate for directional evidence when methodology and noise are explicit.

Risks:

- Fakes can omit real contract behavior, and moved smokes can cease exercising the meaningful adapter.
- Some tests combine user-visible behavior with real setup and require production design work rather than a file move.
- The shared-cache source guard currently applies to `ts/packages/` tests, while the Vitest lane globs also admit `.ns/reviews/*/tools/*`; broad documentation can therefore overstate enforcement outside package tests.
- No structural guard currently rejects misplaced nested `integration/` directories, so a package move can silently return real-boundary tests to the default lane.
- Performance claims can overstate benefit when cost merely shifts to integration, isolation, or sanity.

## Open Questions

- Should the repository add a structural guard rejecting `integration/`, `isolated/`, or `sanity/` directories outside the shared lane globs?
- Should shared-cache source guards cover review-tool tests admitted by the third Vitest root, or should documentation explicitly narrow their enforcement scope?
- When repeated timing sweeps provide stable signal, is an automated slow-test inventory or threshold worthwhile?
