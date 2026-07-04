# Roaster Review Convergence

## Thesis

Roaster's CI review loop does not converge. Every push re-runs whole-diff,
stateless, non-deterministic reviews, so the human cycle of "resolve feedback →
resubmit → get a fresh batch of findings" repeats indefinitely — including new
nitpicks on code a previous round already blessed. Because feedback is consumed
through the harness download flow rather than the PR UI, this shows up as
redundant *work* re-downloaded each round, not just visual clutter.

Kill the treadmill at generation time: **make each review run aware of prior
rounds.** Feed the model roaster's own previously surfaced findings (with their
review-thread resolution status) plus the Last-reviewed head recorded at the
previous publish, and instruct it to hold already-reviewed unchanged regions to
the previously applied standard while reviewing changed regions at full
strength. GitHub is already the durable store — roaster's marker-keyed summary
comment and inline threads persist per PR, and thread resolution is the
addressed signal the pr-address flow already produces.

Generation-time semantic suppression is the only mechanism that recognizes a
*rephrased* re-nitpick. Roaster's existing sha256 inline-marker dedupe is
durable exact-match suppression, and the treadmill persists anyway — because
re-found findings drift in phrasing and line position. A deterministic filter
cannot converge a non-deterministic generator; conditioning the generator can.

## Scope

- Stamp the Last-reviewed head (head commit SHA, plus reviewed base ref)
  machine-readably in the roaster summary Findings comment at publish,
  alongside the existing `<!-- roaster:<key> -->` marker.
- Gather Prior-findings context at review time: roaster's own previously
  surfaced findings for the review key on the PR, each with review-thread
  resolution status, bounded by an explicit cap.
- Keep compute layered: Prior-findings context is an *optional* prompt input.
  `ns roaster review run` remains runnable with no PR context and no GitHub
  dependency in its core path; PR-aware context gathering is a separate,
  composable input step.
- Prompt convergence instructions: do not re-raise previously surfaced findings
  (resolved or unresolved) absent material worsening; regions changed since the
  Last-reviewed head get full-strength review; unchanged already-reviewed
  regions are held to the prior round's standard; include an anchoring guard so
  prior findings do not suppress genuinely new issues.
- Keep the existing exact-match marker dedupe at the GitHub publication
  boundary as a deterministic backstop.
- CI wiring: pass PR context into the matrix review jobs. The workflow already
  has `PR_NUMBER`, `GH_TOKEN`, and `pull-requests: write`; no new permissions
  and no `contents: write`.
- An ADR recording the architecture: generation-time convergence,
  GitHub-as-durable-state, compute layering (PR context optional), and the
  rejected cache/ledger design with the parity and fingerprint-drift evidence.

## Non-Goals

- **Review compute caching / LLM-skip memoization** (diff-content hashing,
  execution-contract cache identity, local→CI compute reuse, shadow mode).
  Deferred, not rejected on value: it composes independently later if compute
  cost proves material. It is blocked today by unresolved diff parity — CI
  diffs the PR *merge commit* while local runs diff the branch head, and the
  diff command pins prefixes but not `diff.algorithm`/`diff.renames`/
  `core.quotepath` — and it does not address rephrased-nitpick convergence.
- **Branch Memory origin distribution** (pushed `refs/brmem/*`, Branch Memory
  Pull/Push, fan-in persistence job holding `contents: write`). No longer
  needed: the durable convergence state lives on the PR itself.
- **Fingerprint Publication ledger.** Replaced by generation-time semantic
  suppression; deterministic exact-match dedupe already exists at the
  publication boundary and stays as-is.
- **Input-level delta-scoping** as a hard input filter. Review input stays
  whole-diff so the model keeps full context; delta-awareness is prompt-level
  guidance only.
- **Draft-gating / CI trigger changes.** Drafts are already skipped by the
  workflow; unchanged here.
- **PR-UI presentation** (comment consolidation, inline reconciliation for
  human readers) beyond what suppression naturally yields, since feedback is
  consumed through the harness download flow.
- **Remediation / agentic resolution** of findings (owned elsewhere, e.g. the
  roaster stack workflow).

## Completion Criteria

- ADR merged capturing generation-time convergence, GitHub-as-durable-state,
  compute layering, and the rejection rationale for the cache/ledger design.
- Publish stamps the Last-reviewed head in the summary Findings comment;
  review runs read Prior-findings context (findings + resolution status) from
  the PR.
- Convergence on the motivating cycle, demonstrated empirically on
  representative real PRs: after resolving feedback and pushing, previously
  surfaced findings on unchanged code are not re-raised — including rephrased
  or line-shifted variants of them.
- A re-run over an unchanged PR produces no new findings in summary or inline
  output.
- Full-strength review is preserved for new work: code pushed to an
  already-reviewed PR that introduces a fresh issue still surfaces it
  (anchoring guard verified).
- `ns roaster review run` without PR context still works unchanged.
- Evidence: targeted tests and relevant repo checks passed.

## Definition of Progress

Progress is keepable when it does one or more of:

- Advances one roadmap Work slice as tested code in
  `ts/packages/capabilities/roaster` (or adjacent prompt-assembly/publish
  code), preserving compute layering: the core `ns roaster review run` path
  stays runnable with no PR context and no GitHub dependency.
- Adds or extends the Last-reviewed head stamping, Prior-findings context
  gathering, or convergence prompt instructions with unit tests covering the
  new behavior (prompt assembly must be unit-tested, including the anchoring
  guard and the no-context case).
- Wires PR context into the CI matrix review jobs using only the existing
  `PR_NUMBER`/`GH_TOKEN`/`pull-requests: write` surface.
- Lands the ADR draft capturing generation-time convergence,
  GitHub-as-durable-state, compute layering, and the cache/ledger rejection
  rationale.

Do not keep changes that:

- Couple the core review run path to GitHub or make PR context a required
  input.
- Add CI permissions (especially `contents: write`), new workflow triggers,
  or draft-gating changes.
- Remove or weaken the existing sha256 inline-marker exact-match dedupe at
  the publication boundary.
- Reintroduce Non-Goal machinery: compute caching/memoization, Fingerprint
  Publication ledger, Branch Memory origin distribution, or hard input-level
  delta filtering.
- Mutate real GitHub PRs (comments, threads, reviews) as a side effect of
  tests or local validation.

Useful evidence: targeted Vitest runs for touched roaster modules,
prompt-assembly unit tests exercising with-context and no-context inputs,
typecheck/lint/format per `ts/AGENTS.md`, and — for workflow edits — a diff
showing only existing env/permissions are referenced.

## Runner Policy

This Objective is execution-friendly for the Objective Runner
(`objective-autorun` / `runner-begin` → `runner-finish`) under the boundaries
below.

- **Direct execution is allowed when:** implementing a roadmap Work slice as
  code plus tests under `ts/`, writing the ADR under `docs/adr/`, or editing
  `.github/workflows/roaster.yml` within the existing permission/trigger
  surface — all validated locally before the step commits.
- **Steer or ask first when:** a slice needs new CI permissions or triggers;
  a change would alter `ns roaster review run`'s default no-context behavior
  (PR-context fetch stays opt-in via flag unless a human approves
  default-on); the summary-comment or marker format change risks breaking
  compatibility with comments already published on open PRs; or the slice is
  the empirical validation row (real PRs, LLM compute, GitHub writes — human
  drives it).
- **Open Questions:** the runner may pick a conservative Prior-findings cap
  and a resolved-vs-unresolved prompt treatment on its own, recording the
  rationale in the ADR or a Semantic Update; the local default-fetch
  question is reserved to a human (default stays opt-in).
- **How work may change files and be left:** local edits committed by the
  runner on stacked feature branches, never on `main`/`master`; no pushes,
  PR submission, or publishing — the run ends with local branches handed
  back to the normal Graphite/flow workflow.
- **Validation before keeping work:** targeted Vitest plus
  typecheck/lint/format for touched packages per `ts/AGENTS.md`; full `just`
  when a change is broad. Workflow YAML has no local runner — validate by
  inspection against the existing workflow and keep the change minimal.
- **What will not happen unless explicitly requested:** running reviews
  against real GitHub PRs, mutating GitHub state, submitting/landing/merging
  PRs, adding CI permissions, deploying, or publishing.

## Assumptions and Risks

Assumptions:

- Roaster's marker-keyed summary comments and inline threads persist for the
  life of the PR and are readable at review time with the workflow's existing
  token permissions.
- Review-thread resolution is (or becomes) the pr-address flow's signal that a
  finding was addressed, so resolution status is meaningful input.
- Prior-findings context, capped, fits comfortably in the review prompt budget
  alongside the whole diff.

Risks:

- **Soft mechanism is the load-bearing trade.** Convergence is probabilistic —
  the model may re-raise a surfaced finding despite instructions. Mitigated by
  the empirical completion criterion, the retained exact-match dedupe backstop,
  and prompt iteration. *Monitor.*
- Anchoring: supplying prior findings may bias the model to under-report
  genuinely new issues near them. Mitigated by the anchoring guard and the
  full-strength-for-new-work criterion. *Not yet de-risked.*
- Convergence state is PR-scoped: branch recreation or a new PR starts fresh.
  Accepted — a new PR arguably deserves a fresh review.
- Layering erosion: making compute PR-aware could couple the core run path to
  GitHub. Mitigated by keeping context gathering a separate optional input.

## Open Questions

- Cap and pruning policy for Prior-findings context on long-running PRs (the
  summary comment's Activity Log caps at 10 entries today; the findings list
  needs its own bound).
- Should resolved and unresolved prior findings get different prompt treatment
  (e.g. unresolved = "still open — do not repeat, may reference")?
- Should local `ns roaster review run` fetch PR context by default when a PR
  exists, or opt-in via flag?
