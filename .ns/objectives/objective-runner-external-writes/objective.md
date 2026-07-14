---
edges:
  - objective: cloud-dispatch-thermo-followups
    annotation: Proves the narrowly authorized publish-capable Objective Runner path needed before that Objective can autorun local commits directly onto its existing PR while keeping the implementation child credential-blind.
---

# Objective Runner External Writes

## Thesis

Objective Runner should be able to publish verified work without erasing the safety boundary between an implementation child and trusted orchestration. Prove the thinnest real path: during one explicitly authorized autorun invocation, after each successful Runner step and parent checkpoint judgment, the trusted orchestrator may push the bound current branch and best-effort regenerate a cumulative managed Objective Runner section on that branch's existing PR.

The implementation child remains credential-blind and forbidden from external writes. Publication happens only after `runner-finish` has verified and committed the slice, the parent has recorded any material Objective impact, and the same parent has supplied the PR-ready summary. This revises ADR 0022's absolute no-push/no-PR-mutation consequence without weakening its runner-owned commit, verified/claimed checkpoint, or parent-judgment boundaries.

## Scope

- A two-key publication gate: durable permission in the selected Objective's `## Runner Policy`, plus an explicit launch flag that attests the parent checked that policy.
- One-invocation authorization bound to one Objective slug, current branch, and already-existing PR; it expires when that autorun ends.
- A post-checkpoint publisher owned by trusted parent orchestration. It uses existing host Git/GitHub credentials only after a verified local commit and any parent-authored Objective tracking commit.
- Guarded fast-forward publication of the bound current branch and an idempotently regenerated managed PR-description section that preserves all non-managed text.
- A cumulative managed section containing the Objective slug, published step commits, validation outcomes, and every runner-judgment decision that would otherwise have required escalation. Durable rationale is recorded under the selected Objective before or alongside publication; the PR section is its review-facing summary.
- Objective-owned eligibility and summary policy composed with Flow-owned Git/PR mutation mechanics through a curated capability boundary, not private cross-package imports or duplicate raw command orchestration.
- An explicit amendment to the Objective Runner ADRs, skills, tool contract, and tests so the new authority is visible and fail-closed rather than an `exec` loophole.

## Non-Goals

- No external-write authority for the implementation subagent, and no credential injection into its process.
- No PR creation, full-stack submission, restacking, merge/land, release publication, deployment, issue mutation, or arbitrary write API.
- No persistent or repository-wide authorization; no grant surviving the named autorun invocation.
- No automatic remote rollback after a partial publication and no force-push workflow in the steel thread.
- No PR-comment stream and no replacement of the full human-authored PR body.
- No machine parsing of Runner Policy prose and no new Objective tag, frontmatter key, registry, or hidden authorization database. The launch flag is the trusted parent's attestation that the durable policy key was checked.
- No dedicated short-lived token infrastructure in this thread; scoped credentials remain a follow-up if host credential use proves too broad.

## Completion Criteria

- One real Objective Runner autorun invocation, explicitly opted in by both Runner Policy and launch flag, completes at least one implementation step on a non-trunk branch with an existing PR.
- The verified Runner commit and any parent-authored Objective tracking commit are pushed to exactly the branch bound at launch; the implementation child performs no external write and receives no publication credential.
- The existing PR retains its non-managed prose and receives a cumulative managed Objective Runner section containing the Objective slug, published commit evidence, validation, and any parent-judged escalatable decisions.
- Missing policy attestation, absent/mismatched PR, branch or Objective drift, dirty or unverified state, and attempts to target another PR fail before external mutation.
- A PR-description failure is reported precisely but remains best-effort: it does not invalidate a successful branch push or otherwise successful autorun, and it never triggers automatic rollback. A later successful update regenerates the full managed section and can heal the stale summary.
- ADRs and runner/autorun guidance describe the conditional parent-only publication path while preserving the child prohibition and the existing checkpoint trust model.
- Targeted fake-driven tests, relevant integration/scenario tests, native TypeScript checks, and `just` pass for the landed thread.

## Definition of Progress

Progress is keepable when:

- Each slice preserves the implementation child's absolute external-write prohibition and leaves publication in the trusted post-checkpoint orchestration path.
- Authorization facts are explicit and bound to the selected Objective, current branch, existing PR, and one invocation; mismatches fail before mutation.
- Remote effects sit behind narrow Consumer Gateways with in-memory fakes, while Flow remains the owner of reusable Git/PR mutation mechanics and PR-body preservation.
- Tests cover both successful ordering and partial-state failures, especially push success followed by PR-update failure.
- Documentation and ADR edits distinguish verified runner facts, parent judgment, durable Objective rationale, and review-facing PR summary.

Do not keep changes that:

- Give the child credentials or permit it to run push, submit, or PR-mutation commands.
- Parse Markdown policy meaning, add Objective machine state, or persist authorization beyond the invocation.
- Broaden the thread into PR creation, stack submission, force-push, merge, deployment, or arbitrary external writes.
- Reach from Objectives into Flow private modules or duplicate Flow's command orchestration when a curated capability seam is the correct boundary.

Useful evidence includes denial-path scenario tests, fake call ordering, an integration test against disposable Git/GitHub substitutes where practical, and the final explicitly authorized existing-PR live probe.

## Runner Policy

This is an autoobjective: `objective-next` / Objective Runner may execute one bounded local roadmap slice at a time and leave a verified local commit for parent judgment.

- Direct execution is allowed for local code, tests, ADRs, skills, and Objective tracking within the selected slice after an execution preview.
- The Runner may choose implementation details within the settled Thesis, Scope, Definition of Progress, and roadmap. It must record any decision that would otherwise have required escalation as durable Objective rationale and include PR-ready wording in the parent publication summary.
- Steer first if a slice would expose credentials to the child, parse Objective prose as schema, widen publication beyond one bound existing PR, weaken pre-mutation checks, introduce force-push/rollback, or change the ownership boundary between Objectives and Flow.
- Local validation required by the row and relevant repo instructions must pass before keeping a slice. The runner-owned commit and parent checkpoint remain mandatory.
- Until this Objective's steel thread itself lands, all implementation steps remain local-only under the current Runner prohibition. The final live probe requires a fresh explicit authorization naming the test Objective, branch, and existing PR.
- No push, PR mutation, submission, merge, deployment, publishing, or other external write occurs merely because this Objective is execution-friendly; only the final confirmed probe may exercise the new path.

## Assumptions and Risks

Assumptions:

- A trusted parent can safely attest that it read durable Runner Policy through an explicit launch flag without the CLI interpreting Markdown semantics.
- The current branch can be pushed as a normal fast-forward after runner-owned and parent-owned commits; the steel thread does not require Graphite stack submission or remote-history rewriting.
- Flow's existing guarded push and PR-description orchestration can be exposed or composed through a curated capability boundary without moving Objective policy into Flow.
- A cumulative managed PR section supplied by parent judgment is sufficient to heal missed best-effort description updates on a later successful attempt.

Risks:

- **Authorization confusion:** a launch flag could be copied to the wrong branch or PR. Mitigation: resolve and bind slug, branch, PR number/head, and launch baseline before mutation; re-check them at publication.
- **Partial publication:** Git push and GitHub PR edit cannot be atomic. Accepted shortcut: continue after a precisely reported PR-edit failure and treat the summary as best-effort. Upgrade: durable reconciliation/retry state or a required final coherence gate if dogfooding shows stale summaries are common; retire the pair together.
- **Credential blast radius:** existing host credentials may exceed the branch/PR scope. Mitigation: only trusted orchestration invokes narrow operations after verification. Upgrade: short-lived branch/PR-scoped credentials if a practical provider exists or dogfooding shows host credentials are unacceptable.
- **Package-boundary leakage:** de-risked for the Flow seam. The guarded push and managed PR-body mechanics are exposed through `@nseng-ai/flow/api` with narrow Consumer Gateways; Objectives can compose that curated API without reaching into private submit implementation.
- **Audit drift:** the PR summary could diverge from durable Objective rationale. Mitigation: parent judgment writes the Objective first and regenerates a cumulative managed section rather than appending opaque step logs.

## Open Questions

- Exact CLI/tool flag spelling and the parent-held authorization payload shape are implementation details to settle within the first roadmap slice; they must preserve the decided two-key, one-invocation semantics.
- Whether host credential breadth warrants the parked scoped-token upgrade after live dogfooding.
- Whether best-effort PR summaries produce enough stale-state incidents to promote final reconciliation from the parked upgrade into required policy.
