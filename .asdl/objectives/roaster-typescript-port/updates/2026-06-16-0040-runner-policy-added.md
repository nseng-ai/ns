# Runner Policy Added

## Summary

The roaster TypeScript port Objective now has durable execution-friendly policy for `objective-stack-impl`. The new `## Definition of Progress` explains what counts as keepable progress, what not to keep, and what evidence is useful. The new `## Runner Policy` allows confirmed stacks of 1 to 3 independently reviewable PRs, including more than one adjacent roadmap item when the items form a clear dependency chain, while preserving stop/ask boundaries for workflow cutover, live GitHub writes, real Claude Code gates, Python deletion, and cross-package runtime conventions.

The roadmap was also reshaped to make the remaining CLI parity work executable in reviewable slices: `review list` discovery, `review run` orchestration, and hidden `exec` command wiring are now separate rows with row-level policy and evidence guidance.

## Objective Impact

This does not implement more roaster behavior by itself, but it makes the remaining work easier for `objective-stack-impl` to execute safely. A future runner can propose a multi-PR stack that advances multiple adjacent CLI parity slices in one confirmed preview, then update the Objective before continuing to CI cutover or deletion.

The Objective remains open. CLI parity, CI cutover on a real PR, and Python package deletion remain incomplete.

## Follow-Ups

- Use the new policy to propose a `review list` / `review run` / hidden `exec` stack when invoking `objective-stack-impl`.
- Keep workflow cutover and Python deletion behind explicit previews and evidence gates.
- Continue writing Semantic Updates after meaningful implementation progress.
