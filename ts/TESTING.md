# TypeScript Testing

## Default and integration commands

The default TypeScript test command is the fast local suite:

```bash
pnpm --dir ts run test
# or
just ts-test
```

Default tests include package-local `test/**/*.test.ts` files, except integration tests under
`test/integration/`. Keep this path fake-driven and deterministic enough for frequent local use.

Integration tests run intentionally with a separate command:

```bash
pnpm --dir ts run test:integration
# or
just ts-test-integration
```

CI reports the default TypeScript suite and TypeScript integration suite as separate non-draft PR jobs.
Do not hide integration tests behind environment variables or make the default command silently run them.

## Integration test locator

Put TypeScript integration tests at:

```text
ts/packages/<package>/test/integration/**/*.test.ts
```

Use integration tests for coverage that intentionally exercises real adapters or runtime boundaries, such
as cold Node CLI/import smoke tests, real Git repositories, sqlite-backed fixtures, real SDL CLI extension
discovery/import, or other subprocess or filesystem-heavy behavior that should remain available but not
slow the default path.

Real CLI extension discovery/import is an integration boundary. Tests that create a temporary project with
`.sdl/extensions`, invoke `runCli()`, and rely on the SDL loader to scan manifests and dynamically import
extension modules through `jiti` belong in `test/integration/` unless the test is explicitly about cheap
metadata-only discovery that does not import modules.

A test that creates a temporary Git repository by invoking real Git commands (`git init`, `git commit`,
`git worktree`, or similar) is an integration test. Keep only fake-driven Git protocol coverage, injected
`GitGateway` behavior, or inert `.git`-shaped fixture parsing in the default lane.

## Default-path test expectations

Default-path tests should prefer small fake-driven seams:

- Inject gateways instead of shelling out to real commands.
- Use in-memory fakes for package-owned storage or process boundaries when possible.
- Use temporary directories only for inert local fixtures, path-shape checks, file parsing, or extension
  metadata/discovery parsing that does not dynamically import modules through the real CLI loader.
- Keep real Git, Graphite/sqlite, network, host-tool discovery, cold Node runtime, subprocess, and
  wall-clock behavior out of the default lane unless the test is a deliberately cheap user-facing scenario
  and there is no narrower boundary smoke to preserve the same confidence.
- For SDL extension command behavior, test in the package that owns the command implementation. For the
  grouped flow commands, `@sdl/flow` owns direct behavior tests: import package-owned command objects
  such as `flowCpCommand`, execute them with a fake `SdlExtensionApi`, scripted command runner, scripted
  text generation, and inert temp files, then keep a small SDL integration smoke proving the checked-in
  `.sdl/extensions/flow` adapter manifest is discoverable/loadable through the real CLI loader.
- Assert the same behavior contract that a real-adapter integration test preserves at the boundary.
- Keep package scenario tests focused on user-visible CLI behavior that does not require slow external
  setup.

## Deterministic time convention

Project-owned time-sensitive behavior in the default suite should inject `Clock` or `TimerScheduler` and
use helpers from `@sdl/core/testing`:

```ts
import { createManualClock, createManualTimerScheduler } from "@sdl/core/testing";
```

Use `createManualClock()` for wall-clock reads and elapsed-time assertions. Use
`createManualTimerScheduler()` for one-shot timeout scheduling and cancellation behavior. Real sleeps,
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
