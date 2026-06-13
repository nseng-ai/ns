# Code Push Reclassified Partial

## Summary

After restacking the parity branch onto current `master`, the upstream `/code:push` command became part of the package-owned Pi command inventory and needed typed parity metadata.

`/code:push` is classified as PARTIAL. It is a mutating remote-state helper over primitive `git status` plus `git push`: Pi adds a clean-worktree guard and bounded output rendering, while non-Pi agents can run the underlying git primitives directly. No installed skill currently owns the guarded workflow.

## Objective Impact

The parity table and roadmap now include `/code:push` as a PARTIAL row. The immediate CI failure was caused by the typed parity gate correctly detecting a live command without co-located metadata on the PR merge ref.

## Follow-Ups

- Decide whether `/code:push` should get a thin skill documenting the clean-worktree guard or be treated as primitive git usage with a deliberate WAIVED/FULL disposition.
- Keep `/code:push` distinct from `/code:submit`; it must not imply Graphite submit or PR metadata updates.
