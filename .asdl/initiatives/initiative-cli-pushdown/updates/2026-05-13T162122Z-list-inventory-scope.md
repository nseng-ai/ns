# List Inventory Scope Narrowed

## Summary

The first CLI pushdown has been narrowed: `initiative exec list` should be a pure filesystem inventory command, not a git/worktree changed-path detector and not a source of selection hints. The context-style read command is now named `initiative exec read-initiative`.

The implementation plan now starts by simplifying existing Initiative skill selection: when no explicit Initiative slug or path is supplied, the skills should list candidates and ask rather than auto-selecting from changed/touched Initiative files.

## Initiative Impact

This reduces the first steelthread's complexity and avoids unresolved semantics around whether "changed" means working tree, branch-vs-trunk, or stack-parent diff. Changed-path evidence remains in scope only for `initiative exec tracking-gate-facts`, where it directly supports `initiative-next`'s Tracking Gate.

The roadmap now makes the skill-selection simplification the first work item, followed by creating the new `asdl-initiatives` package and implementing `list`, `read-initiative`, and `tracking-gate-facts`.

## Follow-Ups

- Decide whether `read-initiative` includes raw Markdown contents by default or behind an explicit flag.
- Define the branch-diff basis for `tracking-gate-facts` separately from the pure inventory behavior of `list`.
- Add `--format md` renderers for the Initiative exec commands so agents can read common values directly without `jq`, then compare whether JSON or Markdown is better for each skill handoff.
