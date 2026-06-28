# Flow land — full UX redesign (PR 5b)

## Summary

This update records **PR 5b**, the full house-style UX redesign of `sdl flow land` and the final slice
of the flow side-effect migration stack. Building on PR 5a's isolated CCC-local renderer
(`ts/packages/ccc/src/land-stack/land-presentation.ts`) and dual-surface discovery, PR 5b wires that
renderer into the live CLI surface while leaving the Pi command-stream path untouched and ANSI-free.
Every settled, user-visible land state now renders as a house-style result block on the SDL CLI; all
safety, recovery, and exit-code semantics are preserved. With this slice, `sdl flow land` is marked
**Done**, completing `push` / `pull-trunk` / `submit` / `cp` / `branch-latest-commit` / `autobranch` /
`autoslot` / `regenerate-pr` / `land` as house-style flow side-effect surfaces.

## What landed

- **CLI-only render hook.** Added an optional `renderResultBlock?(kind, message)` field to the shared
  `LandStackCommandContext` (`land-stack/types.ts`). It is wired **only** by the SDL CLI edge
  (`runLandCli` in `ts/packages/ccc/src/land.ts`); the Pi command-stream context never sets it, so the
  shared `presentBrief`/`present`/`notify` helpers stay plain text on the Pi surface (still colored
  downstream by `renderCommandStreamMessage`). This is how house-style ANSI is confined to the CLI edge
  per PR 5a's load-bearing constraint.
- **Caps threading.** `LandCliInput` gained an optional `caps?: Caps`; the flow wrapper
  (`ts/packages/capabilities/flow/src/commands/land.ts`) resolves it via `resolveFlowStreamCaps(ctx)`
  and passes it only into the CLI edge. When `caps` is omitted the CLI block renders plain (no guessing
  caps), so non-flow callers and tests opt in explicitly.
- **Result-block rendering.** `runLandCli` builds a CLI result-block renderer that splits a settled
  message's first line into the bold + intent-painted + glyph headline and renders the remainder as
  normal-weight body via `renderLandResultBlock` (house-style §3/§4). Domain-authored detail
  (partial-success "Already landed:"/"Failed at:" lists, failure cause + `formatCommandDetails`,
  recovery `Suggested next action:` lines) is preserved verbatim so recovery text is never lost.
- **Typed refusal/failure split (§7.3).** Added a typed `outcome: "refusal" | "failure"` discriminator
  to `LandStackFailure` (`land-stack/errors.ts`), defaulting to `failure`. Declined guardrails
  (cancellations, missing confirmation channel, base-branch mismatch, nothing-to-do, not-a-managed-slot,
  cancelled/non-interactive post-landing cleanup) are tagged `refusal`. The generic
  `presentLandStackFailure` and the call sites map this onto the renderer `kind` via
  `landFailureKind(...)`, so a declined guardrail renders **warn (never red)** even when it is notified
  at `error` level to flip the exit code. The notify `level` is left untouched, so stdout/stderr routing
  and exit codes are unchanged.
- **State coverage.** Inventoried states routed through the renderer (CLI surface only): preflight load
  failure, nothing-to-do, arg-parse failure; fast-path base-branch refusal / dry-run / merge
  success / merge failure; stack & chunked non-interactive refusal, cancellation, and success summary;
  the merge-loop partial-success failure (`formatFailure` "Already landed:" / "Failed at:" /
  suggested action); and post-landing `--free` not-a-managed-slot / declined / non-interactive /
  free-or-delete failure / cleanup success.

## Objective impact

- `sdl flow land` is **Done** in `cli-surface-audit.md`; this completes the P0 flow side-effect cluster.
- No cross-package renderer extraction (honors the plan's no-extraction rule): the rendering stays a
  small CCC-local helper next to the land facts. The CCC-local `land-presentation.ts` from PR 5a is now
  a live consumer rather than an isolated seam.
- No new machine output contract; the human CLI surface may continue to evolve.

## Safety semantics preserved

Confirmation gates, `--yes`/`--force` meanings, and dry-run semantics are unchanged (the redesign only
restyles already-emitted result text). Non-interactive refusal still refuses (and keeps exit 1 via the
unchanged `error` level). Partial-success reporting, backup/recovery hints, and the
no-hidden-auto-merge / no-remote-delete / no-global-sync guarantees are untouched because no orchestration
control flow changed — only presentation. The Pi command-stream path stays ANSI-free, proven by the
hook being wired solely on the CLI context plus the `land-command.test.ts` Pi-path notification tests
remaining plain and unchanged.

## Tests

- Updated the PR-5a CLI baseline tests (`packages/ccc/test/land-command.test.ts`) from "plain, no
  ANSI" to assert the house-style surface: green-check stack success and dry-run blocks on stdout, warn
  (never-red) non-interactive refusal on stderr, semantic text under `stripAnsi`, streaming progress
  left plain on stderr, and a caps-omitted plain-fallback case.
- `land-presentation.test.ts` (the renderer unit) and `land-stack.test.ts` are unchanged and still pass.

## Parked follow-ups (future, not in-plan)

- Colorize the CLI streaming progress lines (currently the plain `CommandIo` ✓/✗/→ fallback); the house
  style was scoped here to the settled result blocks.
- Promote the three near-identical result-block builders (`land-presentation.ts`,
  `autoslot-presentation.ts`, the flow-local `workflow-result-block.ts`) to a shared renderer. Parked by
  the Objective's standing no-extraction rule.
- The PR-5a review note about `formatSuccessNotification` re-parsing the summary's first line instead of
  using typed `landed`/`warnings` is left as-is to avoid changing Pi-facing notification text; parked.
