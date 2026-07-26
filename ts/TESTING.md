# TypeScript Testing

## Test lanes and commands

The default TypeScript test command is the fast local suite:

```bash
pnpm --dir ts run test
# or
just ts-test
```

Default tests include package-local `test/**/*.test.ts` files except the specialized lanes under
`test/integration/`, `test/isolated/`, and `test/typescript-style-guard/`. Keep this path fake-driven
and deterministic enough for frequent local use.

Integration tests run intentionally with a separate command:

```bash
pnpm --dir ts run test:integration
# or
just ts-test-integration
```

Tests that genuinely require module-cache or process-global isolation run in another explicit lane:

```bash
pnpm --dir ts run test:isolated
# or
just ts-test-isolated
```

The repository-wide TypeScript style guard is a separate long-running architectural guard suite:

```bash
pnpm --dir ts run test:typescript-style-guard
# or
just ts-test-typescript-style-guard
```

CI reports the default, integration, isolated, and TypeScript style guard suites as separate
non-draft PR jobs. The isolated suite belongs only in its separate CI job; do not fold it into the
shared-cache default or integration jobs. Do not hide a specialized lane behind environment variables
or make the default test command silently run it.

**Warning:** the default `just` validation entrypoint deliberately omits both integration and isolated
tests. `just` does not prove the isolated lane passed; run `just ts-test-isolated` explicitly when a
change touches isolated tests, their subjects, lane configuration, or the shared-test-state guards.

## Integration versus isolation

Integration and isolation describe different reasons for leaving the default lane:

- **Integration** tests intentionally exercise a real adapter or runtime boundary: real Git, sqlite,
  subprocesses, dynamic runtime loading, network/backend behavior, or similar external resources.
- **Isolated** tests exercise behavior whose subject genuinely requires mutation of Vitest module state
  or process-global state. They run with Vitest `isolate: true` so a file cannot contaminate another
  file through the shared module cache.

Isolation is not a synonym for integration or a general-purpose slow-test lane. A local fake-backed
module-loader or lifecycle test can require isolation without touching a real backend. Conversely, a
real-Git test is integration even when it does not mutate global state. Prefer removing ambient state
through seams; use isolation only when the ambient module/process behavior is itself the contract.
Placement in `test/isolated/` is not permission to add unrelated real-backend cost.

## Lane locators

Put TypeScript isolated tests at:

```text
ts/packages/<package>/test/isolated/**/*.test.ts
```

Put TypeScript integration tests at:

```text
ts/packages/<package>/test/integration/**/*.test.ts
```

Put repository-wide TypeScript style guard tests at:

```text
ts/packages/<package>/test/typescript-style-guard/**/*.test.ts
```

The shared globs also support packages nested one additional directory below `ts/packages/`. Keep the
lane directory directly under the package's `test/` root so discovery includes it in exactly one
specialized command.

## Shared-cache state policy

The default, integration, and TypeScript style guard lanes use the shared module cache (`isolate:
false`). Tests outside `test/isolated/` must not perform these operations:

- Vitest module-state mutation: `vi.mock`, `vi.doMock`, `vi.unmock`, `vi.doUnmock`, or
  `vi.resetModules`. Prefer dependency injection and a fake; isolate only tests whose subject is import
  binding or module loading.
- Vitest fake-timer installation or cleanup: `vi.useFakeTimers` or `vi.useRealTimers`. Inject
  `TimerScheduler` and use `createManualTimerScheduler()`; isolate only host-owned timer behavior that
  cannot use the project seam.
- Direct process mutation: assignment to or deletion from `process.env`, or `process.chdir`. Pass
  `env`/`cwd` explicitly, use an existing gateway, and use `vi.stubEnv()` for a genuinely ambient env
  read.
- Process-global listener mutation through `process.on`, `once`, `addListener`, `prependListener`,
  `removeListener`, `off`, or `removeAllListeners`. Inject an event source; isolate only when process
  listener behavior is the subject.
- The module-global Graphite metadata worker lifecycle (`loadGraphiteMetadataStatusInWorker` and
  `shutdownGraphiteMetadataWorker`). Inject an owned worker seam for ordinary behavior and keep only
  focused singleton-lifecycle coverage isolated.

The TypeScript style guard enforces these as `NS_TS_BAN_SHARED_TEST_MODULE_STATE`,
`NS_TS_BAN_SHARED_TEST_FAKE_TIMERS`, `NS_TS_BAN_SHARED_TEST_PROCESS_MUTATION`,
`NS_TS_BAN_SHARED_TEST_GLOBAL_LISTENERS`, and `NS_TS_BAN_SHARED_TEST_SINGLETON_STATE`.

Shared Vitest configuration automatically restores spies/mocks and unstubs values created through
`vi.stubEnv()` and `vi.stubGlobal()` after each test (`restoreMocks`, `unstubEnvs`, and `unstubGlobals`).
Use those supported APIs instead of handwritten restoration where they fit. Automatic restoration does
not make direct `process.env` writes, cwd changes, module-cache mutation, fake-timer installation, or
process-listener mutation safe in a shared-cache lane.

Use this remediation hierarchy when a guard fires:

1. Remove ambient state by injecting the existing typed dependency, gateway, `Clock`, or
   `TimerScheduler`, then test with a package-owned fake or manual time helper.
2. For environment-only behavior, pass an env object or use `vi.stubEnv()` and rely on automatic
   unstubbing; pass cwd as data rather than calling `process.chdir`.
3. If first-party code owns the singleton/listener/module lifecycle, add a narrow owned seam and keep
   most behavior coverage in the shared-cache lane.
4. Move only the focused test whose contract truly is ambient module/process behavior to
   `test/isolated/`, and run `just ts-test-isolated`.
5. If the actual reason is a real adapter or runtime boundary rather than ambient state, use
   `test/integration/` instead.

## Integration boundary guidance

Use integration tests for coverage that intentionally exercises real adapters or runtime boundaries, such
as cold Node CLI/import smoke tests, real Git repositories, sqlite-backed fixtures, real ji CLI extension
discovery/import, or other subprocess or filesystem-heavy behavior that should remain available but not
slow the default path.

### Cross-product coverage model

Test coverage has two complementary axes:

- Fast in-process, fake-driven scenarios prove the broader matrix of application behavior: routing,
  argument shaping, exits, envelopes, and consistency within the application. Drive real entrypoints and
  composition through injected fakes where practical.
- Integration tests prove compatibility with production adapters, external protocols and backends,
  runtime loader or import paths, terminal interpretation layers, and real composition or wiring.

Neither axis substitutes for the other, and the suite should not form a Cartesian product of every
behavior against every real backend. Exercise each **distinct real boundary surface** meaningfully at
least once, then cover its wider behavior matrix through fakes. A distinct surface is a materially
different production adapter, external protocol or backend, runtime loader or import path, terminal
interpretation layer, or composition or wiring path whose compatibility the same fake cannot establish.
Different inputs, errors, or configuration variants of one adapter are not distinct surfaces. Merely
importing or constructing an adapter is not a meaningful exercise unless importability or constructability
is itself the contract.

Before moving or removing a test case, inventory every confidence claim it makes and name the retained
default or integration test that owns each claim. Do not delete a case merely because another layer has
superficially similar assertions: default scenarios own application behavior, while integration tests own
real-boundary compatibility and wiring.

Computationally expensive smoke tests belong in the integration lane when they primarily prove
compatibility, bootability, real module importability, real adapter wiring, or runtime behavior rather
than localized business logic. Examples include cold Node/runtime CLI smokes, direct Jiti or workspace
package import-compatibility smokes, real ji extension loader discovery/import, and real
Git/sqlite/subprocess/backend smokes. Keep the default lane for pure resolver or alias-selection logic,
fake-driven behavior, cheap metadata parsing/discovery that does not import modules, and localized
command behavior through package-owned fakes.

Real CLI extension discovery/import is an integration boundary. Tests that create a temporary project with
`.ns/extensions`, invoke `runCli()`, and rely on the ji loader to scan manifests and dynamically import
extension modules through `jiti` belong in `test/integration/` unless the test is explicitly about cheap
metadata-only discovery that does not import modules.

A test that creates a temporary Git repository by invoking real Git commands (`git init`, `git commit`,
`git worktree`, or similar) is an integration test. Keep only fake-driven Git protocol coverage, injected
`GitGateway` behavior, or inert `.git`-shaped fixture parsing in the default lane.

## CLI and terminal integration tests

Use fake-driven command scenarios in the default lane for arguments, exit codes, confirmations, machine
envelopes, stdout/stderr, and gateway behavior. Use terminal emulation in the integration lane only when
the contract depends on how a terminal interprets emitted bytes—for example physical wrapping, cursor
movement, live-region cleanup, settlement, scrollback, or terminal-mode restoration. Cold process startup,
package loading, and real external adapters are separate integration boundaries and should remain narrow
smoke tests.

Terminal-emulation tests should drive the real writer or renderer into a terminal parser and assert on the
resulting terminal buffer, including scrollback. They should not infer visual correctness from captured
strings or fake writer calls. Keep terminal time deterministic, model actual and writer-reported geometry
as separate values, and flush asynchronous terminal writes before asserting.

See
[`packages/public/infra/clinkr/docs/terminal-integration-testing.md`](packages/public/infra/clinkr/docs/terminal-integration-testing.md)
for the standard harness shape, PTY newline model, scenario matrix, assertion strategy, debugging workflow,
and limitations. The reference test is
[`packages/public/infra/clinkr/test/integration/stream-terminal-emulation.test.ts`](packages/public/infra/clinkr/test/integration/stream-terminal-emulation.test.ts).

## Default-path test expectations

Default-path tests should prefer small fake-driven seams:

- Inject gateways instead of shelling out to real commands.
- Use in-memory fakes for package-owned storage or process boundaries when possible.
- When abstracting filesystem-backed behavior, inject a domain-specific storage gateway (for example, Objective storage or the plan store) rather than a pure/shared `FileSystemGateway`; keep path policy and persistence semantics in the domain seam, with raw `fs` only inside the real adapter.
- Use temporary directories only for inert local fixtures, path-shape checks, file parsing, or extension
  metadata/discovery parsing that does not dynamically import modules through the real CLI loader.
- Keep real Git, Graphite/sqlite, network, host-tool discovery, cold Node runtime, subprocess, and
  wall-clock behavior out of the default lane unless the test is a deliberately cheap user-facing scenario
  and there is no narrower boundary smoke to preserve the same confidence.
- For ji extension command behavior, test in the package that owns the command implementation. For the
  grouped flow commands, `@nseng-ai/flow` owns direct behavior tests: import package-owned command objects
  such as `flowCpCommand`, execute them with a fake `NsExtensionApi`, scripted command runner, scripted
  text generation, and inert temp files, then keep a small ji integration smoke proving the checked-in
  `.ns/extensions/flow` adapter manifest is discoverable/loadable through the real CLI loader.
- Account for complementary confidence claims: default scenarios should assert application behavior
  through fakes, while representative integration tests should prove each distinct real boundary surface.
- Keep package scenario tests focused on user-visible CLI behavior that does not require slow external
  setup.

## Deterministic time convention

Production code that reads wall-clock time or schedules/cancels work should expose ji time seams first:
use `Clock` from `@nseng-ai/foundation/clock` for wall-clock reads and `TimerScheduler` from `@nseng-ai/foundation/timers`
for timeouts, intervals, or awaited delays. Pi host background timers should use `unrefTimerScheduler` so timer work does
not keep the process alive. Raw timers belong in the timer adapter modules or narrowly justified
runtime/integration smoke.

Project-owned time-sensitive behavior in the default suite should inject `Clock` or `TimerScheduler` and
use helpers from `@nseng-ai/foundation/time/testing`:

```ts
import { createManualClock, createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";
```

Use `createManualClock()` for wall-clock reads and elapsed-time assertions. Use
`createManualTimerScheduler()` for timeout/interval scheduling and cancellation behavior. Real sleeps,
cold runtime timing, or process startup timing belong only in integration tests or narrow adapter smoke
tests.

## Performance evidence template

Any test-boundary slice that claims to speed up the default TypeScript path must record evidence in its
Objective Semantic Update:

```markdown
## Performance evidence

- Measured command:
- Baseline timing:
- Post-change timing:
- Repetition/noise notes:
- Cost handling:
- Coverage retention:
```

State explicitly whether the change eliminated cost from the default path or shifted it into the
integration command. Do not claim a speedup without comparable measurements.
