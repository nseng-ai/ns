# Trunk refresh: core surfaces landed, two risks retired, old-root regression found

Provenance: objective-refresh basis target=5668ac5630b2bab397ef85b9e4cfe4d5cd84c420 from=trunk-HEAD

## Summary

Forensic trunk rebaseline of this record against master HEAD `5668ac563`. The core
cutover has substantially landed on trunk: `.sdl/` → `.ji/` plus `sdl.toml` → `ji.toml`
(`[cutover B1]` commit `d6184e4c4` and successors), kernel bin `ji`, workspace root
`ji-ts-workspace`, Pi surfaces mapped to `ji:*`, runner surface renamed
(`JI_RUNNER_PI_BIN`, `ji-objective-runner-` tmpdir), and zero `@sdl/` under `ts/`.
`ji objective list`, `read-objective`, and `load-orientations` all work against this
tree. The child `ji-core-cutover` remains open, so the core-cutover row stays `[~]`.
Two risks retired on evidence: the split-landing risk (the atomic move landed together
and onboarding works) and the `cross-harness-parity` table drift risk (its
`parity-table.md` already uses `/ji:*`). The landing-window open question is resolved —
the window was used.

One regression found: `.sdl/objectives/objective-edges/` was created on trunk 2026-07-03
(commit `463ed7541`, 9 tracked files at HEAD) — a live, open Objective record under the
retired `.sdl/` root with no `.ji/objectives/` counterpart, invisible to
`ji objective list`. Recorded as a live risk plus an open question on fix routing; not
touched by this refresh (crosses Objective boundaries).

Also corrected: the thesis claimed `checkout-free-sdl-distribution` "currently carries"
the publish-name question as open; that record shows it struck through and resolved by
this Objective (ADR 0024), so the thesis now states it in the past tense. Still-open
rows re-verified: vocabulary sweep (root context is `# SDL Tools`; seven sdl-named
skills remain), GitHub rename (`origin` is `nseng-ai/sdl-tools`), npm `@ji` org
(unverifiable locally; kept as a dated assumption), machine migration.

## Objective Impact

- `objective.md` rewritten: thesis publish-name clause corrected to past tense; two
  risks retired with evidence; new old-root regression risk added; landing-window open
  question replaced by the regression-routing question.
- `roadmap.md` rewritten: `[~]` core-cutover row now carries the landed-on-trunk
  evidence and the regression note; `[x]` rows carry trunk verification notes; open
  rows carry as-of-2026-07-03 status evidence. No checkbox state changed.
- `orientation.md` re-derived: "What you see now" shrunk to reflect that core surfaces
  are already `ji`; `Direction`/`Getting to` unchanged; `Avoid` now names `.sdl/` paths
  explicitly.

## Follow-Ups

- Route the `.sdl/objectives/objective-edges/` move to `.ji/objectives/` (child
  `ji-core-cutover` residual cleanup vs. the Objective Edges initiative — owner call).
- Owner: create the `ji` npm org (unchanged, still pending).
- Pre-existing `ji objective check` failures on this record: two immutable historical
  updates (`2026-07-02-ground-truth-refresh-post-runner-decomposition.md`,
  `2026-07-03-package-scope-sweep-executed.md`) lack required update headings; left
  untouched per updates-immutability. Needs an owner decision (accept or supersede).
