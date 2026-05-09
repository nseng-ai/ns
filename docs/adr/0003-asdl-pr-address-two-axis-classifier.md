# asdl-pr-address uses a two-axis classifier, not a flat label list

The `pr-address` Skill classifies every **Feedback Item** along two axes rather than one: a binary **Classification** (`actionable` vs `informational`) for whether the Item owes a code change at all, and — for `actionable` Items only — a five-value **Complexity** (`pre_existing`, `local`, `single_file`, `cross_cutting`, `complex`) for how big the change is. The numbered Batches the Skill executes against are mechanically derived from Complexity values; they carry no domain meaning beyond Complexity itself.

We chose two axes because a single flat label set entangles two unrelated questions: "must we touch code?" and "how invasive is the touch?" Conflating them produces labels like `actionable_local`, `actionable_complex`, `informational`, `informational_pre_existing`, where the meaningful state space (3 × 2 + extras) is hidden behind ad-hoc names. The split also lets auto-execution gating live cleanly on Complexity — the lower three values run without per-Item prompts, the upper two require user approval — independent of the Classification call.

## Consequences

- The classifier reference doc and the **Invocation** flow can talk about Classification and Complexity as orthogonal decisions; reviewers and contributors do not have to memorise a mixed label set.
- New Complexity values can be added without touching Classification semantics, and vice versa.
- "Informational with Complexity" is not representable, by design — `informational` Items have no Complexity because the Tool does no code work for them. If we ever want to record a size hint on informational Items (e.g. for analytics), this ADR should be revisited.
- Batches stay an internal mechanical grouping; user-visible vocabulary in the Skill prose and CONTEXT.md is Classification + Complexity, not Batch numbers.
