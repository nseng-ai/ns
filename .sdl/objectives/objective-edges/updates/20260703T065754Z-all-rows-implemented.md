# All roadmap rows implemented; closure gated on landing

## Summary

The vocabulary row is complete on local branch `objective-edges-vocabulary` (verified
runner-step commit): root `CONTEXT.md` gained exactly the enumerated system terms (Record
Frontmatter, Objective Edge, Edge Annotation, Blocked Sentence) plus the state-cluster line
(open/closed is lifecycle, active/archived is location, blocked is a sub-state of open), and
the `@sdl/objective` `CONTEXT.md` gained the EDGES-column and edge-linting surface terms. The
objective-next confirmed-execution reference received the same one-line blocked+edges
clarifier the other Objective skills got. With this, all seven Work rows are implemented as a
seven-branch Graphite stack on top of `add-objective-frontmatter-edges` (ADR → reader →
linter → list rendering → skills → seed → vocabulary), each row a verified runner-step commit.

## Objective Impact

Roadmap Work is fully implemented locally; the seed acceptance test passes end-to-end. The
Closure Gate is deliberately not taken: Completion Criteria are phrased as landed ("runs in CI
via `just`", "entries and the ADR are landed") and every branch is local-only — PR submission
happens through the normal Graphite/flow workflow on explicit request per Runner Policy, and
landing never happens from a run. Remaining open question untouched: whether any consumer
needs frontmatter awareness beyond stripping (`load-orientations`, Pi presentation surfaces);
the ADR-number-at-landing question resolves itself if no unrelated ADR claims 0025 first.

Reported drift for a future context session (not fixed, per repo rules): CONTEXT-MAP.md's
root-context description line enumerates term inventory and now lags the four new terms.

## Follow-Ups

- Submit the seven-branch stack as PRs (one per row) on explicit request; close the Objective
  after landing evidence (CI sweep green on trunk) is in hand.
- CONTEXT-MAP.md root-context description refresh.
