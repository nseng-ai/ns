# Code-Smell Roaster Remediation

## Thesis

A full-codebase, multi-agent run of `.sdl/reviews/code-smell-roaster.md` (the
Fowler-style code-smell-only roaster review) against all 849 production
TypeScript/TSX source files in this repo found 162 adversarially-verified code
smells: 92 Duplicated Code, 16 Repeated Switches, 15 Data Clumps, 13 Divergent
Change, 10 Speculative Generality, 5 Primitive Obsession, 4 Middle Man, 4
Shotgun Surgery, 2 Message Chains, 1 Mysterious Name. This Objective tracks
remediating that backlog as small, validated, package-scoped refactors.

The full original findings — file:line evidence, roast, and a concrete
smallest-fix per finding — are preserved under `references/` (start at
`references/README.md`), grouped into 21 package/area clusters. Like the
precedent `ts-cli-core-structural-cleanup` Objective, the reference files are
source material rather than current truth: re-verify paths, line numbers, and
that a smell is still present before implementing a row, since the repo moves
between the sweep and pickup.

This Objective is execution-friendly: a runner may pick a cluster, fix it, and
submit a PR without asking each time, under the Runner Policy below. It is the
canonical home for this specific findings backlog. It does not re-run the
sweep, and it does not absorb or duplicate the unrelated god-file/dedup
backlog already tracked in `ts-cli-core-structural-cleanup` — see Non-Goals.

## Scope

In scope:

- Every one of the 162 confirmed findings under `references/*.md`, grouped by
  the 21 package/area clusters in `references/README.md`.
- Resolving each finding's smell using its documented smallest-fix (or an
  equivalent or better refactor discovered at implementation time), without
  changing observable behavior.
- Re-verifying each finding against current code before acting on it, and
  recording whatever is actually found (smell confirmed / already gone /
  description stale) rather than assuming the reference file is current truth.
- Slicing remediation work by package/area cluster (matching the 21
  `references/*.md` files), since that is how the smells were found and how
  ownership is easiest to reason about; large clusters (`infra`,
  `capabilities`, `local-pi-tools`) may be split further by sub-package when a
  cluster is too large for one coherent, review-substantive PR.
- Recording, per finding, one of three dispositions in `roadmap.md` as work
  lands: **fixed** (smell removed, evidence recorded), **disposed** (re-probed
  and the smell is no longer real, not worth the churn, or the prescribed fix
  would be worse than the smell — with rationale), or **routed** (the finding
  belongs to another active Objective's ownership — with rationale and the
  target Objective named).

## Non-Goals

- Do not re-run the code-smell-roaster sweep or hunt for additional smells
  beyond the 162 findings recorded under `references/`. Cross-package
  duplication this sweep could not see (each reviewer only saw its own
  partition) is a known gap; a future Objective can re-sweep if warranted.
- No observable behavior changes. This is a structural/quality Objective, not
  a feature or bugfix Objective — every fix must preserve existing CLI/
  extension/API behavior, confirmed by existing or focused tests.
- Do not touch test source files (`**/test/**`, `*.test.ts`) or vendored
  third-party code under `.agents/skills/`, `.claude/skills/`, `skills/` — out
  of the original sweep's scope and out of scope here too.
- Do not duplicate or re-track work already owned by `ts-cli-core-structural-
  cleanup` (god-file decomposition, cross-package Git/GitHub gateway dedup,
  CLI wiring layer, Branch-Memory access unification, and similar). Where a
  finding here clearly overlaps a row already open in that Objective, dispose
  it here as **routed** to `ts-cli-core-structural-cleanup` rather than
  duplicating the implementation. Where overlap is unclear, fix it here and
  note the overlap in the Semantic Update.
- Do not move duplicated capability-domain logic below the SDK merely because
  it's duplicated. Apply the same ADR 0009 layering guardrail used by
  `ts-cli-core-structural-cleanup`: neutral infra dedup is fine; relocating
  capability-domain logic to "fix" duplication is not.
- Per the Runner Policy below, do not land/merge PRs, deploy, or perform any
  GitHub mutation beyond opening a PR via the normal `gt`/Graphite workflow.

## Completion Criteria

- Every one of the 162 confirmed findings has a recorded disposition (fixed /
  disposed / routed) in `roadmap.md`, with rationale and evidence for
  disposed/routed rows and validation evidence for fixed rows.
- No open finding remains without a disposition unless explicitly parked with
  a recorded reason (e.g., blocked on an unrelated Objective's migration).
- All landed fixes preserve existing behavior, confirmed by relevant
  TypeScript validation (`just` targets) and existing or focused tests for the
  touched package(s).
- Close this Objective once all 162 findings have a disposition and any
  trailing PRs from the last slice have been submitted; it is not standing.

## Definition of Progress

Progress is keepable when it does one or more of:

- Removes or substantially reduces a confirmed smell using its documented
  smallest-fix or an equivalent/better refactor, without behavior change.
- Extracts a genuinely shared helper/type/table that the smell's evidence
  shows is duplicated, rather than a speculative abstraction the evidence
  doesn't support.
- Records an accurate disposition (fixed/disposed/routed) with rationale a
  future agent can trust without re-deriving the analysis.
- Reduces the open (no-disposition) finding count in `roadmap.md`.

Do not keep changes that:

- Change observable CLI/extension/API behavior.
- Fix a finding by introducing a new cross-package or capability-domain
  dependency that violates ADR 0009 layering.
- Batch unrelated clusters into one PR just to make it bigger, or split one
  coherent cluster into PRs too small to review as a unit.
- Mark a finding "fixed" without validation evidence for the touched
  package(s).

Useful evidence: before/after description of the duplicated/smelly shape, the
extracted helper/type/table introduced (if any), the validation commands run
and their result, and — for disposed/routed findings — the re-probe evidence
that justified the disposition.

## Runner Policy

This Objective is execution-friendly for `objective-next`, including
autonomous branch creation and PR submission per slice — but never landing.

The supported autonomous runner is `/objective:autopilot <slug> [--submit]`:
each iteration spawns a fresh child Pi that runs `objective-next` for *this*
Objective, implements one coherent slice, and leaves it **uncommitted**; the
parent session then re-checks live repo state and owns commit and submit
(`--submit` opens the PR via `sdl flow submit --no-restack`, never restacking
and never landing). A human working the loop by hand follows the same steps
below.

- **Direct execution is allowed when:** the runner selects one
  `references/<area>.md` cluster (or a sub-package slice of a large cluster),
  re-verifies its findings against current code, fixes them per the Definition
  of Progress, and validates locally.
- **Steer or ask first when:** a finding's fix is ambiguous, would touch a
  public SDK/CLI/extension surface in a way a human should weigh in on, looks
  like it overlaps `ts-cli-core-structural-cleanup` ownership and the overlap
  isn't clear-cut, validation fails for a reason outside the smell fix itself,
  or the smallest-fix as written would require a behavior change to implement
  cleanly.
- **How work may change files and be left:** local edits and commits on a
  feature branch (never on `main`/`master`) created via the repo's
  **branch-context Graphite creation** path per the autoobjective branch policy
  (`sdl branch-context exec from-plan --branch-creation graphite`, or
  `/sdl:branch-context:from-plan --graphite`) — not bare `gt create`. See
  `skills/branch-context/references/lifecycle.md`. Small, reversible, locally
  validated steps are fine while exploring a cluster, but
  the submitted PR should be one coherent, review-substantive unit — usually
  one `references/<area>.md` cluster, occasionally a sub-package slice of a
  large one. Do not batch unrelated clusters into one PR.
- **Validation before keeping or submitting work:** run the relevant `just`
  TypeScript targets (at minimum format/lint/typecheck/test for touched
  packages; full `just` when the change is broad) and existing or focused
  tests for every touched package before submitting.
- **What will not happen unless explicitly requested:** landing/merging a PR,
  deploying, publishing, or any GitHub mutation beyond opening the PR itself
  (no auto-merge, no closing other PRs/issues, no repo settings changes).

Default runner loop:

1. Pick one open (no-disposition) `references/<area>.md` cluster from
   `roadmap.md`.
2. Re-verify each finding in the cluster against current code; note any that
   are already stale (file moved, smell already gone, description outdated).
3. Fix what's still real per the Definition of Progress; dispose or route
   anything that no longer applies or belongs elsewhere.
4. Run relevant validation for every touched package.
5. Update `roadmap.md` with a disposition per finding in the cluster.
6. Record a Semantic Update only for kept progress, reusable findings (e.g., a
   finding that turned out stale, or an overlap with another Objective), or
   policy refinements — not a per-commit changelog.
7. Create the branch-context implementation branch, commit the slice, and
   submit the cluster's PR (`sdl flow submit --no-restack`); do not land it.
   Under `/objective:autopilot` the parent owns commit and submit while the
   child leaves the slice uncommitted.

## Assumptions and Risks

Assumptions:

- The adversarial verification pass (which already rejected 12 of 174 raw
  findings) makes the 162 confirmed findings reasonably trustworthy, but not
  infallible — a single verifier pass can still miss a misjudged smell or
  inaccurate evidence, so re-verification at pickup is required, not optional.
- Package ownership may have shifted since the sweep (extension-architecture
  migration is ongoing per `ts-cli-core-structural-cleanup`); cluster-to-
  package mapping in `references/` should be treated as a starting point.
- Existing or focused tests per touched package are a sufficient behavior-
  parity net for refactors of this shape (extract-helper, collapse-switch,
  bundle-data-clump), consistent with the precedent Objectives.
- Most of the 162 findings are independent, package-local refactors safe to
  parallelize across PRs; a minority (large Divergent Change god-files such as
  `local-pi-tools/thermo-council/orchestrator.ts` or
  `local-pi-tools/pr-feedback-watch/controller.ts`) are larger design
  decisions better split across multiple slices within their cluster.

Risks:

- **Ownership overlap risk:** several `infra` and `capabilities` findings
  (e.g., `RealGitGateway`/`RealGithubPrGateway` method-wrapping duplication,
  Flow land-stack presentation-failure duplication) sit close to open
  `ts-cli-core-structural-cleanup` rows. Fixing the same shape in both
  Objectives would waste effort or conflict; check that Objective's open
  roadmap rows before implementing an `infra`/`capabilities` cluster.
- **Cross-package duplication is undercounted** by construction (each
  reviewer agent saw only its own partition), so this backlog is a floor, not
  a ceiling, on Duplicated Code in the repo.
- **Large god-file findings** (Divergent Change in `thermo-council/
  orchestrator.ts`, `pr-feedback-watch/controller.ts`, `grill/extension.ts`,
  `hosts/pi/commands/cli-extension.ts`, `infra/graphite/status.ts`) are
  higher-risk to split without behavior regressions; treat these as their own
  slice with extra validation rather than folding into a larger cluster PR.
- **Mechanical extraction risk:** "extract a shared helper" fixes can
  introduce a real but non-obvious behavior difference (e.g., differing error
  wrapping) if applied too mechanically; each fix needs the validation step,
  not just a clean diff.

## Open Questions

- Whether the large Divergent Change god-file findings should get their own
  dedicated roadmap rows split out of their parent cluster once a runner
  starts implementing that cluster (deferred to pickup time rather than
  decided up front).
- Whether any `infra`/`capabilities` findings should be disposed as routed to
  `ts-cli-core-structural-cleanup` before any implementation starts, versus
  deciding row-by-row at pickup — left to the first runner session to resolve
  with evidence.
