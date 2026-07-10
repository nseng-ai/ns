# Autorun resolved all four agent-alone task rows; code-smush skill now exists

## Summary

A four-step autonomous Objective Runner run (2026-07-10, one verified commit per
step, stacked off `add-stack-smush-autonomous-policy`) resolved every open
agent-alone task row on the Frontier:

1. **Commit-message narration convention** —
   [`references/commit-narration-convention.md`](../references/commit-narration-convention.md):
   narrated intent with "chose X over Y because…" why-prose and an explicit
   no-self-classification rule; one coherent semantic step per commit with choices
   separated from mechanical fallout (finer-over-smeared, since packaging can merge
   but not split); tip-green required, interior span commits may be red, boundary
   greenness owned by packaging.
2. **CCC disjoint-scope dispatch proposal** —
   [`references/ccc-disjoint-scope-dispatch-proposal.md`](../references/ccc-disjoint-scope-dispatch-proposal.md),
   grounded in the real cmux dispatch surfaces; options-plus-recommendation on scope
   claims (advisory overlap check at dispatch, join conflict stays ground truth),
   declared narrative join order with barrier join and fold-to-run, and
   redo-by-default serialization of falsified pieces. The dispatch design decision
   itself remains a live decision.
3. **Slice-map ratification surface proposal** —
   [`references/slice-map-ratification-surface-proposal.md`](../references/slice-map-ratification-surface-proposal.md):
   a derivation contract (Slice Map re-derived from the packaged stack on every
   render, never stored), a grounded survey of the real candidate surfaces, and a
   v1 recommendation of a read-only smush map mode with evidence-gated nscc/CLI
   graduations; reshaping flows back only as a prose re-invocation of smush. The
   final surface choice stays with the user.
4. **Smush skill authoring** — first-party skill at
   [`skills/code-smush/SKILL.md`](../../../../skills/code-smush/SKILL.md)
   (invocation kind `invoke-only`), encoding the resolved mechanics end to end:
   propose-first Slice Map readback, backup refs, metadata-only slicing,
   per-boundary `just` validation in temporary worktrees, explicit Span Squash
   preserving decision why-paragraphs, fold-without-close repackaging with loud
   orphaned-PR reporting. It fixes the mechanically parseable branch-name grammar
   `<run>--<NN><c>-<slug>` (`c` ∈ {`d`,`s`}) that the slice-map proposal required —
   a durable decision the pending viewing-surface choice can now evaluate against.
   Full `just` validation passed on the skill-authoring slice (dprint, oxlint,
   tsgo, vitest, objective check sweep).

## Objective Impact

The Frontier now holds exactly one open row: the **Repackaging under change**
prototype, which resolves only through live exchange. Packaging exists as an
invocable workflow, so Completion Criterion 2 (prove on real work) is actionable:
the first supervised real run of `code-smush` on a finished Commit Run is both the
proof vehicle and the evidence gate for the parked deterministic push-downs. New
scope noted for the prototype row's territory: the skill uses `gt rename` for the
tip slice's grammar name, verified from gt 1.8.6 help text but not yet exercised
in a scratch repo — rename semantics under a live PR association belong to the
prototype's observations. New Fog recorded in `objective.md`: run-piece completion
signalling and slot lifecycle at the CCC join (dispatched slots are not reclaimed
automatically today; the join wants piece slots released first).

## Follow-Ups

- Live decisions queued for the user: CCC dispatch design (proposal ready),
  slice-map viewing surface (proposal ready, grammar now fixed).
- First supervised real run of `code-smush`, folding the `gt rename` observation
  into it or into the repackaging prototype.
- The four step branches remain local only; submit/land is a separate,
  user-authorized workflow.
