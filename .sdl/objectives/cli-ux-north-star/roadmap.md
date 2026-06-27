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
      supportsUnicode }` and add `resolveCaps()` (pure snapshot resolver plus process reader), keeping
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
- [~] Add machine/human emit: preserve the buffered `--format json` path and add a streaming
      emit primitive (human frames via `onOutput`, JSONL via `stdout`). Buffered clinkr emit now passes
      resolved `Caps` into human renderers while preserving `objective list --format json`; flow has a
      human stream over `@sdl/clinkr/stream` with non-TTY `onOutput` routing. The remaining semantic
      decision is the streaming machine contract: `flow submit` still explicitly has no `--format` /
      JSONL path, so decide whether this Objective still requires JSONL streaming or should narrow
      this row before closure.
- [~] Add the import-boundary lint that enforces opt-in display (core / raw / completion / testing
      never import `theme`/`stream`; `ansis`/`log-update` importable only from those subpaths).
      An early `core-import-isolation` canary test now walks the core import graph and proves it does
      not import `ansis` or `log-update`; it is useful but narrower than the promised boundary lint
      because it does not yet cover raw/completion/testing import paths or general forbidden subpath
      imports, and the formal lint/guard location remains open.
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
