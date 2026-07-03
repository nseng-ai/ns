# Throwaway steelthread harness built

## Summary

Built the disposable UX steelthread harness at `ts/scratch/cli-northstar/` (caps.ts, theme.ts,
fixtures.ts, render.ts, main.ts, README.md). It renders the two representative surfaces against
fixtures with hand-rolled ANSI and no `@sdl/clinkr` imports, so every rung of the palette ladder
can be forced rather than guessed:

- `objective-list` — buffered, minimal/gh chrome: glyph-colored status, dim timestamps, `(x)`
  outstanding-changes marker, branch tree sub-rows. Fixtures mirror `ObjectiveListRecord`.
- `flow-submit` — streaming, two variants: `append` mirrors today's `•`-marker phase stream;
  `inplace` is the proposed live region with per-phase `✓`/spinner and a one-line **log-tail** of
  the latest `gt submit` subprocess line. Fixtures mirror the real submit phase sequence; `--fail`
  renders the failure transcript path.
- `matrix` — stacks the buffered list across every rung for side-by-side feel.

Capability knobs implemented: `--color truecolor|256|16|mono`, `--width`, `--ascii` (full ascii
glyph/spinner/ellipsis degradation), and the decision knob `--ladder a|b`. Approach **A** paints a
16-color rung at `--color 16`; approach **B** collapses 16 → mono. Non-tty / `--static` settles the
in-place variant to a single final frame.

Placement keeps it truly throwaway: `ts/scratch/` is not a workspace package and is outside the
tsconfig typecheck include. Verified the gates that *do* scan it pass — oxlint, the TS-style guard,
and dprint (README). Ran all commands end-to-end (objective-list across mono/ascii/narrow,
ladder A vs B at `--color 16`, flow-submit append/inplace/fail, matrix); invalid flags exit 2.

## Objective Impact

- Roadmap Work row 1 (build the throwaway harness) is complete.
- De-risks the central Open Question instrument: A-vs-B and degradation correctness are now
  feelable in a real terminal instead of theorized.
- Palette intent values and the branded accent are placeholders embedded in `theme.ts`, ready to
  be dialed in during sign-off.
- No reusable infrastructure was introduced and `SdlExtensionApi`/clinkr core were untouched,
  consistent with the "no shared infra before sign-off" thesis.

## Follow-Ups

- Next step (roadmap row 2) needs the user: run the harness in a real terminal, dial in the north
  star by feel (chrome, glyph set, palette intents, streaming behavior), pick the branded accent,
  and decide ladder approach **A vs B**. This is a human sign-off, not self-certifiable.
- Once signed off, the clinkr-foundations rows (widened `Caps` + `resolveCaps()`, opt-in
  `theme`/`stream` subpaths, machine/human emit, import-boundary lint) and the real rebuild can
  proceed; the harness is then deleted.
