# Replace Pi CLI live-progress widget with a heartbeat status line

## Goal

Replace the above-editor animated live-progress widget used by all Pi-bridged ns CLI commands (`/ns:flow:*` and every other command registered through `registerCliCommandExtension`) with a single fixed-height footer status line: semantic milestones update immediately, a ~1 s heartbeat glyph plus deferred elapsed time provide liveness, and the widget/animation machinery is deleted outright.

Outcome for the user: no above-editor panel, no 120 ms render pump, no live stdout/stderr tail, no variable-height reflow. One footer line like:

```
◐ /ns:flow:submit · publishing · 2/4 · LM · title-draft · 34s
```

Durable final command output in the transcript is unchanged.

## Decisions (settled during planning; do not re-litigate)

1. **Scope: all bridged CLI commands.** The cutover happens once, inside the generic bridge (`registerCliCommandExtension`), not per command or per namespace.
2. **Delete the widget machinery.** Remove `cli-command-live-progress-sink.ts`, `cli-command-live-progress-widget.ts`, and `cli-command-live-progress.ts` (replaced by a new status module), the `./commands/cli-command-live-progress` package export, and their tests. No dormant/flagged fallback. Git history preserves the code.
3. **Matrix reduction policy: phase + counts + active operation.** Matrix cell events reduce to a `done/total` count; the latest `matrix-active-operations` entry appears as a trailing detail via `formatActiveOperation`. Per-cell text, row labels, and the matrix table never appear in the status line.
4. **Liveness: 1 s heartbeat glyph, elapsed time only after ≥ 5 s.** The heartbeat is the only timer in the design. It pauses while a confirm/select prompt is open. Sub-5 s commands never show elapsed time.

## Context and discovered facts

### Why

The current presentation has an intrinsically large bug/flicker surface: an above-editor widget with variable height (phases + matrix rows), a 120 ms spinner render pump (`LIVE_PROGRESS_WIDGET_INTERVAL_MS = 120`), per-output-chunk render requests, native prompts opening over the animated widget, widget install/dispose races, and stale-context handling. A recent real corruption bug (commit `5a3090faa`, "Restore invocation-scoped Clinkr output") showed embedded terminal escapes reaching the live widget and desynchronizing Pi's differential renderer; sanitization was added, but the architecture keeps two renderers competing for one screen. This change replaces that with a lossy, low-frequency status reducer.

### The domain contract does NOT change

Command programs (Flow submit included) already write against the SDK invocation services in `ts/packages/public/sdk/src/sdk/services.ts`:

- `NsProgress` — `{ isLive: boolean; phase(event: NsProgressPhaseEvent): void }`. Event union: `phases-declared` (title + `NsProgressPhaseInfo[]`), `title-changed`, `phase-started {phaseKey, label?}`, `phase-progress {phaseKey, label}`, `phase-done {phaseKey, detail?}`, `phase-failed {phaseKey, detail}`, plus matrix events `matrix-declared {columns, labelHeader?}`, `matrix-rows {rows}`, `matrix-cell {rowKey, columnKey, state, text?}` (states `pending|active|done|skipped|failed`), `matrix-active-operations {operations: ActiveOperation[]}`.
- `NsCommandIo`, stdout/stderr, `NsConfirmPrompt`/`NsSelectPrompt` — unchanged.
- Host wiring: `ts/packages/public/sdk/src/cli/index.ts:141` builds `NsProgress` from `deps.onProgress` (`{ isLive: true, phase: deps.onProgress }`, else `noopNsProgress`).
- `isMatrixProgressEvent()` and `formatActiveOperation()` are exported from `@nseng-ai/sdk`.
- `createProgressPhaseStateStore` (phase checklist reducer, `@nseng-ai/sdk/progress-phase-state`) is reusable for tracking the active phase/label.

This change is entirely a Pi-host adapter swap behind `CliCommandRunDeps.onProgress`. Do not add any new `NsProgressPhaseEvent` variant (no `heartbeat`/liveness event — liveness is host-owned presentation).

### Current Pi-side implementation (all in `ts/packages/incubating/hosts/pi/runtime/pi-runtime`)

- `src/commands/cli-extension.ts` — the generic bridge. Key points:
  - `runRegisteredCliCommand` constructs `new LiveCommandProgress(ctx, {argv, cliName, commandName, piCommandName, timers?})`, calls `progress.setPhase("waiting for Pi to finish responding")`, awaits `ctx.waitForIdle()`, then `progress.setPhase("running CLI command")`.
  - `runDeps.stdout/stderr` accumulate output AND call `progress.appendOutput(...)` when `!hasLiveOutput`; `runDeps.onOutput` sets `hasLiveOutput = true` and appends to the live preview; `runDeps.onProgress` forwards to `progress.applyPhaseEvent(event)`.
  - Prompt wrappers already set phases `"waiting for confirmation"` / `"waiting for selection"` around `ctx.ui.confirm`/`ctx.ui.select` and restore `"running CLI command"` after.
  - `finally { progress.close(); }`, then durable output via `emitCliCommandOutput` (custom message type `ns-cli-command-output`), completion event, usage-error editor restoration, `afterCommandComplete` hook.
  - Registration uses `registerCommandWithImmediateAck` with `options: { delivery: "none" }` and a comment saying the live progress block above the editor replaces the footer ack.
  - Trace registration field: `bridgeMode: "custom-rendered-message-with-above-editor-live-stream"`.
- `src/commands/cli-command-live-progress.ts` — `LiveCommandProgress` (phase text, output-line ring buffer with `stripTerminalEscapes` + C0 stripping, `StructuredPhaseState` over `createProgressPhaseStateStore`, `MatrixWidgetState`, `displaySnapshot(spinnerTick)`), delegates rendering to a sink.
- `src/commands/cli-command-live-progress-sink.ts` — `resolveLiveProgressTarget` (`widget` > `status` > `none`), `StatusProgressSink` (1 s interval; useful as reference for the new module's stale-context handling), `WidgetProgressSink` (120 ms pump, `setWidget` factory, `tui.requestRender()`). Constants: `LIVE_PROGRESS_STATUS_ID = "ns-cli-command"`, `LIVE_PROGRESS_WIDGET_ID = "ns-cli-command-output"`.
- `src/commands/cli-command-live-progress-widget.ts` — pure widget-line builders (structured phase lines, matrix table lines, `phaseGlyph`, `phaseStateColor`).
- Consumers of these three modules: **only** the bridge itself, `test/commands/cli-command-live-progress.test.ts`, the package export `"./commands/cli-command-live-progress"` (`package.json` line ~8), and the subpath list in `test/integration/node-runtime-imports.test.ts` (line ~51). Verified by workspace-wide grep: no other package imports them. No CONTEXT.md/README names the widget, so no glossary sync is required.
- `src/kit/shared/spinner-frames.ts` (`spinnerFrameAt`, `SPINNER_FRAMES`) is ALSO used by `src/kit/shared/fast-text-draft.ts` — keep this module.
- `src/commands/ack.ts` — `registerCommandWithImmediateAck` supports `delivery: "status" | "message" | "none"`; status ack key `ns-command-ack`.
- Safe-UI helpers: `withSafePiUi`, `withSafePiUiValue`, `isStaleExtensionContextError` from `src/kit/shared/safe-ui.ts`; `unrefTimerScheduler` from `src/kit/shared/timers.ts`; `truncateDisplayLine` from `src/kit/terminal/presentation.ts`.

### What submit actually emits in Pi

`ts/packages/incubating/extensions/flow/src/submit/submit-matrix-progress.ts` → `resolveSubmitProgress`: in Pi (non-TTY, live `NsProgress`) presentation is `{ kind: "event", progress }`. The event stream carries `phases-declared` from `SUBMIT_PHASES`/`SUBMIT_PHASES_WITH_CHECKS`, phase transitions, `matrix-declared` (single column `Inventory`), `matrix-rows` (one row per branch, labels like `branch · PR #123`), `matrix-cell` updates, and `matrix-active-operations` (e.g. `{kind: "model", operation, modelRef}` or `{kind: "command", display}`). Land and stack-squash use the same matrix machinery. Commands without structured progress (e.g. `push`, `changes`) emit no phase events at all — for those, the status shows only the bridge phase + heartbeat + (eventually) elapsed.

### Environment/rules that bind this work

- `ts/AGENTS.md`: time seams — no raw `Date.now()`/timers in new logic. Inject `Clock` (`@nseng-ai/foundation/clock`, default `systemClock` from `@nseng-ai/foundation/time`) and `TimerScheduler` (default `unrefTimerScheduler` for Pi background timers). Note: the deleted `LiveCommandProgress` used `Date.now()` directly; the replacement must not copy that.
- Shared-cache test lanes: no fake timers — use `createManualTimerScheduler()` / `createManualClock()` from `@nseng-ai/foundation/time/testing`.
- The in-flight `clinkr-output-and-interaction-model` Objective records an open question about retiring `onOutput(stream, text)`. **Do not preempt it**: keep the `CliCommandRunDeps.onOutput` field in the type; the Pi bridge simply stops supplying it. Update its doc comment (it currently says "for the Pi widget/status path").
- The recent escape-stripping protection from `5a3090faa` must not regress: any event-derived text placed in the status line must be sanitized.

## Design

### Status line grammar

```
<glyph> /<piCommandName> · <text>[ · <done>/<total>][ · <operation>][ · <elapsed>]
```

- **glyph**: heartbeat frame from `spinnerFrameAt(tick)`, tick advanced by a 1000 ms `TimerScheduler` interval. While a prompt is open: literal `?` and the tick timer does not advance/update. After `phase-failed` with no subsequent phase start: `✗`.
- **text** precedence (first match wins):
  1. Bridge phase `"waiting for confirmation"` / `"waiting for selection"` (verbatim).
  2. Bridge phase `"waiting for Pi to finish responding"` → display `waiting for Pi`.
  3. Latest `phase-failed` → `<phase name> failed` (sticky until a later `phase-started`).
  4. Active structured phase → `<phase name>`, with `· <label>` appended when a `phase-progress`/`phase-started` label is present.
  5. Fallback (no structured events yet) → `running` (bridge phase `"running CLI command"`).
- **done/total**: shown only when a matrix is declared and total cells > 0. `done` = cells in state `done` or `skipped`; `total` = declared rows × declared columns. (For submit's single `Inventory` column this reads as branches, e.g. `2/4`.)
- **operation**: `formatActiveOperation(first)` of the latest `matrix-active-operations` list when non-empty; cleared when the list becomes empty.
- **elapsed**: `formatElapsedMs(clock.now() - startedAt)` appended once elapsed ≥ 5000 ms; updates on heartbeat ticks only.
- All event-derived fragments (phase names, labels, details, operation text) pass through `stripTerminalEscapes` + C0-control stripping; the final line is capped with `truncateDisplayLine(line, 100)`.
- Status writes go through `withSafePiUi`; on stale context, detach (cancel timer, stop updating, trace once) exactly like the current `StatusProgressSink`. Dedupe: skip `setStatus` when the computed string equals the last written string.
- Status key: keep `"ns-cli-command"`. `close()` cancels the timer and clears the status (sets `undefined`); success/failure end-state presentation belongs to the durable transcript output, not the footer.
- No UI (`ctx.hasUI` falsy) or no `setStatus`: the activity is a no-op shell (same as today's `"none"` target).

### New module interface

`src/commands/cli-command-status.ts`:

```ts
export interface CliCommandStatusContext {
  readonly hasUI?: boolean;
  readonly ui: { setStatus?(key: string, value: string | undefined): void };
}

export interface CliCommandStatusActivityOptions {
  readonly cliName: string;
  readonly commandName: string;
  readonly piCommandName: string;
  readonly timers?: TimerScheduler; // default unrefTimerScheduler
  readonly clock?: Clock;           // default systemClock
}

export class CliCommandStatusActivity {
  constructor(ctx: CliCommandStatusContext, options: CliCommandStatusActivityOptions);
  setPhase(phase: string): void;                      // bridge phases, incl. prompt waits
  applyPhaseEvent(event: NsProgressPhaseEvent): void; // structured + matrix reduction
  close(): void;                                      // idempotent; cancels timer, clears status
}
```

Internals: `createProgressPhaseStateStore({ unknownKeyPolicy: "append" })` for phase tracking; a small private matrix-counts collector (rows count, columns count, per-row-column latest state — replaces `MatrixWidgetState`, no snapshots/labels needed); latest active-operations list; prompt-pause flag derived from `setPhase` values; trace hooks via `traceCliCommand` (`status_start`, `status_stop`, `status_stale_context`).

## Files to change

All paths relative to repo root.

**`ts/packages/incubating/hosts/pi/runtime/pi-runtime/`**

- `src/commands/cli-command-status.ts` — NEW (module above).
- `src/commands/cli-extension.ts` — EDIT:
  - Replace `LiveCommandProgress` import/construction with `CliCommandStatusActivity`.
  - Delete `hasLiveOutput` and all `progress.appendOutput(...)` calls; `stdout`/`stderr` closures only accumulate strings.
  - Stop supplying `onOutput` in `runDeps` (keep the optional field on `CliCommandRunDeps`; update its doc comment to say Pi no longer renders transient output and the field is retained pending the clinkr-output-and-interaction-model `onOutput` ruling).
  - Keep `onProgress: (event) => activity.applyPhaseEvent(event)` and the confirm/select phase wrappers unchanged.
  - Update the registration comment for `delivery: "none"` (the footer status line set synchronously at handler start is now the acknowledgement) and the `bridgeMode` trace string to `"custom-rendered-message-with-footer-status"`.
  - Remove now-unused trace events tied to live output if any remain (`live_progress_output` emission moves out with the deleted class; keep `runner_done` output-size fields).
- `src/commands/cli-command-live-progress.ts` — DELETE.
- `src/commands/cli-command-live-progress-sink.ts` — DELETE.
- `src/commands/cli-command-live-progress-widget.ts` — DELETE.
- `package.json` — remove the `"./commands/cli-command-live-progress"` export entry.
- `test/integration/node-runtime-imports.test.ts` — remove the deleted subpath from the import list (around line 51).
- `test/commands/cli-command-live-progress.test.ts` — DELETE.
- `test/commands/cli-command-status.test.ts` — NEW: reducer mapping (each event type → expected status string), counts arithmetic incl. skipped cells and matrix re-declaration, active-operation append/clear, failed stickiness, prompt pause (no glyph advance while `waiting for confirmation`), elapsed threshold (manual clock: absent at 4.9 s, present at 5 s+), sanitization of escape-laden labels, dedupe (no duplicate `setStatus` for identical strings), stale-context detach, idempotent `close()` clearing the status. Use `createManualTimerScheduler()` + `createManualClock()`; assert via a recording fake `setStatus`.
- `test/cli-command-extension.test.ts` — EDIT: replace widget-oriented expectations (`setWidget` factories, live-output preview, escape-stripping-in-preview assertions added by `5a3090faa`, any `bridgeMode` string assertion) with status-line expectations; the sanitization guarantee re-lands as status-text assertions.
- `test/commands/cli-command-live-progress.test.ts` (worktree/refresh and pi-ns-flow tests): `test/worktree-status/refresh.test.ts` and `ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/test/*` only stub `setStatus`/`setWidget` no-ops — expect no changes, but run them.

**Unchanged by design (verify no accidental edits):** `@nseng-ai/sdk` services and `progress-phase-state`, `sdk/src/cli/index.ts` wiring, all Flow packages (`submit-matrix-progress.ts`, phase-stream, land matrix), `pi-ns-flow` extension, `src/kit/shared/spinner-frames.ts` (still used by `fast-text-draft.ts`), `src/commands/ack.ts`.

## Implementation steps

1. Add `cli-command-status.ts` with the interface and reducer above (inject `Clock` + `TimerScheduler`; no raw timers or `Date.now()`).
2. Add `test/commands/cli-command-status.test.ts`; get the module green in isolation.
3. Rewire `cli-extension.ts` per the edit list; keep the surrounding control flow (parse → ack → waitForIdle → run → close → durable output → events → recovery hook) byte-for-byte in behavior otherwise.
4. Delete the three live-progress modules, the package export, and the old test file; update `node-runtime-imports.test.ts`.
5. Update `test/cli-command-extension.test.ts` expectations.
6. Sweep for stragglers: `rg -n 'cli-command-live-progress|LiveCommandProgress|MatrixWidgetState|renderLiveProgressWidget|buildMatrixProgressWidgetLines' ts/` must return nothing outside git history.
7. Manual smoke in Pi (this repo is self-hosting): `/ns:flow:changes` (fast, no structured events — expect quick status, no elapsed), `/ns:flow:submit` on a real stack (phases, counts, model operation detail, confirmation pause), and a usage error (e.g. bad flag) to confirm editor restoration still works.

Execution strategy note: this is a localized single-package change (one new module, one rewired module, three deletions), not a same-shape multi-file refactor — execute directly in one implementation session; no fan-out or per-file checklist needed.

## Validation

- `just` (default repo validation; run `just dprint-fix` first if formatting complains).
- `just ts-check` for the native tsc pass.
- Targeted Vitest for `pi-runtime` package tests during development; full TS suite via `just` before finishing.
- `just ts-test-typescript-style-guard` — required here because the change touches timer/clock seams and deletes guarded subjects (raw-timer and shared-test bans must hold for the new module and tests).

## Risks, assumptions, open questions

- **Perceived richness regression** (accepted trade-off): no live output tail, no visible matrix during the run, no continuous animation. Mitigation: durable final output unchanged; counts + active operation carry the "is it advancing?" signal.
- **Commands with zero structured progress** show only `running` + heartbeat + elapsed. Acceptable; the fix, if ever wanted, is those CLIs emitting `phase-*` events — not a Pi change.
- **RPC mode**: `setStatus` is a supported fire-and-forget in RPC per Pi docs; the heartbeat produces ~1 small update/s. If this proves noisy for RPC consumers, gating the heartbeat tick on `ctx.mode === "tui"`-equivalent info is a follow-up (the bridge only sees `hasUI`, so this would need a context capability check — defer unless it bites).
- **Assumption**: ack `delivery: "none"` stays; the synchronously-set status line is the acknowledgement. `startMessage` notify behavior (`emitCliCommandStart`) unchanged.
- **Assumption**: status key `ns-cli-command` has no other writers (verified by grep; the ack path uses `ns-command-ack`).
- **Deferred, deliberately not in scope**: `onOutput` retirement and any `phase-progress` fraction field (`{completed, total}`) — both belong to the `clinkr-output-and-interaction-model` Objective's open-question rulings. A richer isolated experience for submit (suspended-Pi child-terminal takeover) was evaluated and parked as a possible follow-up; nothing here forecloses it.
- **Do not** add ambient Graphite/stack assumptions to the status module (opt-in-stacking orientation): it consumes only host-neutral `NsProgressPhaseEvent`s.

## Review and remediation

- Self-review the diff for: exactly-once `close()` in the bridge `finally`; no path where a thrown runner error skips status cleanup; no `Date.now()`/raw `setInterval` in new code; sanitization applied to every event-derived fragment; deleted-module grep clean; package export removed.
- If `just` reports dprint failures, run `just dprint-fix` and rerun — never hand-edit formatter output.
- If the style guard flags the new module's timer usage, the fix is injecting the seam properly (constructor options), not suppressing the rule.
- Post-merge watch: if users report "looks frozen" on long single-phase operations despite the heartbeat, the first lever is better `phase-progress` labels from the emitting CLI, second lever is lowering the 5 s elapsed threshold — both trivial, neither requires re-architecting.