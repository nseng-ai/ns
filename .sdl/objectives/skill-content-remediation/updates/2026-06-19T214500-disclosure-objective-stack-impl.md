# Disclosure surgery — objective-stack-impl end-of-run sections disclosed

## Summary

Started the disclosure-surgery roadmap row with its top audit target,
`objective-stack-impl` (the largest always-loaded SKILL.md at 282 lines). Two sections
that only the finalize/stop branch of a run ever reaches — "Stack implementation digest
telemetry" and "Final response requirements" (the `## Stack implementation digest`
template) — were moved verbatim into a new
`skills/objective-stack-impl/references/final-response.md` and replaced by a short
`## Final response` context pointer.

The pointer wording names the concrete trigger that should reach the reference: "When you
hit a stop condition and are about to write the final response, read
`references/final-response.md` first." Behavior is unchanged — the emitted digest
structure and the `objective exec runner-subagent-usage` telemetry procedure are
identical, just relocated off the always-loaded path. SKILL.md dropped 282 → 217 lines.

## Objective Impact

- Disclosure-surgery roadmap row moved `[ ]` → `[~]`: `objective-stack-impl` done;
  `branch-context-impl`, `enriched-plan-save`, `dignified-python`, and
  `python-fake-driven-testing` remain.
- Assumption #3 (disclosure helps only when the pointer wording names the concrete
  situation that should reach it) exercised on a real case and left active for the
  remaining targets.
- Evidence: `areg check` "All skills OK"; `dprint check` clean on both touched files; no
  external contract keys on the moved headings — only the CLI command name
  `objective exec runner-subagent-usage` is cross-referenced elsewhere and is unchanged.
  Done on branch `disclose-objective-stack-impl`.

## Follow-Ups

- Continue disclosure surgery on the four remaining skills. For `python-fake-driven-testing`,
  the open sub-decision stands: consolidate its 11-file reference tree (e.g. merge
  `quick-reference.md`/`workflows.md`) or only sharpen overlapping pointers.
- Duplication-collapse row (~9 skills + residual body work in
  `sdl-submit`/`objective-close`/`objective-create`) remains untouched.
