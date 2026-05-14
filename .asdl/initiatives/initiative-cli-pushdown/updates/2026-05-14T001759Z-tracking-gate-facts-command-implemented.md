# Tracking-Gate-Facts Command Implemented

## Summary

The hidden `initiative exec tracking-gate-facts <slug-or-path> --base-ref <ref>` command now collects the read-only git/worktree evidence used by `initiative-next`'s Tracking Gate: current branch, working-tree and index changes, committed changes from the explicit base ref to `HEAD`, and per-path classification into selected-Initiative, other-Initiative, and non-Initiative buckets. Both `--format json` and a compact `--format md` renderer are implemented. To support this without parsing porcelain output ad hoc, `asdl_core.git` gained a `GitPathChange` type and changed-path listing APIs (working tree, index, committed `<base>..HEAD`) on the real and fake git gateways, with parsing and listing covered by unit tests. The `initiative-next` skill already calls the new command for its Tracking Gate facts.

## Initiative Impact

PR 5's CLI half is done: the third and final command in the steelthread now exists, exercised by the live `initiative-next` skill against this Initiative's own branch. Materiality judgment, base-ref choice, and Initiative selection remain in the skill, preserving the boundary that the CLI reports facts but does not interpret them. The remaining PR 5 work is narrower than originally framed: a sweep of the other Initiative skills (`initiative-current`, `initiative-update`, `initiative-close`, `initiative`) to delegate any deterministic mechanics they still duplicate. The Assumptions section now records that tracking-gate fact collection can sit on `GitGateway` alone, which the real and fake gateway implementations confirm.

## Follow-Ups

- Audit `initiative-current`, `initiative-update`, `initiative-close`, and `initiative` SKILL.md files for repeated inventory, record-reading, closed-marker, or git-fact-gathering instructions that can now delegate to `initiative exec list`, `read-initiative`, or `tracking-gate-facts`, while preserving semantic decision rules.
- Once that audit lands, flip PR 5 to `[x]` and proceed to the final roadmap item validating the full steelthread (suite run plus any remaining test gaps for JSON contracts and Markdown renderers).
