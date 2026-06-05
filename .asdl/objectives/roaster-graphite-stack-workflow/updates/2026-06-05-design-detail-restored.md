# Design Detail Restored

## Summary

Restored the concrete design-session detail from the saved planned-branch plan into this Objective so future autonomous execution does not depend on hidden conversation or plan-store context.

The Objective now includes the settled product decisions, repository facts, Branch Memory key contract, triage/resolver frontmatter schemas, dashboard and generated PR marker contracts, Graphite/agent-runner boundary guidance, orchestration hard stops, likely files/tests, and validation expectations. The roadmap now expands each semantic slice with implementation details and evidence requirements.

## Objective Impact

This changes the Objective from a concise roadmap into an execution-ready source of truth for `objective-stack-impl`. It does not mark implementation work complete; it increases autonomy and reduces the risk that runner agents miss important design constraints from the original planning session.

Evidence: restored from local saved plan `~/.asdl/planned-branch/plans/gh--dagster-io--asdl-tools/master/roaster-graphite-stack-workflow.md`; current branch parent is `master`; PR #942 currently contains only the Objective draft files.

## Follow-Ups

- Use this Objective and roadmap, not the saved planned-branch file, as the implementation-session source of truth.
- If implementation reveals a different real agent-runner or PR body editing design, record the decision in a future Semantic Update before broadening scope.
