# CLI side-effect house style consolidated into one normative spec

## Summary

Added `house-style.md` — the single normative spec for how `sdl flow` (and peer) side-effect
commands render human-facing results and progress. It is the precursor (PR 0) for the remaining
flow/workflow side-effect migrations (`branch-latest-commit`, `autobranch`, `autoslot`,
`regenerate-pr`, `land`): each later port cites this spec instead of re-deriving the style from the
four already-ported renderers (`flow push`, `flow pull-trunk`, `flow submit`, `flow cp`).

What the spec captures:

- **Foundations** — build only on `@sdl/clinkr/theme` / `@sdl/clinkr/stream`; never hand-roll ANSI;
  caps resolved through `resolveFlowStreamCaps` / `flowStreamDeps`, not `process.*`.
- **Two output shapes + a decision rule** — finite result block (`git-result-block.ts`) for one
  settled outcome vs. streaming phase progress (`phase-stream.ts`) for an ordered multi-step journey.
- **Intent→glyph/color mapping** — the signed-off palette/glyph set mapped onto
  success/failure/refusal and the streaming phase states; the bold + intent-paint + leading-glyph
  headline convention.
- **Finite block** — success stays concise (no transcript/exit/killed on success); three-tier
  failure (bold error headline / normal-weight cause lines / dimmed plumbing + transcript); refusal
  as a first-class warn kind.
- **Streaming surface** — bold title, two-tier `label`/`detail` phase specs, dimmed log-tail,
  in-place TTY only with a settled non-TTY frame, spinner repainting independently of step duration.
- **Caps degradation** — automatic via the theme; the command author's job is to verify it in tests.

## Divergence decisions

The four ported renderers had diverged; the spec reconciles each (§7):

- **Failure-detail strategy** — cause-marker extraction is the normative default for finite
  git/Graphite blocks. LLM interpretation is explicit discretion, allowed only for streaming
  subprocess failures with a large/unstructured transcript (the `gt submit` case), and only with a
  stderr fallback plus a raw-log file. Direct domain message is correct when the failure is already
  a typed string with no transcript.
- **Transcript handling** — omit on success; inline-dimmed on finite failure; file-with-path on
  large streaming failure. The deciding factor is transcript size/structure, not command identity.
- **Refusal kind** — first-class (warn intent), distinct from failure (error intent); a declined
  guardrail is never rendered as a red failure.
- **Title presence** — streaming surfaces carry a bold title; finite blocks do not (the headline is
  the title).
- **Guidance line** — optional, normal weight; include when genuinely useful, omit rather than
  restating the headline.

## Objective impact

- `objective.md` and `roadmap.md` now link `house-style.md`; it **consolidates** (does not
  supersede) the by-feel sign-offs (`glyph-set-signoff`, `ladder-a-and-list-refinements`,
  `streaming-cadence`, `streaming-default-inplace`, `flow-submit-failure-tiers`,
  `flow-pull-trunk-result-block`).
- `cli-surface-audit.md` records the spec as the cited source for the remaining P0 flow side-effect
  ports; no surface status changed (this slice is doc-only).
- Non-behavioral comment pointers added from the two reference renderers (`git-result-block.ts`,
  `phase-stream.ts`) to the spec. No runtime behavior changes; existing tests unaffected.

## Follow-ups

- PR 1 (`flow branch-latest-commit`) is the first command to port citing this spec alone.
- The user's standing decision is **no cross-package renderer extraction in this plan**; if
  duplication appears, prefer small flow-local/CCC-local helpers and record any broader extraction
  as parked future work.
