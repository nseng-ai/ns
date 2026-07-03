# Code Push Graphite Metadata Caveat

## Summary

A follow-up audit for the `add-preflight-detect-and-skip-empty-branches` submit failure found no repository workflow path that invokes raw `git push --force-with-lease`. The risky reachable path is broader: `sdl flow push` / `/sdl:flow:push` runs plain `git push`, which can still move a Graphite-tracked PR branch outside `gt submit` when used on the wrong branch.

The push command remains a git-only helper for non-Graphite branch pushes. Its help text, Pi mirror description, Flow dependency docs, and related agent guidance now explicitly say it does not update Graphite metadata and must not be used for Graphite-tracked PR branches. Graphite PR updates should go through `sdl flow submit` or `gt submit --no-interactive`.

## Objective Impact

The parity table keeps `/code:push` PARTIAL, but the row now records the Graphite metadata boundary: primitive `git push` is acceptable only for non-Graphite branch pushes. This does not close the roadmap decision about whether push gets a thin skill or a deliberate primitive-git disposition.

## Follow-Ups

- If `/code:push` gets a thin skill, include the same Graphite-tracked PR branch prohibition.
- If a future implementation wants an automatic guard, it must preserve the command's intended git-only dependency tier or make an explicit design decision to add Graphite detection.
