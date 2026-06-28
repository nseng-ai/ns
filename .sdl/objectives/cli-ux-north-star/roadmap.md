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
- [x] Add the opt-in display library: originally `@sdl/clinkr/theme`, now extracted to
      `@sdl/cli-theme` (semantic tokens, palette ladder, glyph + status-line grammar, kv/table), plus
      `@sdl/clinkr/stream` (in-place pretty sink; imports `log-update`). **Done 2026-06-27 on the
      current stack; package extraction landed later under `sdl-cli-theme-extraction`.** Theme and stream
      are separate opt-in surfaces, and theme is no longer re-exported by `@sdl/clinkr`, with tests for
      palette/glyph/text/table/status-line behavior and stream sink TTY vs non-TTY settling. The stream
      sink branches on `caps.isTty`: TTY gets a `log-update` live region and cursor restore; non-TTY
      emits a single settled frame and routes per-phase transients through `onOutput`/the host live
      channel without cursor escapes.
- [x] Add machine/human emit for this UX slice: preserve the buffered `--format json` path and add
      human streaming emit. Buffered clinkr emit now passes resolved `Caps` into human renderers while
      preserving `objective list --format json`; flow has a human stream over `@sdl/clinkr/stream` with
      non-TTY `onOutput` routing. **Resolved 2026-06-27:** do not add a `flow submit` JSONL/`--format`
      contract in this Objective. Side-effecting streaming machine output needs a cross-command
      protocol decision, so it is parked as follow-on work.
- [x] Add the import-boundary lint that enforces opt-in display (core / raw / completion / testing
      never import display packages/subpaths; Clinkr production source must not import `@sdl/cli-theme`,
      and `log-update` is importable only from `src/stream/**`). **Done 2026-06-27, updated with the
      theme package extraction.** The `core-import-isolation` guard scans `src/**`, walks the root / raw /
      completion / testing public entrypoint graphs, forbids package imports of `@sdl/cli-theme` or
      `@sdl/clinkr/stream` from non-display graphs, and enforces `log-update` only under `src/stream/**`.
      Tests remain free to use display dependencies as assertion helpers. Targeted validation passed for
      the focused guard test, full clinkr test suite, TS check, format check, and lint.
- [x] Rebuild `objective list` and `flow submit` from scratch on the foundations to match the
      signed-off north star, preserving `--format json` for `objective list`.
      **Done 2026-06-27 on the current stack.** `objective list` renders the house-style human surface
      through `@sdl/cli-theme` while the JSON/Markdown paths keep raw machine data. `flow submit`
      and `flow cp` use the clinkr stream sink, route raw submit transcript through the live tail in
      TTY mode, and use settled non-interactive caps for Pi/callback/pipe/test sinks unless a host
      caps hint is supplied. Current PR #2222 further improves submit phase labels and PR-description
      progress/usage reporting. Targeted validation passed for clinkr, objective-list, flow
      phase-stream, submit/cp scenarios, and SDL flow-extension integration; full `just` remains
      closure evidence, not a separate work row.
- [x] Audit all remaining first-party TypeScript CLI surfaces and turn the result into a prioritized
      migration backlog. **Done 2026-06-27; scoped 2026-06-28 to extension-ported command faces only.**
      Inventory lives in `cli-surface-audit.md`; it classifies each surface as done, eligible
      feature-building/mechanical, exempt, or extension-gated until the SDL extension architecture ports
      the command face. Front-of-queue eligible blockers are: side-effect workflow/progress, destructive
      preview/confirmation, actionable shell/navigation output, and generalized list/detail/report
      primitives. Registry/agent-run and other standalone/unported surfaces are no longer active UX
      migration targets in this Objective; re-evaluate them when their command surfaces port. Hidden
      `exec`/LM payload/full-screen TUI surfaces stay exempt by default.
- [ ] Stabilize reusable side-effect workflow/progress primitives beyond `flow submit`/`flow cp`, then
      migrate the eligible P0 flow/workflow commands called out in `cli-surface-audit.md` (`flow land`,
      `regenerate-pr`, `autobranch`, `autoslot`, `branch-latest-commit`, `push`, `pull-trunk`).
      Standalone/unported runner commands such as `vibechk run` / `roaster review run` are now
      extension-gated until a later eligibility pass marks them ported.
      Precursor (landed): the side-effect house style is consolidated into one normative spec at
      `house-style.md` — the single source of truth that later command ports cite instead of
      re-deriving the style from the four ported renderers; it reconciles the known cross-renderer
      divergences (failure-detail strategy, transcript inline/file/omit, refusal kind, title
      presence, guidance optionality) into rules or explicit discretion calls.
      Semantic update (first audited slice, landed): `flow push` migrated to the house style. The
      first stabilized side-effect primitive — the **git subprocess result/failure block** — lives at
      `ts/packages/capabilities/flow/src/shared/git-result-block.ts` (caps-aware success/failure/refusal
      block on `@sdl/cli-theme`; three-tier styling: bold+intent headline, salient `error:`/`fatal:`/
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
      Follow-up landed with `flow autoslot`: unlike the flow-local commands above, autoslot's
      autobranch + slot-checkout orchestration lives in CCC and reports through `CommandIo.notify`, so
      presentation landed **CCC-local** (`ts/packages/ccc/src/autoslot-presentation.ts`, the CCC twin of
      `workflow-result-block.ts`) next to where the outcome facts are computed — flow capability
      renderers can't be imported downward into CCC, and the plan forbids cross-package extraction. The
      flow wrapper resolves caps via `resolveFlowStreamCaps` and threads them into `runAutoslotCli`. The
      four durable outcomes (slot move; branch-created-but-skipped on a dirty post-autobranch worktree;
      slot checkout failed; autobranch failure/refusal) render success/warn/error; the PR-2 `outcome`
      discriminator makes a declined autobranch guardrail render warn (still exit 1 via the `error`
      notify level — intent lives in the rendered block, the level owns routing/exit), and the
      `sdl slot co <branch>` navigation line stays copyable at normal weight. CCC `CommandIo` semantics
      (transient `phase`, durable `notify`, error flips exit) are unchanged. The general
      navigation/shell renderer row below is untouched.
      Follow-up landed with `flow regenerate-pr`: a flow-local finite command (no CCC, no streaming)
      that reuses `workflow-result-block.ts` for its single settled outcome. Success renders concise
      (PR number/url, new title, prompt source); the two confirmation guardrails — declined and
      missing-confirmation-channel — render as first-class warn refusals (§7.3), never red, and never
      run `gh pr edit`; PR lookup/diff/prompt/generation failures and the post-confirmation edit
      failure render as failures with the domain cause visible (the domain string's leading summary
      becomes the bold headline, the rest the body — §7.1 direct-domain-message). The `ctx.confirm`
      body stays plain prose (confirmation surfaces are not guaranteed to render ANSI and the prompt is
      not a machine contract). GitHub write safety is unchanged: confirmation is still required,
      `--force` is still a compatibility no-op that does not bypass it, and human-authored body text
      outside the SDL-managed region is preserved. Next: `flow land` (PR 5a discovery/seams, 5b full
      redesign) is the last and largest flow side-effect surface.
      Follow-up landed with `flow land` PR 5a (seam/discovery complete; final redesign next): the full
      user-visible land state inventory is recorded (see
      `updates/2026-06-27-flow-land-seam-discovery.md`) and the CCC-local CLI-edge house-style renderer
      is isolated at `ts/packages/ccc/src/land-stack/land-presentation.ts` (the land twin of
      `autoslot-presentation.ts`) with unit coverage, without rerouting live land output. Key
      discovery vs. autoslot: `land` is dual-surface (Pi slash-command command-stream renderer AND the
      SDL CLI) and both share the plain-string formatters in `land-stack/presentation.ts`, so
      house-style ANSI must be confined to the CLI edge (`runLandCli`) and must NOT leak into Pi's
      `notify`/command-stream path. PR 5b threads resolved `caps` (`resolveFlowStreamCaps` →
      `LandCliInput`) to that edge and routes the inventoried states through the renderer while
      preserving all safety semantics (confirmation gates, `--yes`/`--force`/dry-run, partial-success
      and recovery guidance, post-landing `--free` cleanup, no hidden auto-merge) and the untouched Pi
      surface. `flow land` is NOT marked Done until PR 5b.
      Follow-up landed with `flow land` PR 5b (**this completes the flow side-effect migration stack** —
      `push`, `pull-trunk`, `submit`, `cp`, `branch-latest-commit`, `autobranch`, `autoslot`,
      `regenerate-pr`, and now `land` are all house-style): the CLI edge wires a CLI-only
      `renderResultBlock` hook on the land context and threads resolved `caps` via `LandCliInput.caps`;
      every settled land state renders through `renderLandResultBlock` (bold intent-painted glyph
      headline + normal-weight body) on the right stdout/stderr stream. A typed
      `LandStackFailure.outcome` discriminator carries the refusal/failure split so declined guardrails
      render warn (never red, §7.3) while keeping their `error` level and exit 1. The Pi command-stream
      path stays ANSI-free (the hook is wired only on the CLI context), and streaming progress remains
      the plain `CommandIo` ✓/✗/→ fallback. Semantic update:
      `updates/2026-06-27-flow-land-ux-redesign.md`. Follow-up remediation promoted the now-proven
      generic finite result-block layout into `@sdl/cli-theme` (`renderResultBlock` plus
      `resultBlockHeadline`) after the repeated-shape precondition fired across Flow and CCC; git
      transcript rendering remains flow-local around the shared headline helper. Still parked:
      colorizing the CLI streaming progress lines. `flow land` is now Done.
- [x] Stabilize actionable shell/navigation rendering, then migrate currently eligible Slot command-face
      surfaces: `sdl slot checkout/co/goto` and `sdl slot gt up/down`. Re-evaluate shell-wrapper commands
      only if/when they gain an SDL extension / Capability command face.
      **Done 2026-06-28.** The `sdl slot goto` pilot's Slot-local navigation presentation helper now
      covers `checkout`, `co`, `gt up`, and `gt down`: all human success output routes through
      `renderSlotNavigationSuccess`, keeps the generated `cd ...` command bare/unstyled/copyable, and
      preserves clipboard copied/failure/skipped guidance plus JSON and Shell Directive behavior. Scenario
      coverage verifies checkout/co alias rendering, `--current` redirect details, already-assigned
      headlines, GT existing-slot/new-checkout/main-worktree/no-clipboard variants, negative exits, and
      old boolean-name regressions; renderer unit coverage verifies unicode/ascii degradation and
      copyability. The helper fits the repeated Slot consumers without awkward command-specific hacks, so
      it is stable for this row; shared clinkr/theme navigation extraction remains deferred until broader
      non-Slot consumers appear. Semantic update:
      `updates/2026-06-28T180147Z-slot-navigation-migration-complete.md`.
- [x] Stabilize destructive preview/confirmation/result rendering, then migrate eligible Slot and Handoff
      mutation surfaces marked P0 in `cli-surface-audit.md`. Keep brmem/areg and other standalone or
      unported destructive surfaces extension-gated until they port.
      Semantic update (pilot in progress): `sdl slot free` now has the first Slot-local destructive
      result-block wrapper over the shared `@sdl/cli-theme` finite result block, covering dry-run,
      success, cancellation/refusal, and cleanup-error outcomes while preserving machine/JSON behavior.
      This starts but does not complete the row; next prove the same grammar on adjacent Slot destructive
      surfaces before considering shared extraction or Handoff migration. Follow-up semantic update:
      `sdl slot gc` is now the second Slot destructive consumer, covering dry-run, interactive
      pre-confirmation preview, cancellation/refusal, success/no-op, and cleanup-error outcomes through
      the same Slot-local result-block helper while preserving JSON/mutation/confirmation contracts.
      Follow-up semantic update: `sdl slot gt free-stack` and `sdl slot resize` are now the third and
      fourth Slot destructive consumers. `free-stack` migrated its no-op/freed-stack human results;
      `resize` migrated conservatively for current successful/no-op grow/shrink outcomes while preserving
      existing JSON/mutation semantics and deliberately not adding dry-run/force/confirmation behavior.
      Follow-up semantic update: `sdl handoff delete` and `sdl handoff gc` now render human destructive
      success, refusal/cancellation, dry-run/no-op, and error summaries through a Handoff-local
      destructive result-block helper while preserving JSON/mutation/authorization semantics. Slot and
      Handoff P0 destructive feature-building surfaces are complete unless resize authorization semantics
      are explicitly reopened; shared destructive extraction remains deferred because the duplicated
      wrapper is still intentionally thin and capability-local. Next Objective step: generalized
      list/detail/report primitives after an eligibility recheck. Updates:
      `updates/2026-06-28T000001Z-slot-gc-destructive-result-block.md`,
      `updates/2026-06-28T121500Z-slot-free-stack-resize-destructive-rendering.md`,
      `updates/2026-06-28T192520Z-handoff-destructive-result-blocks.md`.
- [ ] Re-evaluate extension eligibility at each rollout boundary and after material SDL extension-architecture
      milestones. If registry/agent-run commands (`packagechk`, `vibechk`, `roaster`, etc.) later port to
      an SDL extension / Capability command face, classify them in `cli-surface-audit.md` before deciding
      whether this Objective or a follow-on owns their UX migration.
- [x] Stabilize generalized buffered list/detail/report primitives, then mechanically migrate the eligible
      P1 batches in `cli-surface-audit.md` (Objective, Flow, Slot, Handoff, and any newly ported command
      faces), leaving extension-gated surfaces for later re-evaluation.
      Semantic update (pilot in progress): after the P0 destructive boundary, the active P1 eligibility
      set remains the Objective/Flow/Slot/Handoff surfaces already listed in `cli-surface-audit.md`;
      no newly ported command faces were added in this slice. `sdl handoff list` is the first buffered
      report pilot: its human output now uses `@sdl/cli-theme` `renderTable` instead of
      `@sdl/core/text-table`, while JSON and Markdown contracts stay unchanged. Existing table
      primitives were sufficient for title + table + empty-state output, so a new generalized report
      wrapper remains deferred until another P1 surface proves repeated title/empty/footer plumbing.
      Follow-up semantic update: `sdl slot list` / `sdl slot ls` is now the second buffered table pilot,
      using direct `@sdl/cli-theme renderTable` with a `Slots for <repo>` title, accent slot names,
      success/muted status styling, unchanged empty-pool wording, and unchanged JSON/schema/alias
      contracts. The repeated title/table/empty glue is still thin enough that a generalized report wrapper
      remains deferred. Follow-up semantic update: `sdl flow changes` is now the next buffered report pilot:
      clean output stays minimal, dirty output uses a direct title + `Summary` + `Files` section renderer,
      raw porcelain lines and the 50-line cap are preserved, and report-wrapper extraction remains deferred
      because the command-local sectioning is still small. Final tail semantic update: `sdl objective check`,
      `sdl objective archive`, `sdl slot claim`, `sdl slot init`, and `sdl slot foreach` now cover status/check
      reports, status-aware action summaries, creation summaries, and multi-slot tables through direct
      `@sdl/cli-theme` usage. No new generalized wrapper was extracted. Semantic updates:
      `updates/2026-06-28T193257Z-handoff-list-buffered-pilot.md`,
      `updates/2026-06-28T194258Z-slot-list-buffered-table.md`,
      `updates/2026-06-28T195329Z-flow-changes-buffered-report.md`,
      `updates/2026-06-28T211200Z-objective-slot-tail-buffered-migration.md`.
- [x] Keep `cli-surface-audit.md` current as migrations and extension-architecture ports land: move eligible
      surfaces to Done, keep exemptions explicit, mark unported surfaces extension-gated, and avoid adding
      new human-facing CLI output outside the house-style primitives.

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
- [ ] House-style migration for standalone tools or unported capabilities (`packagechk`, `vibechk`,
      `roaster`, `areg`, `brmem`, `sdl shell`, and similar) is parked until the SDL extension architecture
      gives the relevant surface an extension / Capability command face and a fresh audit marks it eligible.
