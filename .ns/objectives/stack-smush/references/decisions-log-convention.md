# Decisions-log convention

Task artifact for the **Decisions-log convention** roadmap row of the `stack-smush`
Objective. This convention defines the human-owned PR-body mirror used by the
post-submit decision loop. It is grounded in the decision-lifecycle resolution in
`../updates/2026-07-11T073927Z-decision-lifecycle-first-runs-and-grilling-resolutions.md`
and Flow's existing managed-region behavior.

## Ownership and authority

The decision record committed on the Decision PR's branch is canonical. For a Stack
Smush decision, that record is a Semantic Update under the Objective bound at
packaging time. The PR decisions log is a subordinate review surface: it presents the
pending choice where review happens and, after the human decides, mirrors the outcome
with a pointer to the committed record.

Never treat the PR block as the source from which repository state is reconstructed.
If the block and committed record disagree, correct the block from the committed
record. Do not rewrite the committed record to match PR text.

Flow owns only its `ns-pr-description` managed region. The decisions-log block must
remain outside that region and is **preserve-opaque** human-owned text: Flow preserves
it verbatim during description regeneration and does not parse, render, validate,
normalize, or delete its contents. The post-submit decide workflow owns changes to the
block.

## Block shape

A Decision PR has at most one decisions-log block, delimited by these exact marker
lines:

```markdown
<!-- ns-decisions-log:begin -->

## Decisions log

<one or more decision entries>
<!-- ns-decisions-log:end -->
```

Both markers occupy lines by themselves. Do not nest either marker, put the block
inside Flow's `<!-- ns-pr-description:begin ... -->` / `<!-- ns-pr-description:end -->`
region, or reuse these markers for unrelated notes. Span PRs do not receive a block.

When Flow first writes a managed generated region into a body that contains only
human-owned text, it places its region before that text. A decisions log can therefore
remain after the generated region. If a managed region already exists, keep the log
where it is outside that region; regeneration replaces only the managed region.

## Entry lifecycle

Each entry mirrors one recommendation presented for human judgment. Before resolution,
use this shape:

```markdown
- **Pending** — <decision stated as a concrete choice>
  - Recommendation: <recommended outcome and the decisive reason>
  - Trade-off: <credible alternative and what accepting the recommendation gives up>
```

After the human decides, first commit the canonical decision record on the Decision
PR's branch and restack descendants. Then replace `Pending` with the transition and
add the rationale and record pointer:

```markdown
- **Pending → Accepted — 2026-07-11 (@reviewer)** — <decision stated as a concrete choice>
  - Rationale: <why the human accepted the recommendation>
  - Record: `.ns/objectives/<slug>/updates/<timestamp>-<decision>.md`
```

Use `Accepted` when the human accepts the presented recommendation and `Rejected` when
they choose another outcome. `Rejected` rejects the recommendation, not the need to
make or record the decision. For rejection, state the chosen alternative in the entry
and record its rationale canonically:

```markdown
- **Pending → Rejected — 2026-07-11 (@reviewer)** — <recommendation that was rejected>; chose <alternative> instead.
  - Rationale: <why the alternative won>
  - Record: `.ns/objectives/<slug>/updates/<timestamp>-<decision>.md`
```

Use an ISO calendar date and the deciding person's GitHub handle when known. The
record pointer must identify the committed canonical record unambiguously; prefer its
repository-relative path so it remains useful in local history and review. Preserve
resolved entries as durable review context rather than deleting them.

## Update order and failure handling

The safe order is:

1. Present the pending decision, trade-off, and recommendation to the human.
2. Commit the canonical decision record on the Decision PR branch and restack its
   descendants.
3. Update the PR mirror from `Pending` to `Pending → Accepted/Rejected`, including the
   date, actor, rationale, and record pointer.

If step 3 fails, the committed record remains authoritative and the block is merely
stale; retry the mirror update. Do not flip the PR block before the record is committed,
because that creates an accepted/rejected claim with no canonical repository evidence.

## Flow compatibility evidence

`ts/packages/capabilities/flow/test/scenario/regenerate-pr-command.test.ts` exercises
PR regeneration with a complete `ns-decisions-log` block outside the managed generated
region. The scenario verifies that Flow replaces stale generated content while
preserving the block verbatim and retaining exactly one begin marker and one end
marker. This specializes the pre-existing generic guarantee that human-authored text
outside Flow's managed region survives regeneration.
