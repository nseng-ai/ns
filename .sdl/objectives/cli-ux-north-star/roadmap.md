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
- [ ] Build clinkr core capability foundation: widen `Caps` to `{ isTty, colorDepth, columns,
  unicode }` and add `resolveCaps()` (reads `process.*`), keeping it dependency-free in core.
- [ ] Add the opt-in display library: `@sdl/clinkr/theme` (semantic tokens, palette ladder,
      glyph + status-line grammar, kv/table; imports `ansis`) and `@sdl/clinkr/stream`
      (in-place pretty sink; imports `log-update`).
- [ ] Add machine/human emit: preserve the buffered `--format json` path and add a streaming
      emit primitive (human frames via `onOutput`, JSONL via `stdout`).
- [ ] Add the import-boundary lint that enforces opt-in display (core / raw / completion / testing
      never import `theme`/`stream`; `ansis`/`log-update` importable only from those subpaths).
- [ ] Rebuild `objective list` and `flow submit` from scratch on the foundations to match the
      signed-off north star, preserving `--format json` for `objective list`.
      Evidence: targeted tests and repo validation (`just`) pass; a core-only consumer pulls no
      display dependencies.

## Parked

- [ ] Roll the house style out to the rest of the CLI surface (slot, other objective commands,
      handoff, brmem, …).
- [ ] Themed `--help` output.
- [ ] UI-bridge caps override — the at-most-one optional `SdlExtensionApi` field — only if/when a
      non-attached host needs it.
- [ ] Reconcile the in-place live region against raw subprocess passthrough for streaming
      commands, beyond the faked prototype handling.
