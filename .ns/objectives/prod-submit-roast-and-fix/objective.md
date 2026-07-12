# Prod Submit Roast-and-Fix

Ideation Objective (see `skills/objective/references/objective-patterns.md`): the
Destination is settled; the roadmap is a Frontier of typed Question Rows. Resolve one
row per session and graduate Fog as answers land.

## Thesis

Submission splits into two explicit verbs. **`ns flow submit`** is the cheap push:
it mirrors or remirrors work-in-progress stacks quickly and deliberately does not
promise review readiness or PR prose. **`ns flow ship`** is the "this stack is done"
pipeline: at the stack tip it validates, runs the applicable tripwire (quick-profile)
roaster reviews in parallel over the whole-stack diff, auto-applies AUTO-classified
fixes that survive local validation, reconciles titles and managed descriptions for
every PR in the stack, and pushes a clean stack. Review state is encoded so roaster —
local or remote — never re-reviews the same stack content incrementally; roaster
becomes stack-aware and reviews only at the tip.

This replaces the current loop (push → remote roaster comments → download-feedback →
hand-apply → resubmit) for tripwire-grade findings: PRs arrive clean instead of being
cleaned up after the fact.

## Scope

- The two-class submission surface in flow: separate `ns flow submit` and
  `ns flow ship` verbs, plus agent/workflow routing that selects between them from
  intent rather than treating raw `gt submit` as an equivalent path.
- Stack-aware, tip-only review execution over the whole-stack diff, run locally and in
  parallel during prod submission.
- A new AUTO classification axis for roaster findings (review-level eligibility gate
  plus per-finding disposition) and the fixer engine that applies AUTO findings,
  validates, and commits.
- Anti-incremental review state: durable encoding of "this stack content was reviewed"
  that both local runs and the remote roaster workflow respect.
- Dogfooded on this repo: the loop is live for real stacks here.

## Non-Goals

- Heavy/deep reviews (thermonuclear, code-smell) in any automatic pipeline: they are
  human-invoked, on demand. The prod pipeline gates on tripwires only.
- Hard-blocking submission on non-AUTO findings. v1 semantics are
  warn-and-continue; trust-gated blocking modes are Fog.
- Changes to the download-feedback / pr-address consumption surface.
- Reusing the fixer engine against remote/human PR feedback (Fog; likely a follow-on
  objective).

## Completion Criteria

- Both submission verbs exist and are used on this repo: cheap `submit` has a fast
  no-review/no-prose contract (today's single `ns flow submit` still generates PR
  titles and managed descriptions by default, so the split must move that prose work
  to `ship`, not merely preserve the status quo), while completion-oriented agent
  workflows route through `ship`; raw `gt submit` is an explicit recovery fallback
  rather than a normal agent path.
- A `ship` on a real stack runs tripwire reviews at the tip over the whole-stack
  diff, applies at least the validated AUTO subset of findings before push, and never
  blocks or dirties the push when the fixer fails (fixes are discarded; findings
  surface as output).
- `ship` resolves every submitted branch to a PR and records a title/managed-description
  disposition for each one. It may degrade to a plain push when description generation
  fails, but it reports "submitted, not shipped" and records no ship attestation until
  stack-wide PR metadata is complete.
- Reviewed stack content is not re-reviewed by subsequent local runs or by the remote
  roaster workflow (anti-incremental state is honored end to end).
- Crystallization: the Frontier below is empty and what remains is PR-shaped execution
  work (which may continue under this record or graduate to execution objectives).

## Assumptions and Risks

- **Assumption:** quick-profile reviews over a whole-stack diff are fast enough
  (parallelized) to sit on the prod-submit path. The latency-measurement row exists to
  confirm or disprove this before integration design hardens.
- **Assumption:** a review-level `auto_apply`-style gate plus per-finding disposition
  yields an AUTO subset precise enough to trust; overconfident AUTO classification is
  the main quality risk, mitigated by the never-block/discard-on-validation-failure
  invariant and by dogfooding the fixer standalone before submit integration.
- **Risk:** pushing model-written fixes the human never saw. Mitigations to be decided
  on the frontier (fix placement/visibility row, TTY confirmation question in the
  integration row).
- **Risk materialized — intent-routing bypass (partially mitigated):** a 2026-07-11
  feedback-remediation stack created PRs #3395–#3397 through raw non-interactive
  `gt submit`; Graphite pushed successfully, but the completion workflow skipped
  Flow's title/description generation and left default commit-subject metadata
  (#3395/#3396 later merged, #3397 closed). The symptom is partially mitigated on
  trunk: commit 5636cb792 ("Generate descriptions for empty existing PRs",
  2026-07-11) makes `ns flow submit` backfill titles and managed descriptions for
  existing PRs with empty bodies by default, so bare PRs left by raw `gt submit` are
  repaired on the next submit. The routing gap itself remains open: command
  capability alone is insufficient — agent-facing submission policy must route WIP
  synchronization to `submit`, completion/review-readiness to `ship`, and raw
  `gt submit` only to an explicit recovery path. As of this refresh,
  `skills/code-gh/SKILL.md` still presents `ns flow submit` and
  `gt submit --no-interactive` as equivalent publish paths.
- **Risk:** whole-stack tip review decouples findings from owning branches; if fixes
  must land per-branch, restack cost and complexity rise sharply. The fix-placement
  row owns this trade.
- **Risk:** anti-incremental state that remote roaster trusts is a soft attestation
  (local runs are not CI); the state-encoding row must decide how much the remote
  workflow trusts it and how a local stack-tip run interoperates with the convergence
  state the remote path already stamps (see Grounding below).
- **Grounding:** anti-incremental review state is not greenfield. The remote review
  workflow (`.github/workflows/reviews.yml`; the Roaster engine now ships in package
  `@nseng-ai/reviews` per ADR 0029, but "Roaster" stays the engine name and `roaster`
  the CLI subcommand) already implements generation-time convergence:
  `ts/packages/capabilities/reviews/src/core/findings-comment.ts` stamps a
  last-reviewed head plus a capped prior-findings union into the GitHub Findings
  comment, and review runs consume prior-findings context (design in ADR 0027,
  Proposed). Two of the three candidate locations the state-encoding row lists — a
  PR-body/Findings-comment machine block and the prior-findings-context pattern — are
  this existing mechanism; the open work is how a local stack-tip run reads, writes,
  and extends it, not choosing from scratch.
- **Lineage note:** the closed Python-era records `roaster-addressing-engine` and
  `roaster-graphite-stack-workflow` explored triage/resolver/stack machinery whose
  implementation was deleted in the TS strangler rewrite; concepts may inform rows but
  no code carries over.

## Open Questions

The precisely-stateable questions live as Question Rows in `roadmap.md`. Fog — seen
but not yet stateable as one-session questions — stays here:

- **Fog:** ergonomics of manually invoking heavy reviews against a stack (surface,
  where findings go) now that they are outside every automatic pipeline.
- **Fog:** trust escalation over time — hard-block modes, blocking on manual `error`
  findings, per-review trust ledgers.
- **Fog:** reusing the fixer engine against remote/human PR feedback (auto-address of
  downloaded feedback).
- **Fog:** interaction with `flow land` — whether landing requires a prod submission,
  and what happens to review state at land time.
