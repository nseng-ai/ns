# Nine-PR Stack Structure Clarified

## Summary

Clarified that the expected implementation shape for this Objective is a nine-PR Graphite stack, not a compressed three-PR stack. The nine implementation PRs are:

1. `roaster-stack/cli-profile`
2. `roaster-stack/contracts`
3. `roaster-stack/run-storage`
4. `roaster-stack/dashboard`
5. `roaster-stack/triage-runner`
6. `roaster-stack/dry-run`
7. `roaster-stack/graphite-gateway`
8. `roaster-stack/resolver-loop`
9. `roaster-stack/docs-closeout`

Each PR has one human-legible thesis and should remain independently reviewable with focused tests or validation evidence. If an implementation orchestrator previews or executes only a subset at once, it should use contiguous windows of this stack and preserve the durable order instead of merging unrelated decisions into fewer PRs.

## Objective Impact

The Objective now records the explicit implementation branch/PR structure in `objective.md` and annotates each roadmap row with its expected implementation branch, dependency context, and review boundary. This update changes execution guidance only; no product scope or completion criteria changed.

Evidence: user clarified that the intended implementation should be closer to the nine roadmap rows than to a compressed three-PR plan. The saved planned-branch document at `~/.asdl/planned-branch/plans/gh--dagster-io--asdl-tools/master/roaster-graphite-stack-workflow.md` also organizes implementation phases across the same semantic areas: CLI/profile, contracts, Branch Memory storage, dashboard, triage runner, dry-run/orchestration, Graphite gateway, resolver loop, and docs/closeout.

## Follow-Ups

- Future `objective-stack-impl` previews should use this nine-PR structure as the durable target when the user asks to flesh out the whole stack.
- If a later implementation session discovers a stronger reason to split or merge branches, record that decision as a Semantic Update before changing the stack shape.
