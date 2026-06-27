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
      Ladder decided by feel: **A (full ladder)** (2026-06-27). Still open for full sign-off:
      chrome, glyph set, palette intents, streaming behavior. Refinements so far — `objective list`
      renders human-relative times ("2 days ago") not raw ISO; the outstanding-changes marker is a
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
  unicode }` and add `resolveCaps()` (reads `process.*`), keeping it dependency-free in core.
      **Done 2026-06-27.** Landed `packages/infra/clinkr/src/caps.ts`: pure `resolveCaps(snapshot)`
      over an injected `CapsEnv`, with the impure `readProcessCapsEnv()` reader and a
      `resolveProcessCaps()` composer split out so the decision logic is TDD-tested without touching
      real `process`. Color depth honors NO_COLOR/FORCE_COLOR/COLORTERM/TERM/tty; unicode from locale
      precedence (LC_ALL > LC_CTYPE > LANG). 22 caps tests; core stays dependency-free (no
      `ansis`/`log-update`). Exported from the clinkr root.
- [ ] Add the opt-in display library: `@sdl/clinkr/theme` (semantic tokens, palette ladder,
      glyph + status-line grammar, kv/table; imports `ansis`) and `@sdl/clinkr/stream`
      (in-place pretty sink; imports `log-update`). **Pi-host constraint (derisked 2026-06-27):**
      the `stream` sink branches on `caps.isTty` — it runs `log-update` in-place only when there is
      a cursor to own, and otherwise degrades to the settled frame, routing per-phase lines through
      `onOutput`/`phaseTransient` (the path Pi's append-only widget already consumes). Never animate
      into a callback/redirected sink.
- [ ] Add machine/human emit: preserve the buffered `--format json` path and add a streaming
      emit primitive (human frames via `onOutput`, JSONL via `stdout`).
- [ ] Add the import-boundary lint that enforces opt-in display (core / raw / completion / testing
      never import `theme`/`stream`; `ansis`/`log-update` importable only from those subpaths).
- [ ] Rebuild `objective list` and `flow submit` from scratch on the foundations to match the
      signed-off north star, preserving `--format json` for `objective list`.
      **Caps wiring rule (derisked 2026-06-27):** the CLI entry resolves caps through the IO
      override seam — a callback/redirected sink (Pi in-process, pipe, test) defaults to settled
      non-interactive caps `{ isTty: false, colorDepth: "none", columns: DEFAULT_COLUMNS,
      unicode: true }`; `resolveProcessCaps()` is used only for the real `process.stdout`. Do not
      sniff `process.*` independently — in the in-process Pi path it describes Pi's host terminal,
      not the rendering region.
      Evidence: targeted tests and repo validation (`just`) pass; a core-only consumer pulls no
      display dependencies; the Pi in-process path renders the settled (non-ANSI) frame.

## Parked

- [ ] Roll the house style out to the rest of the CLI surface (slot, other objective commands,
      handoff, brmem, …).
- [ ] Themed `--help` output.
- [ ] UI-bridge caps override — the at-most-one optional caps hint on the command seam
      (`CliCommandRunDeps` / `SdlExtensionApi`) so the in-process Pi path can be precise (unicode-rich
      plain frames, region width). Derisked 2026-06-27: promoted from "maybe later" to the seam the
      stream/rebuild rows target; add it when the stream row needs it, not before. Stays a single
      optional field — `SdlExtensionApi` is not otherwise grown.
- [ ] Reconcile the in-place live region against raw subprocess passthrough for streaming
      commands, beyond the faked prototype handling.
