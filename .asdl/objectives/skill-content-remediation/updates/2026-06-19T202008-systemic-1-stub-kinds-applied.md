# Systemic #1 complete — stub-description skills set to correct invocation kinds

## Summary

Closed out Systemic #1 by setting the correct areg invocation kind for every remaining
`Command: X` stub-description skill, on branch `stub-skill-invocation-kinds` (stacked on
`objective-family-descriptions`). With the earlier objective-family slice
(`2026-06-19T180857`, those five set to `normal`), all stub skills named in Scope finding
#1 are now correctly kinded and `areg check` reports "All skills OK".

Applied this slice (registry-driven via `areg skill apply <kind> <skills>`, never
hand-edited frontmatter; descriptions left as minimal `Command: <name>` stubs per the
minimal-context goal):

- **`setup-*` family → `invoke-only`** (`setup-dprint-gh-ci`, `setup-graphite`,
  `setup-pypi-publish`, `setup-python-gh-ci`; `setup-dprint` was already `invoke-only`).
  No verified Pi replacement, so `invoke-only` is the correct explicit-only kind: model
  invocation disabled, no `.pi/settings.json` exclusion.
- **Eight skills → `command-backed`** (`sdl-submit`, `code-checkpoint`, `code-just-fix`,
  `code-workflows`, `changelog-update`, `create-bun-typescript-project`,
  `create-python-dev-cli`, `create-python-package`). Each has a *verified Pi replacement
  extension* (auto-generated backing command from `COMMAND_STYLE_LOCAL_SKILLS` +
  `real-gateways.ts` allowlist), so the kind is `command-backed`: model invocation
  disabled **plus** a `.pi/settings.json -skills/<name>` exclusion, preserving each
  skill's slash-command surface (e.g. `sdl-submit` → `/sdl:submit`, `code-checkpoint` →
  `/sdl:cp`).

User signed off on the per-skill classification and chose `command-backed` (vs stripping
the slash-command backing) for the eight.

## Objective Impact

- **Corrects a durable premise — `command-backed` is NOT unexemplified.** Updates
  `2026-06-19T160157` and `2026-06-19T170214` (immutable historical records, left
  unedited) recorded that no skill uses `command-backed` and that any conversion would
  require *building* a Pi replacement first. That is superseded: the `setup-*` removal
  only de-verified the `setup-*` family. Many skills in `COMMAND_STYLE_LOCAL_SKILLS`
  retain auto-generated, `areg check`-verified Pi replacements, and eight are now applied
  as `command-backed`. The operative rule discovered: a skill with a verified Pi
  replacement *cannot* be `invoke-only` — once model invocation is disabled, `areg check`
  requires the full command-backed wiring (the `.pi/settings.json` exclusion). The real
  classification axis is "has a verified Pi replacement?", not "internal stub vs
  commented-out description".
- `roadmap.md` Systemic #1 row marked `[x]` with completion evidence.
- `objective.md` Scope finding #1, the Systemic #1 Open Question, and the
  description-editing Risk reconciled: the per-skill kind assignment is decided, signed
  off, and applied; `command-backed` is exemplified.
- The "editing descriptions/kinds is the highest-risk surface" risk partially
  materialized and was caught mechanically: an initial mis-classification (the eight
  backed skills set to `invoke-only`) was flagged immediately by `areg check` and
  corrected to `command-backed`. The tool's enforcement de-risks silent routing
  regressions.
- Two systemic findings remain open (Systemic #2 grill pair; plus the disclosure-surgery
  and duplication-collapse rows). Objective stays open.

## Follow-Ups

- Systemic #2 (grill-pair single-sourcing) is the next systemic slice; still depends on
  resolving the shared-core mechanism open question.
- Body-content work for `sdl-submit` / `objective-close` / `objective-create` beyond their
  descriptions remains tracked under the duplication-collapse roadmap row, not Systemic #1.
- Verification: `areg check` green ("All skills OK"); kinds confirmed via `areg skill
  list` (8 command-backed, 5 invoke-only). No broader `just` run required — changes are
  skill frontmatter, `agents/openai.yaml` sidecars, and `.pi/settings.json`.
