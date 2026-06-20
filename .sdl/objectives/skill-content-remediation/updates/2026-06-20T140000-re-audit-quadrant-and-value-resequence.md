# Re-audit: lift×risk quadrant, value(reach) axis, and re-sequence

## Summary

Re-audited the per-skill remediation queue and replaced the old "≥5 single
score" cut line with a **(lift × risk) quadrant** plus a new **value (reach)**
axis, re-ranking targets by **value = lift × reach × stakes − risk**. The
method decided 2026-06-20 (from-scratch rewrite gated by
extract-contract-then-diff) stands, but it is no longer applied uniformly: it is
the technique for the high-lift/low-risk quadrant, while other quadrants take
different techniques. Seven conclusions:

1. **Cut line → quadrant.** Rank by quadrant, not a single score:
   high-lift/low-risk → from-scratch rewrite; high-lift/high-risk +
   safety-critical → **surgical, not from-scratch** (`code-gt-restack-resolve`,
   `code-resolve-merge-conflicts`); low-lift/high-risk → **drop** (leave as-is).

2. **`branch-context-impl` drops off the list** (it was the tentative "next"
   rewrite target). At 36 lines, lift 1 / risk 4: its only disclosable block is a
   6-trigger STOP safety contract, so disclosing it is net-negative and a rewrite
   most likely silently softens the safety contract. Leave as-is.

3. **Value ≠ lift.** Weight targets by reach — invocation frequency and
   always-loaded-ness. Descriptions are always-loaded; bodies and reference trees
   load only on invoke; reference-tree tokens dwarf SKILL.md tokens. A high-lift
   SKILL.md change on a rarely-invoked skill is low value.

4. **The highest-value single action is NOT a rewrite.** It is merging
   `python-fake-driven-testing`'s `references/quick-reference.md` +
   `workflows.md` (~200 lines off a 6.4K-line tree that loads on most Python
   tasks). This **resolves the standing Open Question: YES, merge** those two
   reference files. `dignified-python`'s 4.5K tree does *not* need consolidation
   (its version files are independent) — only its SKILL.md router (stated 3×)
   needs collapsing.

5. **Lift-vs-value gaps.** `ccc-available-work` / `ccc-stack-map` top the lift
   table (5 / 4) but are cmux-niche, so they de-rank by reach.
   `python-fake-driven-test-layout` is lift 4 but a rarely-consulted scaffolding
   reference → low value; it is kept ONLY as the safe, mechanical method pilot.

6. **Per-skill techniques diverge.** `pr-address` → prune-to-stub (tombstone);
   `code-gt-restack-resolve` → remove the externally-gated TEMPORARY TS-toolchain
   block, then surgical (rigid output contract + conflict-resolution stakes make
   from-scratch wrong); `objective-close` → surgical (already clean, lift 1);
   `sdl-submit` → move the env-var catalog to a reference file.

7. **New elevation candidates** (clarity/sprawl, not duplication): `brmem`
   (296 ln, high blast radius), `objective` (126 ln), and
   `code-resolve-merge-conflicts` (safety-critical → surgical).
   `ccc-branch-triage` and `handoff-pickup` stay parked.

**Re-sequence (value-adjusted order for future sessions).** After the
`python-fake-driven-test-layout` method pilot: `handoff-create` (lift 4 / risk 1,
verbatim 25-line template, cheap high-value win) → the pftd reference-tree merge
(the value standout, a separate workstream from any SKILL.md rewrite) → the
objective family (`objective-refresh`, `objective-update`, `objective-create`;
high reach, accept risk 3 once the gate has 2–3 passes behind it) → ccc / niche
skills last, only if cheap. Safety-critical skills take the surgical path, never
from-scratch.

These conclusions were carried in a handoff (`pilot-skill-rewrite-on-test-layout`)
and are persisted here so they survive past that handoff. This update records the
decision only; the `python-fake-driven-test-layout` pilot rewrite itself is a
separate change.

## Objective Impact

- `objective.md` Thesis: the "Per-skill method" paragraph now notes the
  from-scratch rewrite is the technique for the high-lift/low-risk quadrant, not a
  uniform method; quadrant + value(reach) selection governs which technique and
  order each target gets.
- `objective.md` Scope: the per-skill bullet now states technique is
  quadrant-selected (from-scratch for safe/high-lift; surgical for
  safety-critical; prune-to-stub / move-to-reference for others) and sequenced by
  value (reach), not lift. The top-targets list dropped `branch-context-impl` and
  added the new elevation candidates (`brmem`, `objective`,
  `code-resolve-merge-conflicts`).
- `objective.md` Assumptions and Risks: added the value-ranking model
  (value = lift × reach × stakes − risk; lift ≠ value) as an assumption, and the
  "safety-critical → surgical, never from-scratch" guard as a risk-driven rule.
- `objective.md` Open Questions: the `python-fake-driven-testing` reference-tree
  question is **resolved — merge** `quick-reference.md` + `workflows.md`.
- `roadmap.md`: the rewrite row reframed to quadrant/value sequencing;
  `branch-context-impl` moved to a dropped note with rationale; per-target
  techniques annotated (`code-gt-restack-resolve` / `objective-close` /
  `code-resolve-merge-conflicts` → surgical; `pr-address` → prune-to-stub;
  `sdl-submit` → move-to-reference); new elevation candidates added; the pftd
  reference-tree merge added as its own work item (the value standout).

No change to what any skill *does* — this is a sequencing/method-selection
decision, not implementation.

## Follow-Ups

- Execute the `python-fake-driven-test-layout` from-scratch pilot (the safe,
  mechanical method-validation target) — the companion change to this update.
- Then `handoff-create` (cheap high-value win), then the pftd reference-tree
  merge (highest value; separate workstream).
- The contract-diff gate's catch-power is still unproven (only ever passed); watch
  for the first rewrite where it must reject a behavior drop.
