# Code Changes Waived

## Summary

`/code:changes` is classified as WAIVED. It remains a read-only Pi UX helper that drafts a message-card summary from ordinary git/worktree evidence rather than a shared workflow requiring a CLI and skill.

## Objective Impact

The `/code:changes` row moved out of the NONE gap section and into WAIVED with the fallback of using `git status`/`git diff` plus a prose summary in the current harness. The remaining landing parity roadmap item now focuses on `/code:land`.

## Follow-Ups

- Continue the command-only parity audit with `/code:autoslot` next.
- If `/code:changes` later grows mutation, safety checks, or durable workflow semantics, re-open it as a parity concern instead of relying on this waiver.
