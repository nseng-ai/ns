# python-fake-driven-testing reference tree merged

## Summary

Merged the overlapping `python-fake-driven-testing` quick-reference/workflow surface into a single reference file. The deleted file was `skills/python-fake-driven-testing/references/quick-reference.md`; its live lookup content now lives at the top of `skills/python-fake-driven-testing/references/workflows.md` as a compact Quick Lookup section covering test placement, file locations, common fixtures/patterns, layer distribution, and useful commands.

`skills/python-fake-driven-testing/SKILL.md` now routes feature work, bug fixes, and quick placement/command lookup directly to `references/workflows.md` instead of telling agents to load both `quick-reference.md` and `workflows.md`. No other `quick-reference` pointers remain under `skills/python-fake-driven-testing`.

This was a reference-tree consolidation, not a behavior change to the skill's testing architecture. The merge preserves the practical quick-lookup contract while removing the duplicated decision-tree / file-location / command surface that forced agents to load two overlapping files for common Python fake-driven testing tasks.

Verification evidence: `areg check` reported `All skills OK`; `git diff --check` passed; `just dprint-check` passed after `just dprint-fix` formatted the new Markdown tables. Working-tree diff for this slice is `SKILL.md` pointer update, deletion of `quick-reference.md`, and expansion of `workflows.md`.

## Objective Impact

- The standalone roadmap row **`python-fake-driven-testing` reference-tree merge** is now `[x]`.
- The per-skill remediation row still stays `[~]`: `python-fake-driven-testing`'s SKILL.md rewrite remains a separate target, and many other per-skill remediations remain open.
- The value-ranking assumption was exercised on the Objective's highest-value non-rewrite action: reference-tree tokens were reduced before lower-value niche rewrites.
- Closure is not ready. Active non-parked roadmap work remains, especially `handoff-create`, the objective-family rewrites, and the remaining rewrite/surgical/prune/move targets.

## Follow-Ups

- Continue the remaining value-adjusted sequence with `handoff-create` as the next cheap high-value rewrite candidate.
- When rewriting `python-fake-driven-testing`'s SKILL.md later, treat `workflows.md` as the single home for quick lookup plus task workflows; do not recreate a separate quick-reference file unless a new branch-specific need appears.
