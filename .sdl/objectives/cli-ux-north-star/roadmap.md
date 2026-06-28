# Roadmap

## Work

- [x] Build the throwaway steelthread harness (no reusable infra): standalone scratch code
      rendering `objective list` (minimal/gh chrome, rich color) and `flow submit` (append + in-place
      variants, log-tail), with fixtures and capability knobs to force color depth / width / unicode.
      Lives at `ts/scratch/cli-northstar/` (run with `node main.ts <objective-list|flow-submit|matrix>`);
      disposable, no `@sdl/clinkr` imports, hand-rolled ANSI. `--ladder a|b` makes the A-vs-B call feelable.
- [x] Dial in the UX north star by feel and get explicit sign-off — chrome, glyph set, palette
      intents, streaming behavior — and decide palette ladder approach A (full ladder) vs B
      (modern-only). **Signed off 2026-06-27** (full sign-off): ladder A; chrome, palette intents
      (cyan `#22d3ee` accent), the glyph set, and in-place-only streaming all settled by feel.
      Ladder decided by feel: **A (full ladder)** (2026-06-27). Refinements settled by feel and
      carried into the rebuild — `objective list` renders human-relative times ("2 days ago") not raw ISO; the outstanding-changes marker is a
      bare warn `x` in its own spaced column with a one-line footer legend ("x = uncommitted changes
      not yet recorded in an update"), `LATEST UPDATE` aligned above the dates (chosen by feel from a
      marker gallery of paren `(x)` / dot / `changed` label / `x`+legend); and the `flow submit`
      failure block reads in three tiers — a bold+error headline, the salient transcript cause lines
      (`error:`/`rejected`/`fatal:`) at normal foreground weight, and the git plumbing + transcript
      path dimmed — so the actionable line and the cause both stand out without over-using red.
      Streaming cadence dialed in: the in-place sim uses a base step dwell (~220ms) with network
      steps (push / create / update PR) dwelling ~2.6x longer, and the spinner repaints on its own
      ~90ms cadence so a long step keeps animating instead of freezing — reads as real work, not a
      uniform flash.
      Streaming presentation decided by feel: **in-place only** (live region, spinner→`✓`,
      log-tail, settled Submitted block). Append was dropped entirely — the static settled frame
      covers non-TTY humans and machine `--format json` covers CI/scripts, so an append fallback is
      redundant. The deferred risk stands: the in-place live region's cursor ownership vs raw
      `gt submit` passthrough is reconciled only at the rebuild (faked in the prototype via the
      log-tail).
      Glyph set signed off by feel: `✓ ● ✗ – •` + braille spinner (ascii fallbacks `v o x - *`,
      `|/-\`). No changes needed — reads as one family in motion and degrades cleanly.
      Palette dialed in: semantic intents are GitHub-derived (success/warn/error/muted) and the
      brand **accent is cyan `#22d3ee`**, chosen by feel from a candidate gallery.
- [x] Build clinkr core capability foundation: widen `Caps` to `{ isTty, colorDepth, columns,
      canRenderUnicode }` and add `resolveCaps()` (pure snapshot resolver plus process reader), keeping
      it dependency-free in core.
      **Done 2026-06-27.** Landed `packages/infra/clinkr/src/caps.ts`: pure `resolveCaps(snapshot)`
      over an injected `CapsEnv`, with the impure `readProcessCapsEnv()` reader and a
      `resolveProcessCaps()` composer split out so the decision logic is TDD-tested without touching
      real `process`. Color depth honors NO_COLOR/FORCE_COLOR/COLORTERM/TERM/tty; unicode support
      comes from locale precedence (LC_ALL > LC_CTYPE > LANG). 22 caps tests; core stays
      dependency-free (no `ansis`/`log-update`) and exports settled non-interactive caps for
      callback/hosted sinks.
- [x] Add the opt-in display library: `@sdl/clinkr/theme` (semantic tokens, palette ladder,
      glyph + status-line grammar, kv/table; imports `ansis`) and `@sdl/clinkr/stream`
      (in-place pretty sink; imports `log-update`). **Done 2026-06-27 on the current stack.** Theme
      and stream are separate opt-in package subpaths, not re-exported by the core `@sdl/clinkr`
      barrel, with tests for palette/glyph/text/table/status-line behavior and stream sink TTY vs
      non-TTY settling. The stream sink branches on `caps.isTty`: TTY gets a `log-update` live region
      and cursor restore; non-TTY emits a single settled frame and routes per-phase transients through
      `onOutput`/the host live channel without cursor escapes.
- [x] Add machine/human emit for this UX slice: preserve the buffered `--format json` path and add
      human streaming emit. Buffered clinkr emit now passes resolved `Caps` into human renderers while
      preserving `objective list --format json`; flow has a human stream over `@sdl/clinkr/stream` with
      non-TTY `onOutput` routing. **Resolved 2026-06-27:** do not add a `flow submit` JSONL/`--format`
      contract in this Objective. Side-effecting streaming machine output needs a cross-command
      protocol decision, so it is parked as follow-on work.
- [x] Add the import-boundary lint that enforces opt-in display (core / raw / completion / testing
      never import `theme`/`stream`; `ansis`/`log-update` importable only from those subpaths).
      **Done 2026-06-27.** The early `core-import-isolation` canary is now a formal clinkr-owned Vitest
      production source-boundary guard. It scans `src/**`, walks the root / raw / completion / testing
      public entrypoint graphs, forbids relative or package imports of `theme`/`stream` from non-display
      graphs, and enforces `ansis` only under `src/theme/**` plus `log-update` only under `src/stream/**`.
      Tests remain free to use display dependencies as assertion helpers. Targeted validation passed for
      the focused guard test, full clinkr test suite, TS check, format check, and lint.
- [x] Rebuild `objective list` and `flow submit` from scratch on the foundations to match the
      signed-off north star, preserving `--format json` for `objective list`.
      **Done 2026-06-27 on the current stack.** `objective list` renders the house-style human surface
      through `@sdl/clinkr/theme` while the JSON/Markdown paths keep raw machine data. `flow submit`
      and `flow cp` use the clinkr stream sink, route raw submit transcript through the live tail in
      TTY mode, and use settled non-interactive caps for Pi/callback/pipe/test sinks unless a host
      caps hint is supplied. Current PR #2222 further improves submit phase labels and PR-description
      progress/usage reporting. Targeted validation passed for clinkr, objective-list, flow
      phase-stream, submit/cp scenarios, and SDL flow-extension integration; full `just` remains
      closure evidence, not a separate work row.
- [x] Audit all remaining first-party TypeScript CLI surfaces and turn the result into a prioritized
      migration backlog. **Done 2026-06-27.** Inventory lives in `cli-surface-audit.md`; it classifies
      each surface as done, feature-building, mechanical, or exempt. Front-of-queue feature blockers are:
      side-effect workflow/progress, destructive preview/confirmation, actionable shell/navigation
      output, registry/agent-run reporting, and generalized list/detail/report primitives. Hidden
      `exec`/LM payload/full-screen TUI surfaces stay exempt by default.
- [ ] Stabilize reusable side-effect workflow/progress primitives beyond `flow submit`/`flow cp`, then
      migrate the P0 flow/workflow commands called out in `cli-surface-audit.md` (`flow land`,
      `regenerate-pr`, `autobranch`, `autoslot`, `branch-latest-commit`, `push`, `pull-trunk`, plus
      `vibechk run` / `roaster review run` if their runner UX needs the same primitive).
      Precursor (landed): the side-effect house style is consolidated into one normative spec at
      `house-style.md` — the single source of truth that later command ports cite instead of
      re-deriving the style from the four ported renderers; it reconciles the known cross-renderer
      divergences (failure-detail strategy, transcript inline/file/omit, refusal kind, title
      presence, guidance optionality) into rules or explicit discretion calls.
      Semantic update (first audited slice, landed): `flow push` migrated to the house style. The
      first stabilized side-effect primitive — the **git subprocess result/failure block** — lives at
      `ts/packages/capabilities/flow/src/shared/git-result-block.ts` (caps-aware success/failure/refusal
      block on `@sdl/clinkr/theme`; three-tier styling: bold+intent headline, salient `error:`/`fatal:`/
      `rejected` cause lines at normal weight, dimmed plumbing + transcript). Follow-up semantic update:
      `flow pull-trunk` is now the second consumer, using the same buffered finite result block for
      Graphite trunk resolution and git update success/failure, with cause promotion extended only for
      observed pull-trunk needs (`not fast-forward`, `denied`). Live review refined the generalized
      side-effect grammar: successful result blocks stay concise (headline, human guidance, dimmed
      command/cwd evidence), while exit/killed facts and stdout/stderr transcripts are reserved for
      failures/debug evidence. The renderer should still remain
      flow-local for another command before extraction; this second consumer proves the shape is useful
      but not yet broad enough for clinkr/core promotion. `flow push` and `flow pull-trunk` deliberately
      ship **no live phase-stream region** (their buffered subprocess evidence is sufficient); the
      transcript-tail / live-region option for slower git ops is a revealed-but-deferred seam, not built
      here. Follow-up semantic update: `flow branch-latest-commit` migrated to the house style. It
      revealed a complementary finite shape — a **multi-step workflow result block** — because its
      outcome is a domain-authored transaction summary (new branch, moved commit, source reset,
      cleanliness) with no single `ExecResult` to mine. That lives in a new flow-local
      `ts/packages/capabilities/flow/src/shared/workflow-result-block.ts` (success/failure tiers,
      direct-domain-message body per house style §7.1), while the dirty-worktree refusal and snapshot
      probe failure honestly reuse `git-result-block.ts` (they are real git-status guardrails/failures).
      Follow-up landed with `flow autobranch`: the shared `AutobranchFlowResult` (in `@sdl/autobranch`,
      consumed by latest-commit, dirty-worktree, and CCC) now carries a `outcome: "refusal" | "failure"`
      discriminator. Each typed cause is classified next to its `format*Failure` helper
      (`classifyLatestCommit{Preparation,Transaction}Failure`); the eligibility guardrails (pushed-HEAD /
      child-branch / root-/merge-commit) classify as `refusal`. `workflow-result-block.ts` gained a
      first-class `refusal` kind (warn intent, §7.3), and both `flow autobranch` (clean-worktree refusal)
      and `flow branch-latest-commit` (eligibility refusals) now render warn instead of red. The shared
      `flow/src/shared/pending-worktree-result.ts` helper renders snapshot-probe failures for both
      commands. `flow autobranch` keeps its `CommandIo` progress phases for hosted/Pi contexts.
- [ ] Stabilize actionable shell/navigation rendering, then migrate `sdl slot checkout/co/goto`,
      `sdl slot gt up/down`, and `sdl shell show/install`.
- [ ] Stabilize destructive preview/confirmation/result rendering, then migrate slot/brmem/handoff/areg
      mutation surfaces marked P0 in `cli-surface-audit.md`.
- [ ] Stabilize registry/agent-run report cards, then migrate `packagechk NAME`, `packagechk claim-pypi`,
      `packagechk claim-npm`, `vibechk run`, and `roaster review run` as needed.
- [ ] Stabilize generalized buffered list/detail/report primitives, then mechanically migrate the P1
      batches in `cli-surface-audit.md` (list/table, status/check, simple mutation summaries,
      detail/report views, and remaining destructive/preview surfaces).
- [ ] Keep `cli-surface-audit.md` current as migrations land: move surfaces to Done, keep exemptions
      explicit, and avoid adding new human-facing CLI output outside the house-style primitives.

## Parked

- [ ] Themed `--help` output.
- [ ] UI-bridge caps override — the at-most-one optional caps hint on the command seam
      (`CliCommandRunDeps` / `SdlExtensionApi`) so the in-process Pi path can be precise (unicode-rich
      plain frames, region width). Derisked 2026-06-27: promoted from "maybe later" to the seam the
      stream/rebuild rows target; add it when the stream row needs it, not before. Stays a single
      optional field — `SdlExtensionApi` is not otherwise grown.
- [ ] Reconcile the in-place live region against raw subprocess passthrough for streaming
      commands, beyond the faked prototype handling.
- [ ] Define a cross-command streaming machine-output contract (`--format jsonl` or equivalent) for
      side-effecting flow commands, including event schema, stdout/stderr split, transcript policy,
      final envelope, and Pi/onOutput consumption.
