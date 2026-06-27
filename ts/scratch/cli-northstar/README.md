# cli-northstar — throwaway UX steelthread harness

Disposable scratch code for the **cli-ux-north-star** Objective. Its only job is to dial in
the CLI UX north star **by feel** in a real terminal, before any reusable infrastructure
exists. It is deliberately:

- **Throwaway** — not a workspace package, not in the typecheck graph, no tests. It will be
  deleted once the north star is signed off and the real clinkr foundations are built.
- **Infra-free** — no `@sdl/clinkr` imports. ANSI escapes, the palette ladder, the glyph
  set, the spinner, and the in-place live region are all hand-rolled here so every rung of
  the ladder can be **forced** precisely. The real rebuild will use `ansis` + `log-update`.

## Run it

Runs directly under Node 24+ (TS type-stripping); no build, no install:

```
node ts/scratch/cli-northstar/main.ts objective-list
node ts/scratch/cli-northstar/main.ts objective-list --color 16 --ladder a
node ts/scratch/cli-northstar/main.ts objective-list --color 16 --ladder b   # B: 16 -> mono
node ts/scratch/cli-northstar/main.ts objective-list --color mono --ascii --width 60
node ts/scratch/cli-northstar/main.ts matrix                                  # every rung, A and B
node ts/scratch/cli-northstar/main.ts flow-submit                             # animated + log-tail
node ts/scratch/cli-northstar/main.ts flow-submit --fail
node ts/scratch/cli-northstar/main.ts help
```

The in-place stream animates only in a real TTY; piped or `--static`, it settles to a single
final frame (what a CI log would capture).

## The two surfaces

- **`objective-list`** — buffered, minimal/gh chrome. Glyph-colored status, default text,
  dim timestamps, `(x)` outstanding-changes marker, branch tree sub-rows. Mirrors
  `@sdl/objective` `ObjectiveListRecord`.
- **`flow-submit`** — streaming, in-place live region: per-phase `✓`/spinner and a one-line
  **log-tail** of the latest `gt submit` subprocess line, settling to a `Submitted` block.
  Mirrors the real submit phase sequence.

## The decision this exists to make

`--ladder a` vs `--ladder b` is the open question:

- **A — full ladder:** truecolor → 256 → 16 → mono. The `--color 16` rung paints a 16-color
  approximation.
- **B — modern-only:** truecolor / 256 → straight to mono. At `--color 16`, B degrades to mono
  (no 16-color rung at all).

Force the same view under both and compare; `matrix` stacks every rung for side-by-side feel.
The branded accent color and the palette intent values are placeholders to be dialed in here.

## Knobs

`--color truecolor|256|16|mono` · `--width <n>` · `--ascii` · `--ladder a|b`
`--fail` · `--static` · `--speed <ms>`

Keep `--width` ≤ your real terminal width: the in-place renderer owns the cursor and does not
account for terminal line-wrapping (reconciling that against raw subprocess passthrough is
explicitly deferred to the real rebuild).
