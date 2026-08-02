# ADR 0052: Objective Autorun PR Title Annotation

## Status

Accepted (refines ADR 0037)

## Context

Objective autorun pull requests are indistinguishable from ordinary PRs: nothing in their titles attributes them to an Objective or to their accepted autorun slice. ADR 0037 authorizes a trusted parent, after full recheck, to push exactly the bound branch and best-effort replace one managed PR body region. It does not authorize title mutation, and ADRs are immutable, so widening that contract requires this new record.

Objectives owns the naming policy. Flow owns generic Git/PR mutation and must not discover or interpret Objective records. ADR 0051 provides deterministic Text-content Points for exactly this kind of workflow-owned text format.

## Decision

Accepted autorun pull requests carry a canonical, deterministic title:

```text
[obj:<objective-slug>] [autorun:<accepted-ordinal>] <existing-title>
```

The format is the default of the Objectives-owned cardinality-one Text-content Point `objective.autorun.pr-title` (ADR 0051). The point declares the development override environment variable `NS_OBJECTIVE_AUTORUN_PR_TITLE_TEXT_CONTENT`; repositories install content through `[points]` or `.ns/text-content/objective.autorun.pr-title.txt`. The selected text's Objective-owned template grammar is exactly three placeholders — `{{objectiveSlug}}`, `{{autorunOrdinal}}`, `{{existingTitle}}` — each required exactly once. The **accepted ordinal** is the committed checkpoint's 1-based position in the accepted cumulative autorun sequence; failed or recovery attempts that produce no accepted checkpoint consume no ordinal. Retitling is idempotent: exactly one existing canonical prefix is stripped from the existing title before rendering. Rendered titles that are empty, multiline, or longer than 120 characters are refused without truncation. Template resolution, read, or render failure fails closed before any PR mutation.

Title computation is pure Objective policy: a formatter plus a hidden read-only compute command (`ns objective exec autorun-pr-title`) that grants no external-write authority. Implementation children and `runner-finish` never edit PR titles. Portable autorun (ADR 0050) remains local-only; when a separately authorized submit workflow later creates autorun PRs, the trusted parent computes titles from accepted checkpoint order and applies them at that external-write boundary.

For ADR 0037 ns-bookended publication, all existing gates are preserved, and the write contract widens as follows:

1. Read-only publication target facts include the current PR title; the title is an expected mutable fact for one invocation, never part of the durable bound target identity or authorization grant.
2. After publication recheck and before any write, Objectives resolves and renders `objective.autorun.pr-title`, deriving the accepted ordinal from the validated cumulative summary's accepted steps (`steps.length`). Failure refuses before push.
3. The publisher receives the expected current title and desired title as opaque strings. Before push, a title that differs from the expected current title (a concurrent human edit) refuses before mutation. After push, the title is recompared before the metadata edit; drift there is the existing successful-partial class because the push has already occurred.
4. One best-effort PR metadata edit updates the desired title and the merged managed body together. Failure remains `pushed-pr-update-failed` with no rollback or force push; a later cumulative publication may heal both fields.

Flow's publication surface stays generic: it reads PR title alongside existing target facts and performs one bounded title-plus-body edit. Objective slugs, point ids, and ordinal semantics never enter Flow.

## Consequences

- Accepted autorun PRs are visibly attributable to their Objective and slice, and consumers can replace the format through the shared point system.
- The parent-only trust boundary of ADR 0037 is preserved; the only widening is one additional field in the single existing best-effort PR edit, guarded by expected-title drift checks.
- Push/PR-edit non-atomicity and successful-partial semantics are unchanged.
- The Objective-definition PR is not an autorun slice and is not annotated unless it independently represents an accepted autorun checkpoint.

## Alternatives

- **Hard-coding the title format:** rejected; naming is a consumer-customizable policy and belongs at a Text-content Point.
- **LM prompt point for titles:** rejected; the format is deterministic and must be reproducible and idempotent.
- **Flow-owned title policy:** rejected; Flow must not interpret Objective records or ordinals.
- **Separate title-only PR edit:** rejected; one combined metadata edit keeps the existing single best-effort write and its partial-failure semantics.
- **Binding title into the durable authorization target:** rejected; titles are legitimately mutable between invocations and would poison future authorization state.
