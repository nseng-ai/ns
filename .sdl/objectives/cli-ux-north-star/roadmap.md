# Roadmap

## Work

- [ ] Build the throwaway steelthread harness (no reusable infra): standalone scratch code
  rendering `objective list` (minimal/gh chrome, rich color) and `flow submit` (append + in-place
  variants, log-tail), with fixtures and capability knobs to force color depth / width / unicode.
- [ ] Dial in the UX north star by feel and get explicit sign-off — chrome, glyph set, palette
  intents, streaming behavior — and decide palette ladder approach A (full ladder) vs B
  (modern-only).
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
