# Handoff: Fix escape-byte leak that wipes the Pi screen during /ns:flow:submit

Continuation focus: Implement two fixes on branch `restore-invocation-scoped-clinkr-output` (PR #4131): (1) stop the branch's new tests from writing real terminal escape bytes to shared stdout; (2) add a systemic guard in pi-runtime that strips ESC sequences and C0 controls from the live-output→widget path.

## Context

During `/ns:flow:submit` on this branch, the Pi TUI temporarily looked completely wiped: only the live progress widget block near the top, a stray dim `stderr:` line mid-screen, and the `[gh]` PR status line were visible; chat, editor, and footer were gone until a later full redraw healed the screen.

Investigation traced the full causal chain:

1. The pre-submit check (`ns.toml` `[points]."flow.submit.pre" = ["just"]`) runs `just` with piped stdio (`stdio: [ignore, pipe, pipe]` in `@nseng-ai/foundation` exec).
2. The vitest full-suite lane inside `just` prints a test's fake TUI frame containing real `\x1b[2J` (clear screen) and `\x1b[H` (cursor home) bytes to stdout. Verified empirically: a piped `just` run captured `\x1b[2Jambient TUI frame\x1b[Hunrelated TUI frame` in stdout between the vitest summaries.
3. That chunk flows through the live output channel into `LiveCommandProgress.recordOutput` (no sanitization) and becomes the widget's latest output line.
4. Pi's renderer treats escape sequences as zero-width (`visibleWidth`/`truncateToWidth` in pi-tui) and writes them verbatim, so the terminal executes clear-screen + cursor-home on every ~120 ms widget repaint while that line remains latest.
5. Pi's differential renderer model (`previousLines`/`hardwareCursorRow` in `packages/tui/src/tui-main-screen.ts` `doRender()`) then disagrees with the real terminal; subsequent diff paints land at wrong rows on a blanked screen. The state heals at the next `fullRender(true)`.

The escape-writing test was added by this very branch (`f375587c9 [cp] Route Clinkr output through invocation sinks`), which also removed clinkr's `withInterceptedProcessWriters`. The test intentionally proves ambient process writes are NOT captured by the Pi bridge — but it does so by writing raw clear-screen bytes to the real shared stdout.

## Current State

- Branch `restore-invocation-scoped-clinkr-output`, PR #4131 submitted; worktree clean; two commits on top of master: `f375587c9` and `330edc578`.
- Investigation complete; no fix code written yet.
- Empirical confirmation exists: piped `just` output contained exactly `\x1b[2J` and `\x1b[H` from the vitest lane (captures were at /tmp/just-stdout.bin and /tmp/just-stderr.bin, may be gone).

## Decisions / Findings

- Root cause is self-inflicted by this branch's own new tests; must fix before land.
- Leak sites:
  - `ts/packages/incubating/hosts/pi/runtime/pi-runtime/test/cli-command-extension.test.ts:719` — `process.stdout.write("\u001b[2Jambient TUI frame\u001b[H")` inside the test "excludes unrelated ambient TUI output while selection and live progress are pending".
  - `ts/packages/public/infra/foundation/test/cli-runtime/clinkr-app-cli-entry.test.ts:173` — `process.stdout.write("unrelated TUI frame\n")` (plain text; pollutes runner stdout, same treatment).
- The assertions (`not.toContain("ambient TUI frame")`) do not need real escape bytes; either drop `\u001b[2J`/`\u001b[H` from the written string or stub `process.stdout.write` locally around the write (restore in finally).
- Systemic guard belongs in pi-runtime's live-output→widget path: `recordOutput` in `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-command-live-progress.ts` (splits on `\n`, converts `\r`→`\n`, no ESC/C0 stripping) or `formatLiveOutputLine` in `.../cli-command-live-progress-widget.ts` (embeds raw text). Clinkr already exports `stripAnsi` (`ts/packages/public/infra/clinkr/src/ansi.ts`); pi-tui also has `stripTerminalSequences` for reference.
- Ruled out: Pi `clearOnShrink` (off by default, unset), output floods (trace chunks small), malformed OSC 9;4 progress sequence (fixed in installed pi 0.84.0), widget line-count growth (bounded).
- Under Pi, flow stream caps resolve non-TTY (`resolveFlowStreamCaps` → `renderCapabilities` without `caps`), so the clinkr stream sink's non-tty contract ("load-bearing for Pi correctness") held; the leak was via test output content, not the sink.

## Next Steps

1. Fix the two test writes so no raw escape bytes (and ideally no unmanaged ambient stdout bytes) reach shared stdout; keep the tests' intent (proving the Pi bridge does not capture ambient process writes) intact.
2. Add sanitization of live output before widget embedding in pi-runtime: strip ESC/CSI/OSC sequences and C0 controls (except newline handling already present) in `recordOutput` or `formatLiveOutputLine`; add a unit test that a line containing `\x1b[2J`/`\x1b[H`/`\x1b[1A` renders as plain text in the widget.
3. Run validation: `just` at repo root (default entrypoint); TS-specific lanes per `ts/AGENTS.md` if needed.
4. Amend/commit via Graphite on this branch (`gt modify` or a new commit per repo conventions; never commit on master) and resubmit the PR (`gt submit --no-interactive`).
5. Optional follow-up to note in PR discussion: upstream pi hardening (strip non-SGR sequences from component lines at render time in pi-tui) — not part of this branch.

## Investigation Sources

- Source session ID: 019fd7b8-32e0-7a00-be84-1646648c9c6d
- Source session log: /Users/schrockn/.pi/agent/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-01--/2026-08-06T15-36-40-928Z_019fd7b8-32e0-7a00-be84-1646648c9c6d.jsonl
- Related files:
  - ts/packages/incubating/hosts/pi/runtime/pi-runtime/test/cli-command-extension.test.ts — leak site 1 (line ~719) and the test whose intent must be preserved.
  - ts/packages/public/infra/foundation/test/cli-runtime/clinkr-app-cli-entry.test.ts — leak site 2 (line ~173).
  - ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-command-live-progress.ts — `recordOutput`, candidate home for sanitization.
  - ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-command-live-progress-widget.ts — `formatLiveOutputLine`/`buildLiveProgressWidgetLines`, alternate home for sanitization.
  - ts/packages/public/infra/clinkr/src/ansi.ts — existing `stripAnsi` helper to reuse or extend.
  - ~/.local/state/ns/pi-cli-command-extension/ns-pi-cli-command-extension.jsonl — ns Pi CLI bridge trace (the incident run is pid 57316, 2026-08-06T15:36:46Z).
  - /Users/schrockn/code/earendil-works/pi/packages/tui/src/tui-main-screen.ts — pi differential renderer (`doRender`), background for the desync mechanism.
  - /Users/schrockn/code/earendil-works/pi/packages/tui/src/utils.ts — `visibleWidth`/`stripTerminalSequences`, background for why escapes pass through.

## Useful Commands / Files

- Reproduce/verify the leak: `just > /tmp/just-stdout.bin 2>/tmp/just-stderr.bin` then scan for `\x1b` bytes (expect the `\x1b[2J...\x1b[H` frame to disappear after fix 1).
- Pi-side live capture if it recurs: launch pi with `PI_DEBUG_REDRAW=1` and `PI_TUI_DEBUG=1` (frame dumps in /tmp/tui, redraw reasons in ~/.pi/agent/pi-debug.log).
- Branch commits: `git show f375587c9` (interception removal + tests), `git show 330edc578`.
- PR: https://github.com/nseng-ai/ns/pull/4131
