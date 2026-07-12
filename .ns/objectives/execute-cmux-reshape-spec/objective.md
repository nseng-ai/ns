---
edges:
  - objective: ontology-reshape
    annotation: Extracted 2026-07-12 from that record's "Execute the cmux reshape spec" task row via the reshaping handoff vehicle's New-Objective hatch; its row resolves when this record closes.
---

# Execute the Cmux Reshape Spec

Bounded autoobjective (ADR 0022 shape): finish executing ADR 0034 — the
CCC-to-cmux capability reshape — as the remaining slices of the ratified
six-slice Graphite stack, shaped for repeated `ns objective exec runner-step`
slices with parent checkpoints between commits.

## Thesis

The cmux reshape was decided (ADR 0034), sweep-verified, and ratified as the
enriched plan `cmux-reshape-execution-stack`, attached as branch context on
`cmux-reshape/trim-flow-facade` (`brmem get cmux-reshape-execution-stack.md
--namespace branch-context`). Slice 1 of 6 already landed pre-extraction as
commit `206832e28` on that branch. This Objective owns the rest: slices 2–6 as
stacked local Graphite branches, `just` green per slice, local-only until user
review, plus the stack's trust-nothing closeout. The attached plan is the
execution authority; this record is the runner-facing tracking shell around it.

## Scope

- Slices 2–6 of the attached plan, each one committed slice on its named fresh
  Graphite branch stacked on the previous: `cmux-reshape/rename-package` →
  `rehome-bin-as-extension` → `rename-surfaces-and-skills` → `ripple-renames` →
  `glossary-and-docs`.
- Per-slice validation: `just` green at repo root before keeping each slice.
- The volatile-fact re-enumeration duty: every importer list, grep hit, and
  line number in the plan is as-of 2026-07-11/12 — re-derive at the moment of
  action before editing.
- The plan's closeout checklist on the top slice (scope-diff justification per
  slice, final word-boundary `ccc` grep with every hit accounted for,
  confirmation that no submit happened and no `[cp]` commits exist).

## Non-Goals

- No `gt submit`, push, PR creation, or PR mutation; no `[cp]` checkpoint
  commits — the stack stays local until user review.
- Dispatch CLI parity (ADR 0034 §8) — released to the future e2e-docs effort.
- `BrmemExecGateway` and capability-kit `kit/` contents — the parent
  Objective's capability-kit junk-drawer grilling row owns them.
- The `@nseng-ai/kernel` name — parked in the parent Objective's roadmap.
- Historical records keep CCC/ccc wording: nothing under `.ns/objectives/**`,
  `docs/wayfinding/**`, `docs/retros/**`, or ADRs ≤ 0034 is edited for the
  rename.
- `skills/code-smush` / `ns slot gt exec stack-map-branches` — slot-owned, not
  this rename.
- `capability-kit/cmux` content stays intact; only the two stale comment lines
  go (plan slice 6 kit ride-along).

## Completion Criteria

Slices 2–6 are committed as the five named stacked branches with `just` green
per slice and on the top slice; the closeout checklist is satisfied (every
slice's diff justified against its plan scope list, the final word-boundary
`ccc`/`CCC` grep over live source shows only deliberate immutable history, no
submit or `[cp]` commit happened); and the extraction handoff is recorded back
on the parent — the `ontology-reshape` "Execute the cmux reshape spec" row
resolves when this record closes.

## Assumptions and Risks

- **Risk (standing hazard): bare `ccc` is never blanket-substitutable.** It
  lives in immutable history (`.ns/objectives/**`, `docs/wayfinding/**`,
  `docs/retros/**`, ADRs ≤ 0033) and inside historical `nscc` substrings. Only
  two exact pairs are verified collision-free (as of 2026-07-11):
  `@nseng-ai/ccc` → `@nseng-ai/cmux` and `ns:ccc:` → `ns:cmux:`. After every
  substitution pass, a global check must confirm the diff touches only the
  slice's enumerated live-source set (precedent: a blanket
  `capability-kit/git` substitution once corrupted 36 `github` imports).
- **Assumption (will drift): the plan's volatile inventories are stale by
  execution time.** In the layering precedent, ground truth moved twice between
  sweep and execution. Every slice re-enumerates its importer lists and line
  numbers before editing; a live importer of a deleted surface appearing
  outside the enumerated set is a stop, not a widen.
- **Risk: guard tests as semantic tripwires.** If a guard test (registry
  uniqueness, package-boundary, style guard) can only go green by changing
  guard *semantics* rather than renamed literals, that is a user decision, not
  a runner fix.
- **Assumption verified by Slice 3: kernel source-dev discovery auto-registers
  the new extension.** `ns cmux exec workspace-summary --help` resolves from
  the repository root with no registration edit. This discovery path is now
  completion evidence rather than an open execution risk.
- **Slice 6 vocabulary gate resolved.** The parent Objective's rule is that
  humans choose vocabulary; ADR 0034 ratified the term dispositions, and on
  2026-07-12 the user chose to retire `Project-local adapter` from the rewritten
  cmux glossary. Glossary drafting now has no remaining vocabulary decision.
- Validation evidence per slice: `just` at repo root plus the slice's own
  verify-line greps from the attached plan.

## Open Questions

- None at extraction. Discoveries during execution land as Semantic Updates
  and, if they gate work, as row notes or a Blocked Sentence.

## Definition of Progress

Progress is keepable when:

- One plan slice is implemented within its enumerated scope from the attached
  `cmux-reshape-execution-stack` plan, on its named branch, as one commit.
- `just` is green at repo root for the slice, and the slice's verify-line greps
  pass (stale-term greps return nothing live).
- Every substitution pass was verified against the slice's enumerated
  live-source set before committing.

Do not keep changes that:

- Touch immutable-history dirs (`.ns/objectives/**` other than this record's
  own tracking, `docs/wayfinding/**`, `docs/retros/**`, ADRs ≤ 0034) for the
  rename.
- Change guard-test semantics rather than renamed literals.
- Add compatibility aliases for retired names (CCC is anti-vocabulary; the
  `LEGACY_CCC_PREFIX` guard stays as-is).
- Widen past the slice's scope list or pull forward another slice's edits.

Useful evidence includes:

- Per-slice `just` output and the slice verify-line grep results.
- The scope-diff check: each slice's changed files diffed against its plan
  scope list, extras justified.
- Semantic Updates recording any ground-truth drift found at re-enumeration.

## Runner Policy

This Objective is an autoobjective (ADR 0022): its roadmap is shaped for
repeated `ns objective exec runner-step` slices with parent checkpoints between
commits, and it is execution-friendly for `objective-next` under the boundaries
below.

- Direct execution is allowed when: a slice implements a `[ ]` roadmap row
  within its enumerated scope in the attached plan, including slice 6's
  glossary drafting per the spec's already-ratified term lists.
  Re-enumeration deltas that stay inside the slice's stated intent (a moved
  line number, an extra test fixture line for an enumerated rename) are
  runner-decidable with the delta recorded in the step report.
- Steer or ask first when: any plan STOP condition trips (an unenumerated live
  importer, `ns cmux exec workspace-summary` failing to resolve after slice 3,
  a substitution diffing outside the enumerated set, a guard test needing
  semantic change) or a change would exceed the slice's scope list. The Slice 6
  `Project-local adapter` gate is resolved: retire it from the cmux glossary.
- How work may change files and be left: each runner step lands as one commit
  on the row's named fresh Graphite-tracked branch stacked on the previous
  slice, per the Objective Runner contract; the stack stays local. Objective
  tracking updates are parent-session judgment, not child work.
- Validation before keeping work: `just` at repo root per slice plus the
  slice's verify-line greps; formatting failures route through
  `just dprint-fix` / `just ts-format-fix`, never hand-edited formatter output.
- What will not happen unless explicitly requested: `gt submit`, pushing,
  merging, PR creation or mutation, publishing, `[cp]` checkpoint commits,
  mutating GitHub or any external system, editing immutable-history dirs, or
  deciding the `Project-local adapter` disposition.
