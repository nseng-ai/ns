# Consumer surfaces retired

## Summary

Following the `nscc` host deletion, the remaining standalone cmux observational
workflows were re-evaluated and retired rather than consolidated. The canonical
`ns-cmux-available-work`, `ns-cmux-branch-triage`, and `ns-cmux-stack-map` skills,
their harness mirrors and invocation metadata, their generic Pi backing-command
registrations, and their consumer-only observational convention were removed. The
documentation cmux catalog now points at the independently live
`/ns:cmux:workspace:open-branch` command.

## Objective Impact

This product decision removes every intended consumer of the proposed occupancy
manifest and invalidates the Objective's core assumption that a shared manifest should
serve those three workflows. No inventory command or gateway was implemented; the
Objective is intentionally abandoned and closed with its roadmap rows canceled.

The broader `@nseng-ai/cmux` capability and the structured
`ns slot gt exec stack-branches` / `stack-map-branches` operations remain because repo
evidence found independent consumers. Validation after the removal completed with
`areg check`, 26 focused backing-skill registry tests, and the full `just` suite (518
files and 5,363 default-lane tests, plus the TypeScript style guard).

## Follow-Ups

No replacement occupancy helper is planned. A future concrete consumer should justify
new inventory work from its current requirements rather than reviving this
consumer-less abstraction.
