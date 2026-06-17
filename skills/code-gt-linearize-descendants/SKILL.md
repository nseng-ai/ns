---
name: code-gt-linearize-descendants
description: Use when the user asks to linearize, reorder, consolidate, or collapse descendants of a specific Graphite stack branch; identify independent descendant PRs; or clean up accidental Graphite stack forks. Produces a proposal first, then mutates only after confirmation.
---

# code-gt-linearize-descendants

Linearize descendant PRs above a named Graphite stack branch. This workflow is safe-by-default: inspect first, propose a compact final stack, ask once for confirmation, then perform supervised stack rewrites.

## Safety contract

- Planning is read-only.
- Ask for confirmation before any mutation.
- Require a clean worktree before mutation.
- Create timestamped local backup refs for all affected branches before mutation.
- Never close GitHub PRs automatically; only report close candidates.
- After a successful local rewrite and clean status, run `gt submit --no-interactive`.

## Procedure

1. Identify the target branch from the user request.
2. Generate the read-only proposal:

   ```bash
   asdl exec gt-linearize-stack-plan <target-branch> --format json
   ```

3. Render a compact proposal for the user:
   - proposed final stack shape;
   - action per descendant branch: keep in stack, move to trunk, reorder under another branch, drop duplicate, or manual consolidation;
   - essential evidence and risk notes;
   - duplicate/superseded PR close candidates, clearly marked as report-only.
4. Ask for one explicit confirmation before mutating.
5. If confirmed, verify `git status --short` is clean. If dirty, stop and ask the user to checkpoint/stash/use another worktree.
6. Create local backup refs for every affected branch:

   ```bash
   stamp=$(date +%Y%m%d%H%M%S)
   git branch "backup/linearize-$stamp/<safe-branch-name>" "<branch>"
   ```

   Use a collision-safe branch-name encoding such as replacing `/` with `__`.

7. Rewrite with the least-invasive strategy that works:
   - topology-only move: `gt checkout <branch>`, `gt track -p <new-parent>`, `gt restack`;
   - history rebuild: `git checkout <branch>`, `git reset --hard <new-parent>`, `git cherry-pick <old-parent>..<old-branch>`, `gt track -p <new-parent>`;
   - duplicate drop only after the kept stack is correct: `gt delete <duplicate-branch> -f -q`.
8. If conflicts occur, use `code-resolve-merge-conflicts` as the conflict-resolution driver and return unresolved/product decisions to this workflow.
9. Once the rewrite succeeds and status is clean, run:

   ```bash
   gt submit --no-interactive
   ```

10. Report final stack, updated PR URLs from submit output, backup ref prefix, close candidates, and any deviations from the confirmed proposal.
