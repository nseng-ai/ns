# CLI UX North Star

## Thesis

SDL's human-facing CLI output should feel as crafted and pleasant as the best-in-class
CLIs (gh, gt, and the JS/TS analogs of the Charm ecosystem) without compromising its
agent-first nature. Because clinkr already separates human from machine output
(`human | json | markdown`, with `canEmitAnsi`), the human surface is free to be richly
styled while agents read `--format json` — decoration has a clean machine escape hatch.

We will not theorize the house style into existence. We will first **throwaway-steelthread
two representative commands with no reusable infra** — `objective list` (buffered list) and
`flow submit` (streaming) — purely to dial in the UX north star *by feel* in a real terminal.
Only once that north star is signed off will we **rebuild both commands from scratch on proper
clinkr foundations** (an opt-in display library). Rolling the house style out to the rest of
the system is the explicit follow-on, not part of this Objective.

## Scope

- **Throwaway steelthread (no shared infra).** A standalone scratch harness rendering both
  commands against fixtures, with capability knobs to *force* color depth / width / unicode,
  so the palette ladder can be felt rather than guessed.
- **Decide the palette ladder approach by feel:** A = full capability ladder
  (truecolor → 256 → 16 → mono → ascii) vs B = modern-only (truecolor/256 → straight to mono).
- **The house visual language** (already largely settled): minimal/gh chrome for list/tabular
  surfaces; richness budget spent on color + motion, not boxes; glyph set `✓ ● ✗ – •` with the
  glyph colored and text default; semantic palette (success green / warn yellow / error red /
  accent cyan / muted dim); both append-only and in-place streaming variants; `log-tail` of the
  latest subprocess line during streaming phases.
- **The real clinkr foundations:** widen `Caps` (`{ isTty, colorDepth, columns, unicode }`) and
  add `resolveCaps()` in clinkr **core**; opt-in `@sdl/clinkr/theme` (ansis) and
  `@sdl/clinkr/stream` (log-update) **subpaths**; buffered + streaming machine/human emit;
  an import-boundary lint that keeps display strictly opt-in. `SdlExtensionApi` stays frozen
  (caps from `process.*`; UI-bridge override deferred to at most one optional field).
- **Rebuild** `objective list` and `flow submit` for real on those foundations to match the
  signed-off north star, preserving machine mode for `objective list`.

## Non-Goals

- System-wide rollout to the rest of the CLI surface (parked follow-on).
- Full TUI / alt-screen apps (Ink / opentui). This is traditional CLI primitives — lists,
  live progress — not a full-screen TUI.
- Growing `SdlExtensionApi` beyond, at most, a single deferred optional caps field.
- Themed `--help`, branded gradients/figlet, or bordered tables as the list default
  (explicitly rejected — lists stay restrained).
- Reconciling raw `gt` subprocess passthrough against the in-place live region inside the
  throwaway prototype (faked there; handled for real at rebuild).

## Completion Criteria

- Both throwaway steelthread prototypes exist and the user signs off on a single north-star
  UX (chrome, glyph set, palette intents, streaming behavior) **and** a decision between
  ladder approach A vs B.
- clinkr foundations built: `Caps` + `resolveCaps()` in core; opt-in `theme` + `stream`
  subpaths; buffered + streaming emit; import-boundary lint enforcing that core / raw /
  completion / testing never import the display layer.
- `objective list` and `flow submit` rebuilt on the foundations and matching the north star,
  with `--format json` machine mode preserved for `objective list`.
- Evidence: targeted tests and relevant repo checks (`just`) pass; the opt-in property is
  verified — a core-only consumer pulls in none of the display dependencies.

## Assumptions and Risks

**Assumptions**

- The human/machine split lets human output be richly styled without harming agents, because
  agents read `--format json`. If `objective list` migrates to an sdl-sdk extension, machine
  mode must be preserved via core emit + a self-declared `--format` flag — an assumption to
  validate at rebuild, since the extension surface today has neither caps nor a format path.
- caps resolved from `process.*` is correct for the common attached-terminal case; non-attached
  UI-bridge hosts are the only exception and are deferred.
- Most users run modern terminals (this is what makes approach B plausibly sufficient).
- `ansis` (truecolor/hex) and `log-update` (in-place) are the right libraries; latitude to
  experiment was explicitly granted.

**Risks**

- In-place streaming owns the cursor and fights raw subprocess (`gt submit`) passthrough.
  The `log-tail` choice mitigates it, but the real reconciliation is deferred to rebuild and
  could prove awkward. **Not yet de-risked.**
- The full capability ladder (A) is more machinery; risk of over-engineering if B suffices.
  The prototype is the de-risking instrument for exactly this call.
- Degradation correctness (mono / no-unicode / non-TTY / narrow width) is where rich CLIs
  break; it must be felt, not assumed — hence the capability knobs.
- "Apply to the rest of the system" can pull the open-ended rollout into this Objective;
  mitigated by parking rollout under the roadmap.
- Keeping `SdlExtensionApi` frozen while delivering caps + machine mode through clinkr is an
  architectural bet; it could force the deferred optional caps field sooner than hoped.

## Open Questions

- Approach A (full ladder) vs B (modern-only) — to be decided by feel from the prototypes.
- The branded accent color value (dialed in the harness).
- Whether `objective list` becomes a full sdl-sdk extension now or keeps a clinkr-shaped data
  path at rebuild — this determines how machine mode is preserved.
- The exact widened `Caps` shape — confirm fields (`isTty`, `colorDepth`, `columns`, `unicode`)
  at rebuild.
