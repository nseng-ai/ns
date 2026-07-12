---
edges:
  - objective: ontology-reshape
    annotation: Extracted 2026-07-12 from that record's "Spec the kernel → sdk rename" grilling row, whose mechanics were grilled and ratified in the creation session (ADR 0035 + kernel-sdk-rename-spec.md); execution proceeds here via the reshaping handoff vehicle's New-Objective hatch, and its row resolves when this record closes.
---

# Execute the Kernel-to-SDK Rename Spec

Bounded autoobjective (ADR 0022 shape): execute ADR 0035 — retiring the kernel
brand by renaming `@nseng-ai/kernel` to `@nseng-ai/sdk` with a root author entry
point — as a stacked Graphite branch series, shaped for repeated
`ns objective exec runner-step` slices with parent checkpoints between commits.

## Thesis

The rename was decided in a live grilling session (2026-07-12) and ratified as
ADR 0035 plus the execution spec
`docs/wayfinding/ontology-reshape/kernel-sdk-rename-spec.md` (the reshaping
handoff vehicle's eight-point contract). This Objective owns executing that
spec: a spec verification sweep, then the four ordered rename slices and the
trust-nothing closeout, each slice one commit on its named branch, `just` green
per slice, local-only until user review. The spec is the execution authority;
this record is the runner-facing tracking shell around it.

## Scope

- The spec verification sweep (vehicle duty one): re-derive every volatile
  inventory claim in the spec against the repo at execution time and commit
  corrections to the spec only.
- Spec items 1–4 as stacked slices on their named branches:
  `kernel-sdk-rename/rename-package` → `root-entry-point` → `rename-ns-fold` →
  `glossary-and-docs`, based on the branch where ADR 0035 and the spec land.
- Item 5, the closeout, on the top slice: final word-boundary `kernel` grep with
  every live hit accounted, per-slice scope-diff justification, confirmation no
  submit happened and no `[cp]` commits exist.
- The volatile-fact re-enumeration duty (vehicle duty two): every import count,
  hit count, and path list in the spec is as-of 2026-07-12 — re-derive at the
  moment of action before editing.

## Non-Goals

- No npm registry work: claiming/publishing `@nseng-ai/sdk` or deprecating the
  published `@nseng-ai/kernel@0.1.2` is an operator follow-up at the user's next
  publish, never runner work.
- No `gt submit`, push, PR creation, or PR mutation; no `[cp]` checkpoint
  commits — the stack stays local until user review.
- No compatibility aliases, shims, or deprecation re-exports for any kernel
  name; kernel is anti-vocabulary in live prose after the glossary slice.
- Immutable history keeps kernel wording: nothing under `.ns/objectives/**`
  (beyond this record's own tracking), `docs/wayfinding/**` research assets
  (except sweep corrections to the spec itself), `docs/retros/**`, or ADRs
  ≤ 0034 is edited for the rename.
- No internal restructure of the renamed package: `src/sdk/` layout and the
  internal `sdk` entry in `ns.subpackages` stay as they are.

## Completion Criteria

The sweep corrections and spec items 1–4 are committed as their named stacked
branches with `just` green per slice; the item 5 closeout is satisfied on the
top slice (every slice's diff justified against its spec enumeration, the final
word-boundary `kernel`/`Kernel` grep over live source leaves no stale live
claims and accounts for all deliberate Avoid/guard/fixture/historical/
out-of-scope hits, no submit or `[cp]` commit happened); and the extraction is
recorded back on the parent — the `ontology-reshape` "Spec the kernel → sdk
rename" row resolves when this record closes.

## Assumptions and Risks

- **Risk (standing hazard): bare `kernel` is never blanket-substitutable.** It
  lives in immutable history, historical prose, and ADRs ≤ 0034. Only the
  spec's word-boundary table pairs are verified safe, and two of them are
  order-sensitive (`@nseng-ai/kernel/sdk` before `@nseng-ai/kernel`;
  `@nseng-ai/ns/kernel/sdk` before `@nseng-ai/ns/kernel/`). After every
  substitution pass, a global check must confirm the diff touches only the
  slice's enumerated live-source set (precedent: a blanket
  `capability-kit/git` substitution once corrupted 36 `github` imports).
- **Assumption (will drift): the spec's volatile inventories are stale by
  execution time.** The 182/263 import-line counts, prose hit counts, and path
  lists are 2026-07-12 snapshots. Every slice re-enumerates before editing; a
  live consumer of a renamed surface appearing outside the enumerated set is a
  stop, not a widen.
- **Risk: the jiti virtual-module key is runtime-load-bearing.** The module
  loader binds the string literal `"@nseng-ai/kernel/sdk"` as the specifier
  extension modules resolve at runtime; it changes in two steps (item 1 scope
  rename, item 2 root entry point) and descriptor loading must be exercised
  after each (`ns --help` plus a descriptor-loading test), not just typechecked.
- **Risk: guard tests as semantic tripwires.** The style guard's
  tier→directory projection and debt-edge literals are enumerated spec scope;
  if any guard can only go green by changing guard *semantics* rather than
  renamed literals, that is a user decision, not a runner fix.
- **Risk: checkout-free assembly is exercised by scripts, not the test suite.**
  Item 3 must run `smoke-checkout-free.mjs`; a failure there is a STOP.
- Validation evidence per slice: `just` at repo root plus the slice's
  verification greps from the spec.

## Open Questions

- None at creation. Discoveries during execution land as Semantic Updates and,
  if they gate work, as row notes or a Blocked Sentence.

## Definition of Progress

Progress is keepable when:

- One spec item (or the sweep) is implemented within its enumerated scope from
  `kernel-sdk-rename-spec.md`, on its named branch, as one commit.
- `just` is green at repo root for the slice, and the item's verification greps
  pass (stale-specifier greps return nothing live).
- Every substitution pass was verified against the slice's enumerated
  live-source set before committing, honoring the word-boundary table's
  ordering constraints.

Do not keep changes that:

- Touch immutable-history dirs for the rename (`.ns/objectives/**` other than
  this record's own tracking, `docs/wayfinding/**` beyond sweep corrections to
  the spec, `docs/retros/**`, ADRs ≤ 0034).
- Change guard-test semantics rather than renamed literals.
- Add compatibility aliases or shims for retired kernel names.
- Touch npm registry state or `publishConfig` policy.
- Widen past the slice's spec enumeration or pull forward another slice's
  edits.

Useful evidence includes:

- Per-slice `just` output and the item's verification grep results.
- The scope-diff check: each slice's changed files diffed against its spec
  enumeration, extras justified.
- Semantic Updates recording ground-truth drift found at re-enumeration.

## Runner Policy

This Objective is an autoobjective (ADR 0022): its roadmap is shaped for
repeated `ns objective exec runner-step` slices with parent checkpoints between
commits, and it is execution-friendly for `objective-next` under the boundaries
below.

- Direct execution is allowed when: a slice implements a `[ ]` roadmap row
  within its spec item's enumerated scope, including the glossary slice's
  prose rewrite per ADR 0035's already-ratified sdk-throughout vocabulary.
  Re-enumeration deltas that stay inside the item's stated intent (a moved
  line number, a changed import count for an enumerated rename pair) are
  runner-decidable with the delta recorded in the step report.
- Steer or ask first when: a substitution diffs outside the enumerated set, a
  live consumer of a renamed surface appears outside the enumeration, a guard
  test needs semantic change, `smoke-checkout-free.mjs` or descriptor loading
  fails after a rename step, or a change would exceed the slice's spec
  enumeration.
- How work may change files and be left: each runner step lands as one commit
  on the row's named fresh Graphite-tracked branch stacked on the previous
  slice, per the Objective Runner contract; the stack stays local. Objective
  tracking updates are parent-session judgment, not child work.
- Validation before keeping work: `just` at repo root per slice plus the item's
  verification greps; formatting failures route through `just dprint-fix` /
  `just ts-format-fix`, never hand-edited formatter output.
- What will not happen unless explicitly requested: `gt submit`, pushing,
  merging, PR creation or mutation, publishing or any npm registry mutation,
  `[cp]` checkpoint commits, mutating GitHub or any external system, editing
  immutable-history dirs, or adding compatibility aliases for kernel names.

## Closure

Completed 2026-07-12. The sweep and spec items 1–4 landed as the five named
local Graphite branches stacked on `unpark-kernel-sdk-rename-row`, one
implementation commit per slice, with the item 5 closeout committed on the
top slice. Root `just` passed per slice and again after closeout fixes; the
integration lane passed on the top slice; `smoke-checkout-free.mjs` and
descriptor loading (`ns --help`, extension-loader integration test) were
exercised after each jiti-key change.

The spec verification sweep re-derived every volatile inventory claim before
execution and committed the corrections to the spec only. The trust-nothing
closeout audited each slice's changed files against its spec enumeration
(zero unexplained extras) and produced a fully accounted 162-hit
word-boundary + camelCase `kernel` inventory: 61 historical, 43 out-of-scope
(parked `KernelCommandCompletion*` aliases, north-star/docs-site
product-vision usage), 5 avoid-term, 6 guard-fixture, and 47 live-claims all
fixed in the closeout commit. No stale live kernel claim remains.

No execution-stack commit subject contains `[cp]`, and no submit, push, or
PR mutation occurred. npm registry work stays operator-run per ADR 0035.
Evidence: `updates/2026-07-12-execution-completed.md`. This closure resolves
the `ontology-reshape` "Spec the kernel → sdk rename" row.
