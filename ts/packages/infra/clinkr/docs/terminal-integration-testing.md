# Terminal Integration Testing

Use terminal-emulation integration tests when a CLI rendering contract depends on how a terminal
interprets emitted bytes. These tests complement fake-driven command scenarios: they do not replace
ordinary argument, exit-code, confirmation, or gateway tests.

The reference implementation is
[`../test/integration/stream-terminal-emulation.test.ts`](../test/integration/stream-terminal-emulation.test.ts).
It drives clinkr's real stream writer through `@xterm/headless` and asserts on the terminal's resulting
screen and scrollback.

## Choose the smallest useful boundary

Use the lowest-cost test that can observe the behavior:

| Boundary                     | Use it for                                                                                                     | Lane        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------- |
| Fake-driven command scenario | Arguments, exits, confirmations, machine envelopes, stdout/stderr, and gateway behavior                        | Default     |
| Terminal-emulated rendering  | ANSI interpretation, cursor movement, wrapping, live-region cleanup, settlement, and terminal-mode restoration | Integration |
| Cold CLI or runtime smoke    | Process startup, package loading, extension discovery, and real external adapters                              | Integration |

Capturing strings or fake `StreamWriter` calls is preferable when those observations prove the
contract. Use a terminal emulator when the question is instead:

> What does the user's terminal buffer contain after interpreting these bytes?

Physical wrapping, cursor-accounting errors, stale rows, and output moved into scrollback are examples
that require this boundary.

## Standard harness shape

A terminal-emulation harness should contain these pieces:

1. A TTY-shaped writable stream that captures every emitted chunk.
2. The real writer or renderer under test, not a fake of its ANSI behavior.
3. A headless terminal configured with explicit columns, rows, and scrollback.
4. A deterministic clock or scheduler so animation does not sleep.
5. An asynchronous flush before reading terminal state.
6. Full-buffer extraction, including scrollback.

The stream's reported geometry and the emulator's actual geometry are separate inputs:

```ts
interface EmulatedTerminalOptions {
  columns: number;
  rows: number;
  reportedColumns?: number;
}
```

- `columns` is the width enforced by the terminal emulator.
- `reportedColumns` is the width exposed to the writer through `stream.columns` and rendering
  capabilities.
- When omitted, `reportedColumns` should equal `columns`.

Keeping these names distinct makes resize races and stale multiplexer geometry directly testable.
Avoid collapsing them into one ambiguous `width` value.

## Model PTY newline behavior

Configure xterm with `convertEol: true`:

```ts
const terminal = new Terminal({
  cols: options.columns,
  rows: options.rows,
  scrollback: 1000,
  allowProposedApi: true,
  convertEol: true,
});
```

A real PTY commonly applies ONLCR, translating `\n` to `\r\n` before bytes reach the terminal. Without
`convertEol: true`, bare newlines staircase across the screen and create failures unrelated to the
renderer. This option is part of the test model, not incidental setup.

The emulator models terminal parsing, not a complete PTY, multiplexer, or operating-system pipeline.
See [Limitations](#limitations) before treating a passing test as proof of host-specific behavior.

## Flush before reading

`terminal.write` is asynchronous. Wait for its callback before inspecting the buffer:

```ts
await new Promise<void>((resolve) => {
  terminal.write(chunks.join(""), resolve);
});
```

Reading immediately after `write` can observe a partial update and introduce timing-dependent tests.

## Read the full buffer

Stale live-region rows often move into scrollback. Viewport-only assertions can therefore report a
false success. Extract every active-buffer row:

```ts
const buffer = terminal.buffer.active;
const lines: string[] = [];
for (let index = 0; index < buffer.length; index += 1) {
  lines.push(buffer.getLine(index)?.translateToString(true) ?? "");
}
```

Use `translateToString(true)` to trim unused cells while preserving interpreted text. Keep empty rows
when debugging cursor placement or unexpected vertical gaps.

## Drive the real lifecycle

Exercise the same lifecycle production code uses. For a clinkr stream sink, that is normally:

```ts
sink.start();
sink.render(() => liveFrame);
await sink.hold({ tickMs: 90, transient: "Working." });
sink.render(() => settledFrame);
sink.finish(finalLines);
sink.stop();
```

Inject an instant or manual clock. Terminal integration tests should not wait for spinner cadence;
cadence and dwell calculations belong in fake-driven unit tests.

Keep these output categories explicit in fixtures and assertions:

- **Live frame:** replaceable output that may include transient progress rows.
- **Settled frame:** permanent final state of the rendered region.
- **Final lines:** summaries or follow-up text written after settlement.
- **Subsequent output:** bytes written by the next operation, used to verify cursor and mode cleanup.

## Prefer invariant assertions

Assert the user-visible invariant rather than snapshotting the entire screen. Useful helpers include:

```ts
function occurrences(lines: readonly string[], marker: string): number {
  return lines.filter((line) => line.includes(marker)).length;
}
```

Typical assertions are:

- each settled marker appears exactly once;
- each transient marker appears zero times;
- content beyond the first physical row remains present after wrapping;
- the final summary appears below the settled frame;
- subsequent command output appears below the summary;
- cursor visibility and terminal modes are restored.

Full-buffer snapshots are usually brittle around blank rows, harmless ANSI changes, terminal geometry,
xterm upgrades, and wrapping boundaries. Use a snapshot only when the complete layout is itself the
contract; otherwise prefer literal fixtures plus occurrence and ordering checks.

## Baseline scenario matrix

Choose the scenarios relevant to the renderer rather than copying the whole matrix mechanically:

1. **Shrinking settlement** — transient trailing rows disappear when the settled frame is shorter.
2. **Growing or changing frames** — differential updates do not duplicate common prefixes or suffixes.
3. **Wide logical lines** — output wraps without duplication, and permanent tail content remains
   visible.
4. **Tall frames** — clipping and scrolling do not leave stale surviving rows.
5. **Geometry desynchronization** — writer-reported width differs from actual width without corrupting
   settlement.
6. **Output after settlement** — the next operation starts below the intact completed frame.
7. **Exceptional cleanup** — modified cursor or terminal modes are restored when rendering aborts.

A regression test should reproduce the smallest sequence that exhibits the original user-visible
symptom. Retain every element that is load-bearing for the failure, but do not preserve unrelated
production output in the fixture.

## Debug in three layers

When a test fails, inspect these layers separately:

1. **Logical frames** — verify the lines passed into the renderer.
2. **Emitted bytes** — print captured chunks with control characters escaped.
3. **Interpreted buffer** — print indexed terminal rows, including scrollback.

A useful temporary diagnostic format is:

```text
Emitted chunks:
000: "\u001b[?25l"
001: "\u001b[?7l..."

Terminal buffer:
000: command title
001: completed row
002: wrapped continuation
```

Render chunks with `JSON.stringify(chunk)` so escape sequences remain visible. For buffer diagnostics,
include row indexes and empty rows; inspect xterm's wrapped-line metadata when a continuation boundary
is unclear. Remove temporary diagnostics before committing unless they become an intentionally reusable
test helper.

This split identifies whether corruption originates in frame construction, ANSI generation, or terminal
interpretation. Do not start by snapshotting more output—the extra noise usually makes the responsible
layer harder to identify.

## Limitations

A headless terminal test exercises a real terminal parser, but it does not automatically reproduce:

- Ghostty- or another terminal's implementation-specific behavior;
- cmux or tmux resize timing;
- kernel PTY buffering and line-discipline configuration beyond the `convertEol` approximation;
- asynchronous `SIGWINCH` delivery;
- concurrent writes from unrelated processes;
- process-level stdout backpressure.

Model geometry changes explicitly when they are the suspected cause. Bugs that depend on a real host,
multiplexer, signal, or process boundary still need a focused higher-level reproduction; do not make
ordinary terminal-emulation tests nondeterministic to imitate those systems.

## Reuse policy

Keep a terminal harness local while it has one consumer. Once a second package needs the same mechanics,
extract a small helper through `@nseng-ai/clinkr/testing` that owns only:

- TTY-shaped chunk capture;
- emulator construction;
- actual versus reported geometry;
- asynchronous flushing;
- full-buffer extraction;
- optional indexed diagnostics.

Frame fixtures and behavioral assertions remain package-owned. Do not turn one command's output or one
regression's markers into generic clinkr testing policy.

## Commands

Run all TypeScript integration tests:

```bash
just ts-test-integration
```

Run the clinkr terminal reference test while iterating:

```bash
cd ts
pnpm exec vitest run \
  --config vitest.integration.config.ts \
  packages/infra/clinkr/test/integration/stream-terminal-emulation.test.ts
```

The default `just` command deliberately omits integration tests. Run the integration lane explicitly
before declaring a change to a terminal integration test, its subject, or its lane configuration done.
