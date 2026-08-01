# Blocked Objectives

Load this reference when the selected Objective's Record Frontmatter carries a `blocked:` sentence.

A Blocked Sentence means the record is blocked, not closed (semantics: the `objective` umbrella skill); it is neither a reason to stop nor something to ignore.

1. Read the Blocked Sentence and the record's `edges:` entries. Edges are mirrored and kind-less; direction and causality live only in the Edge Annotation prose.
2. Judge which edge counterpart, if any, the Blocked Sentence points at. If one plausibly does, read that counterpart's `objective.md` and `roadmap.md` enough to name the concrete work that would unblock the selected Objective.
3. Shape the recommendation with judgment rather than a fixed rule:
   - If a counterpart Objective would unblock this one, recommend advancing it — name the counterpart slug and the specific unblocking step — alongside any work within the selected Objective the blocker does not gate.
   - If the blocker is external and no counterpart applies, say so, and recommend only non-gated work or state that no useful work remains until the gate clears.
   - If evidence shows the Blocked Sentence is stale (the blocker already satisfied), route through the `objective-update` workflow for the selected Objective to clear it, then continue.
4. Execution paths stay scoped to the selected slug. To execute unblocking work under a counterpart Objective, restart Objective resolution with that counterpart as the explicit selection; do not silently switch Objectives mid-flow.
