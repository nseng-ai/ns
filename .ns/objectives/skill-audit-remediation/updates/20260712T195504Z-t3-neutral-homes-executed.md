# T3 neutral-homes consolidation executed

## Summary

The neutral-homes cluster executed via an Objective Runner step on
`skill-audit-t3-neutral-homes` (commit a1c80149). The first attempt failed the
runner's `index-clean` gate — the child used `git mv`, which stages changes, and the
runner owns staging — and was repaired by one `--recover` re-dispatch that only
unstaged the index; file content was byte-identical to the attempt that ran the full
suite green.

Consolidations, per the binding neutral-home policy: `autobranch-family-boundaries.md`
and the cmux read-only posture plus shared badge vocabulary moved into
`docs/conventions/` (the latter as `cmux-observational-skills.md`); the gt
plumbing-not-display rule merged into `graphite-dependency-boundary.md`; the retired
ExecGateway/CommandExecApi naming fact merged into
`consumer-gateways-and-command-shape.md`; `just-gate-map.md` (failing signal →
narrowest just gate, derived from the live justfile) and `doc-economics.md` (shared
doc-cost rules for docs-retro/branch-retro) created. 15 skills reduced to one-line
pointers plus their own deltas. Along the way the map superseded
code-resolve-merge-conflicts' nonexistent `just ty`/`just test` recipe citations.

Validation: full `just` green on the content attempt, `areg check` OK on both
attempts, `areg skill show` verified for all 15 touched skills.

## Objective Impact

Tranche 3: four clusters done (adversarial-reviews, TS ownership, objective-family
SSOT, neutral homes). Remaining: disclosure moves, reference TOCs, and
completion-criteria sharpening. Process learning for the Runner Policy: children must
not use `git mv` (or any staging command) — the runner requires an unstaged worktree;
parent guidance now says so explicitly for move-heavy slices.

## Follow-Ups

- Remaining T3 clusters: disclosure moves (code-smush recovery/feedback, ccc-stack-map
  palette, objective-retro templates/maintainer notes, skill-management
  umbrella-families); TOCs (code-gh graphql references,
  architecture-topology-report HTML-REPORT.md); completion-criteria sharpening
  (ns-cmux-branch-triage, code-thermostack, code-gt-restack-resolve, skill-management
  rename).
- `docs/wayfinding/ontology-reshape/cmux-reshape-spec.md` still cites pre-rename and
  now pre-move paths; its own text says to re-enumerate at execution — left as
  historical inventory.
