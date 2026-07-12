# Cmux reshape execution extracted to an autoobjective

## Summary

The remaining execution of the cmux reshape — slices 2–6 of the ratified
`cmux-reshape-execution-stack` plan plus the stack's trust-nothing closeout —
was extracted 2026-07-12 into the new bounded autoobjective
`execute-cmux-reshape-spec`, connected by a mirrored Objective Edge. The user
chose extraction so the stack can be pursued autonomously through repeated
`ns objective exec runner-step` slices with parent checkpoints, instead of
hand-driven execution sessions.

This is the first invocation of the reshaping handoff vehicle's "New Objective"
escape hatch (`docs/wayfinding/ontology-reshape/reshaping-handoff-vehicle.md`),
named at decision time as "name the exception when hit": the qualifying trait
here is autonomous multi-step pursuit, not expected discoveries. The vehicle's
saved-plan pipeline is unchanged — the attached branch-context plan
(`cmux-reshape-execution-stack.md` on `cmux-reshape/trim-flow-facade`) remains
the execution authority; the extracted record is the runner-facing tracking
shell around it, carrying the Runner Policy, Definition of Progress, and
runner-sized rows the plan itself could not.

Drive decision ratified with the extraction: slices 2–5 are direct-execution
runner rows; slice 6 (glossary-and-docs) runs direct with one escalation — the
`Project-local adapter` keep/retire disposition — since ADR 0034 already
ratified every other term disposition.

## Objective Impact

- The "Execute the cmux reshape spec" task row stays `[~]` here but no longer
  tracks slice-level progress; it resolves when `execute-cmux-reshape-spec`
  closes. Slice 1's completion evidence
  (`updates/2026-07-12-cmux-reshape-slice-1-executed.md`) remains this record's
  history; the extracted record carries slice 1 as a pre-extraction `[x]` row
  for stack continuity.
- Record Frontmatter gained the mirrored edge to `execute-cmux-reshape-spec`.

## Follow-Ups

- Drive the extracted record via `objective-runner-step` / `objective-autorun`
  from `cmux-reshape/trim-flow-facade` (runner preconditions need the tracking
  and extraction files committed — clean worktree).
- On its closure, resolve this row and judge whether the method-log Fog gains
  an entry about the hatch's first use.
