# CLI UX North Star

## Thesis

SDL's human-facing CLI output should feel as crafted and pleasant as the best-in-class
CLIs (gh, gt, and the JS/TS analogs of the Charm ecosystem) without compromising its
agent-first nature. Because clinkr already separates human from machine output
(`human | json | markdown`, with `canEmitAnsi`), the human surface is free to be richly
styled while agents read `--format json` — decoration has a clean machine escape hatch.

We did not theorize the house style into existence. We first **throwaway-steelthreaded
two representative commands with no reusable infra** — `objective list` (buffered list) and
`flow submit` (streaming) — to dial in the UX north star *by feel* in a real terminal, then
rebuilt the representative surfaces on proper clinkr foundations. The Objective's active phase is now
the audited rollout: stabilize the missing reusable display primitives first, then migrate the remaining
human-facing CLI surfaces mechanically by shape.

## Scope

- **Throwaway steelthread (no shared infra).** A standalone scratch harness rendering both
  commands against fixtures, with capability knobs to *force* color depth / width / unicode,
  so the palette ladder can be felt rather than guessed.
- **Decide the palette ladder approach by feel:** A = full capability ladder
  (truecolor → 256 → 16 → mono → ascii) vs B = modern-only (truecolor/256 → straight to mono).
- **The house visual language** (signed off/settled by feel): minimal/gh chrome for list/tabular
  surfaces; richness budget spent on color + motion, not boxes; glyph set `✓ ● ✗ – •` with the
  glyph colored and text default; semantic palette (success green / warn yellow / error red /
  accent cyan / muted dim); in-place-only streaming for TTYs, with a settled non-TTY frame;
  `log-tail` of the latest subprocess line during streaming phases.
- **The real clinkr foundations:** widen `Caps` (`{ isTty, colorDepth, columns,
  canRenderUnicode }`) and add `resolveCaps()` in clinkr **core**; opt-in
  `@sdl/clinkr/theme` (ansis) and `@sdl/clinkr/stream` (log-update) **subpaths**; buffered
  machine/human emit plus human streaming emit; and import-boundary lint/guardrails that keep display
  strictly opt-in. Process caps are used only for the real stdout path; hosted/callback/pipe/test and
  in-process host sinks get settled or host-supplied caps through the clinkr IO / host-extension
  seam, not independent `process.*` sniffing.
- **Rebuild** `objective list` and `flow submit` for real on those foundations to match the
  signed-off north star, preserving machine mode for `objective list`.
- **Audit and roll out** the house style across the remaining human-facing CLI surfaces. The inventory
  lives in `cli-surface-audit.md`; feature-building migrations lead, and hidden `exec`/LM payload/full-screen
  TUI surfaces are exempt by default unless they grow a real human-facing mode.

## Non-Goals

- Styling hidden `exec`/skill primitives, JSON/Markdown payload readers, or agent-only evidence streams
  just for cosmetics. Keep machine/agent surfaces machine-first unless they also have a durable human-facing
  mode.
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
  subpaths; buffered machine/human emit and human streaming emit; import-boundary lint enforcing
  that core / raw / completion / testing never import the display layer.
- `objective list` and `flow submit` rebuilt on the foundations and matching the north star,
  with `--format json` machine mode preserved for `objective list`.
- `cli-surface-audit.md` stays current and covers every first-party TypeScript CLI surface, with each
  surface marked done, feature-building, mechanical, or exempt.
- The feature-building front of the migration backlog is complete: side-effect workflow/progress,
  destructive preview/confirmation, actionable shell/navigation output, registry/agent-run reporting,
  and generalized list/detail/report primitives are stable enough that remaining migrations are mechanical.
- Every non-exempt human-facing CLI surface in `cli-surface-audit.md` is either migrated to the house
  style or explicitly deferred with rationale.
- Evidence: targeted tests and relevant repo checks (`just`) pass; the opt-in property is
  verified — a core-only consumer pulls in none of the display dependencies.

## Assumptions and Risks

**Assumptions**

- The human/machine split lets human output be richly styled without harming agents, because
  agents read `--format json`. The representative `objective list` rebuild preserved that machine
  path in the objective package while using the clinkr theme only for human rendering.
- Caps resolved from `process.*` are correct only for the common attached-terminal case; hosted,
  callback, Pi, pipe, test, redirected, and in-process host sinks must receive settled or
  host-supplied caps through the clinkr IO / host-extension seam.
- Most users run modern terminals, but the chosen ladder A means 16-color / mono / ASCII degradation
  remains intentionally supported as part of the real renderer contract.
- `ansis` (truecolor/hex) and `log-update` (in-place) are the right libraries; latitude to
  experiment was explicitly granted.

**Risks**

- In-place streaming owns the cursor and can fight raw subprocess (`gt submit`) passthrough.
  The representative `flow submit` rebuild de-risked this by routing the TTY transcript through the
  live-region tail (`stream.note`) so `log-update` remains the sole writer, and by routing non-TTY
  output through the context / `onOutput` path; broader rollout should preserve that invariant.
- The full capability ladder (A) is more machinery, but that risk was accepted by feel and covered
  by caps-aware tests over the real ladder primitives rather than only the throwaway harness.
- Degradation correctness (mono / no-unicode / non-TTY / narrow width) is where rich CLIs break;
  it remains a regression risk for future rollout even though the representative surfaces now have
  focused coverage.
- The audited rollout can still become open-ended if every command invents bespoke presentation. Mitigate by
  doing feature-building migrations first, freezing reusable renderer shapes, and then batching the remaining
  surfaces mechanically by shape.
- Keeping `SdlExtensionApi` narrow while delivering caps through clinkr was de-risked with the
  existing generic `extensions` seam (`sdl.clinkr.caps`), avoiding a dedicated new caps field;
  the broader streaming machine-output contract is explicitly parked as a follow-on instead of being
  rushed into this UX Objective.

## Open Questions

- Approach A (full ladder) vs B (modern-only) — **decided by feel (2026-06-27): A, the full
  ladder.** Accepts the extra degradation machinery as worth it for the look across rungs.
- The branded accent color value — **decided by feel (2026-06-27): cyan `#22d3ee`** (chosen from a
  candidate gallery of sky/cyan/teal/blue/indigo/violet/magenta). Semantic intents also set:
  success `#3fb950` / warn `#d29922` / error `#f85149` / muted `#8b949e` (GitHub-derived).
- Whether `objective list` becomes a full sdl-sdk extension now or keeps a clinkr-shaped data
  path at rebuild — **decided by implementation (2026-06-27): keep the objective CLI's
  clinkr-shaped data path for now**, preserving `--format json` while adding the pretty human
  renderer.
- The exact widened `Caps` shape — **decided by implementation (2026-06-27):** `{ isTty,
  colorDepth, columns, canRenderUnicode }`.
- What the durable streaming machine-output contract should be (for example JSONL on stdout) now that
  `flow submit` has a polished human stream but still explicitly has no `--format` path — **decided
  for this Objective (2026-06-27): park it as a follow-on.** `flow submit` is a side-effecting human
  streaming command here; defining a cross-command JSONL/event protocol is outside this north-star UX
  slice.
- Whether the early core import-isolation canary should become a formal repo-wide lint rule, and what
  command owns that enforcement.
