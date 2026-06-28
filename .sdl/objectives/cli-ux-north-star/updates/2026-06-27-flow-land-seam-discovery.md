# Flow land — seam discovery (PR 5a)

## Summary

`sdl flow land` is the largest and only safety-critical flow side-effect surface, so its migration is
split into PR 5a (discovery + presentation seam isolation) and PR 5b (full UX redesign). This update
records **PR 5a**: the complete user-visible land state inventory, the isolated CCC-local CLI-edge
house-style renderer, and the key dual-surface discovery that constrains how PR 5b may render. No
live land output is rerouted in PR 5a; existing behavior, exit codes, confirmation gates, and the Pi
command-stream surface are unchanged. `sdl flow land` is **not** marked Done — PR 5b does that.

## Key discovery — `land` is dual-surface; ANSI must be confined to the CLI edge

Unlike CLI-only `autoslot` (whose CCC-local renderer could be wired directly into `CommandIo.notify`),
`land` runs on **two** delivery surfaces that share the same plain-string formatters in
`ts/packages/ccc/src/land-stack/presentation.ts`:

- **Pi slash-command** (`registerLandCommand` → `createLandUiCommandIo` → `LandStackCommandStream` →
  `renderCommandStreamMessage`): durable outcomes become `COMMAND_STREAM_MESSAGE_TYPE` custom scrollback
  messages, and the Pi renderer applies its own `theme.fg` coloring keyed on the `✓`/`✗`/`→` line
  prefixes, plus PR-link linkification. Transient running-command status maps to the Pi status footer.
- **SDL CLI** (`runLandCli` → `createLandCliCommandIo`): `notify` maps to stdout/stderr as plain text;
  transient `phase` maps to `onOutput("stderr", …)` or stderr.

Because the same `presentBrief`/`formatFailure`/`formatSuccessSummary` strings flow to both, house-style
ANSI **must reach only the CLI edge** (`runLandCli`). Passing pre-styled escapes through the shared
`notify`/command-stream path would render raw SGR in the Pi UI and double-color against the Pi renderer.
This is the load-bearing reason PR 5a isolates the renderer **without** rerouting live output, and the
boundary PR 5b must respect: thread `caps` only into the CLI edge; leave the Pi path untouched.

## Full user-visible land state inventory

Discovered across `land.ts`, `land-stack.ts`, `land-stack/landing-operations.ts`, and
`land-stack/presentation.ts`. PR 5b routes these through the renderer (CLI surface only).

Entry / preflight:

1. **Arg-parse failure** — unknown flag → error `presentBrief` + `usage()` (`parseArgs`).
2. **Help / usage** — `--help`/`-h` → `usage()` at `info`.
3. **Preflight load failure** — `loadLandingShape` failure → `formatFailure` at the failure level
   (e.g. Graphite metadata DB missing/unreadable; stack forks at a fork-point; not a Graphite repo).
4. **Nothing to do** — current branch is trunk or has no PR path → `info` ("Current branch is X,
   which is trunk or has no PR path to land. Nothing to do.").

Fast path (isolated single PR, `isIsolatedFastPath`):

5. **PR load failure** — `gh pr view` fails / malformed JSON / missing required fields → `error`.
6. **Base-branch refusal** — PR base ≠ Graphite trunk → `error` ("Refusing to land PR #N: base
   branch is '…', not Graphite trunk '…'. Merge not attempted.").
7. **Dry-run** — `info` ("Dry run only; would merge PR #N into <trunk>.").
8. **Merge progress** — `progress(...)` ("Running gh pr merge -s with PR title/body…").
9. **Merge success** — `info` ("Merged PR #N; squash commit used PR title/body.", with `gh` output).
10. **Merge failure** — `error` ("gh pr merge -s … failed for PR #N with exit code C.", with output).

Stack path (2..AUTO_CHUNK_LANDING_THRESHOLD PRs):

11. **Upfront stack confirmation** — `ctx.ui.confirm("Land stack?", …)`; includes the descendant
    "will not be merged; will try to maintain after landing" note.
12. **Non-interactive refusal** — no UI and not `--yes`/dry-run → `error` ("Refusing to land a stack
    without confirmation in non-interactive mode. Re-run with --yes." + plan text).
13. **Cancellation** — declined confirmation → `info` ("Cancelled before merge; no PRs were landed.").
14. **Plan build failure** — `buildLandingPlan` failure → `formatFailure`.
15. **Single-plan dry-run plan preview** — `info` + `formatPlan`: landing path, branches in merge
    order, descendant-maintenance plan, warnings, managed-slot cleanup notice, PR submit/update
    notice, the per-PR merge step list, and the "will not merge descendants / will not delete remote
    branches / will not run global gt sync / will not wait for checks or enable auto-merge / stop on
    first failure" safety footer.
16. **In-plan confirmation** — `ctx.ui.confirm("Land this stack path?", planText)`.
17. **Managed-slot cleanup** (`confirmAndFreeManagedSlots`) — confirm freeing landing-branch slots;
    decline / non-interactive / free-failure are failures.
18. **PR submit/update** (`confirmAndSubmitRequiredPrUpdates`) — confirm `gt restack` + submit/update;
    decline / non-interactive / submit-failure are failures; then preflight recheck + residual failure.
19. **Merge-loop progress** — command-stream notes: "Preparing to land N PRs through X…", "Merging PR
    #N branch…", "Merged and verified PR #N branch.", "Refreshing stack through <child>…", "Cleaning
    up local branch <branch>…", plus per-command `✓`/`✗ $ <cmd>` finish lines (with exit on failure).
20. **Merge-loop failure (stop on first failure, incl. partial success)** — `formatFailure(failure,
    landed, landedChunks)`: "land stopped.", "Already landed:" list, "Failed at: #N branch", the
    message, dimmed command details, "Suggested next action:".
21. **Descendant maintenance** — `formatRestackFailureMessage` / `formatSubmitFailureMessage`; left
    open & restacked / deferred / needs follow-up / skipped-with-reason.
22. **Stack success summary** — `formatSuccessSummary`: "Landed N PRs: …", descendant-maintenance
    outcome, "Remaining cleanup:" (remote branches not deleted; retained local branches), "Completed
    with N warnings:", "Notes:". Completion level is `warning` when warnings exist, else `success`.

Chunked path (> AUTO_CHUNK_LANDING_THRESHOLD PRs):

23. **Chunked dry-run** — `info` + `formatChunkedPlan` (chunk count, path, per-chunk PR ranges, the
    single-confirmation-covers-everything note).
24. **Chunked non-interactive refusal** / **confirmation** ("Land this stack in chunks?") /
    **cancellation** — analogues of 12/16/13 for the chunked plan.
25. **Per-chunk preflight/prepare failures** and **chunked partial success/failure** —
    `formatFailure` "Already landed by chunk:" with the rerun-from-desired-branch guidance.
26. **Chunked success summary** — `formatChunkedSuccessSummary` (per-chunk landed lists + the base
    summary tail).

Post-landing `--free` cleanup (`runPostLandingSlotCleanup`, both fast and stack/chunk paths):

27. **Not a managed slot** — `info` ("… current worktree … is not a managed slot; kept local branch …").
28. **Non-interactive confirmation refusal** — failure + cleanup details + suggested action.
29. **Interactive confirm** — `ctx.ui.confirm("Free current slot and delete local branch?", details)`.
30. **Cancellation** — `warning` ("Cancelled post-landing cleanup; … <slot> and local branch … kept.").
31. **Free progress / failure** — status "freeing <slot>…"; failure "… freeing <slot> failed." + details.
32. **Delete progress / failure** — status "deleting <branch>…"; failure "… deleting local branch …
    failed." + details.
33. **Cleanup success** — `success` ("Post-landing cleanup complete: freed <slot> and deleted local
    branch <branch>.").

Cross-cutting:

34. **Unexpected error** — caught in `executeStackLanding` → "land failed unexpectedly: <msg>".
35. **Registration failure** — `runLandCli` invariant guard → stderr, exit 1.
36. **Transient running-command status** — `commandStream.start` → `io.phase("land: running <cmd>…")`.

## Seams introduced / isolated

- **New CCC-local renderer** `ts/packages/ccc/src/land-stack/land-presentation.ts` — the land twin of
  `autoslot-presentation.ts`. Typed input `LandResultBlock { kind: "success" | "refusal" | "failure";
  headline; body?; guidance?; cwd? }` and pure `renderLandResultBlock(caps, input)`. Same house-style
  grammar (bold + intent-paint + leading glyph headline §3; concise success / detailed failure /
  first-class warn refusal §4, §7.3) over `caps` + typed facts; no I/O, no `process.*`. The `body`
  accepts the existing typed `presentation.ts` formatter output, so the seam composes — it does not
  parse final strings. The module header documents the inventory→kind mapping and the dual-surface
  ANSI-at-CLI-edge boundary.
- **Renderer left unwired in PR 5a (deliberate).** Live land output still flows through the existing
  `presentBrief` / `LandStackCommandStream` paths unchanged, so there is zero behavior change, zero
  Pi-ANSI risk, and all existing land tests pass untouched. This is the "isolate the seam" step; PR 5b
  threads caps and reroutes the CLI surface.

Confirmed unchanged: core landing semantics (confirmation gates, `--yes`/`--force`, dry-run,
partial-success, recovery guidance, post-landing cleanup, no hidden auto-merge); Pi command-stream
custom messages (`renderCommandStreamMessage`, `COMMAND_STREAM_MESSAGE_TYPE`); the `CommandIo`
fallback for CLI/`onOutput` contexts (`createLandCliCommandIo`).

## Tests

- `ts/packages/ccc/test/land-presentation.test.ts` (new): success/refusal/failure tiers (incl.
  partial-success body + recovery guidance) and truecolor/mono/ascii caps degradation for the renderer.
- `ts/packages/ccc/test/land-command.test.ts` (new "house-style seam baseline (PR 5a)" describe):
  pins the current CLI surface as **plain text with no ANSI escapes** for the success summary,
  non-interactive stack refusal, and fast-path dry-run, so PR 5b's CLI restyle is a deliberate,
  visible diff. Existing exact-string land assertions remain the semantic regression net.

## Objective impact

- `cli-surface-audit.md`: `sdl flow land` moved to "Discovery/seams (PR 5a) — not Done" with the
  dual-surface note; still not Done.
- `roadmap.md`: follow-up note "seam/discovery complete; final redesign next".
- Establishes the CLI-edge-only rendering boundary for dual-surface CCC commands as the precedent PR 5b
  inherits.

## Follow-ups (handoff to PR 5b — full redesign)

- Thread resolved `caps` into the CLI edge only: `resolveFlowStreamCaps(ctx)` in
  `ts/packages/capabilities/flow/src/commands/land.ts` → new `caps` field on `LandCliInput` → into
  `runLandCli` / `createLandCliCommandIo`. Do NOT thread caps into the shared Pi path.
- Route the inventoried states through `renderLandResultBlock` at the CLI edge. The cleanest mechanism
  is to render from the typed `LandStackOutcome` / `LandStackFailure` (already returned by
  `runLandCommand`) at the CLI boundary rather than restyling the shared `presentBrief` strings, so the
  Pi surface keeps its existing renderer. Map failure detail onto §4 tiers (promote the cause, dim the
  command transcript via the existing `formatCommandDetails`).
- Preserve every safety behavior: confirmation gates, `--yes`/`--force` meanings, dry-run plan preview,
  non-interactive refusal, partial-success "already landed" reporting, backup/recovery hints, and the
  no-hidden-auto-merge / no-remote-delete / no-global-sync invariants in `formatPlan`'s safety footer.
- Keep the confirmation prompt bodies (`formatPlan`/`formatChunkedPlan`/`formatUpfrontStackConfirmation`/
  cleanup details) plain prose unless the host clearly supports styled confirmation surfaces.
- Note for review: `formatSuccessNotification` derives the CLI/Pi notification by re-parsing the
  formatted summary's first line (`firstNonEmptyLine(message)`); the typed `landed`/`warnings` facts are
  already available, so PR 5b may prefer building the notification from those typed facts.
- `land-presentation.ts`, `autoslot-presentation.ts`, and the flow-local `workflow-result-block.ts` are
  now three near-identical house-style block builders. Per the standing no-extraction rule, any shared
  renderer promotion is parked, not in-plan.

## Evidence

Validation run after implementation:

- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/ccc/test/land-presentation.test.ts packages/ccc/test/land-command.test.ts packages/ccc/test/land-stack.test.ts`
  — passed (133 tests).
- `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`, `just ts-guard`,
  `just dprint-check`, `just ts-deps-check` — see commit/PR for the recorded run.
