---
name: code-gt-linearize-descendants
disable-model-invocation: true
description: Use when the user asks to linearize, reorder, consolidate, or collapse descendants of a specific Graphite stack branch; identify independent descendant PRs; or clean up accidental Graphite stack forks. Produces a proposal first, then mutates only after confirmation.
---

# code-gt-linearize-descendants

Linearize descendant PRs above a named Graphite stack branch. This workflow is safe-by-default: inspect first, propose a compact final stack, then perform supervised stack rewrites.

## Current Slots prerequisite

This workflow currently requires `@nseng-ai/slots` installed and enabled because structured descendant discovery and backup helpers live under `ns slot gt exec`. If that capability is unavailable, stop before any mutation. The current placement of generic helpers such as `stack-branches`, `descendants-report`, and `backup-refs` does not decide their permanent semantic ownership; that migration is tracked separately.

## Safety contract

- Planning is read-only.
- Ask for confirmation before any mutation.
- Require a clean worktree before mutation.
- Create timestamped local backup refs for all affected branches before mutation.
- Never close GitHub PRs automatically; only report close candidates.

## Procedure

1. Identify the target branch from the user request.
2. Gather the complete read-only descendant evidence in one call:

   ```bash
   ns slot gt exec descendants-report <target-branch> --format json
   ```

   Parse the Clinkr envelope and continue only for `status: "ok"` with valid
   JSON data and `complete: true`. Stop and report `status: "negative"`
   (including an unknown local target or missing Graphite metadata),
   `status: "failure"`, malformed/missing required fields, or any result where
   `complete` is not exactly `true`; never infer a partial subtree.

   The report's `root`, `scope`, `descendantCount`, and `edges` identify the
   requested subtree. `descendants` is complete and parent-before-child. Each
   descendant gives `branch`, `parent`, and `children`; `commits` contains the
   parent-relative commit SHA and subject; `diff` contains three-dot
   parent/branch totals (`filesChanged`, `insertions`, `deletions`) and per-path
   additions/deletions/binary status; and `pr` is one of:

   - `found`: PR number, title, state, URL, head, and base refs;
   - `none`: no PR exists for that branch;
   - `unavailable`: lookup failed, with a message.

   Read and surface `warnings`. PR lookup unavailability may coexist with a
   complete local report and does not invalidate it, but do not mistake
   `unavailable` for `none`. Follow the display-output rule in
   `docs/conventions/graphite-dependency-boundary.md`; `gt ls` may be shown only
   as a human visual cross-check, never as topology evidence.

   The report's commit and diff summaries are the default proposal evidence.
   Run a focused full-content
   `git diff <parent>...<branch> -- <paths>` only when semantic judgment needs
   source detail that the report cannot provide; do not recreate the
   per-branch log/stat/PR loop.
3. Infer a proposal from that evidence:
   - keep a descendant in the target stack when its diff is a coherent continuation of the target branch;
   - move a descendant to trunk or another parent when it is independent of the target branch;
   - reorder descendants when dependency direction is clear from commits/diffs;
   - mark duplicates as report-only close candidates when another branch already contains the same effective change;
   - escalate to manual consolidation when diffs overlap but intent is ambiguous.
4. Render a compact proposal for the user:
   - evidence sources consulted;
   - proposed final stack shape;
   - action per descendant branch: keep in stack, move to trunk, reorder under another branch, drop duplicate, or manual consolidation;
   - essential evidence and risk notes;
   - duplicate/superseded PR close candidates, clearly marked as report-only;
   - submit consequences: after the local rewrite, `gt submit --no-interactive` will force-push the rewritten branches and update their PRs; list the affected PR numbers/URLs explicitly.
5. Ask for one explicit confirmation before mutating; the confirmation covers both the local rewrite and the submit/force-push listed in the proposal.
6. If confirmed, verify `git status --short` is clean. If dirty, stop and ask the user to checkpoint/stash/use another worktree.
7. Create local backup refs for every affected branch in one call:

   ```bash
   ns slot gt exec backup-refs --label linearize --branch <branch> [--branch <branch> ...] --format json
   ```

   One `--branch` per affected branch. The command stamps the run (UTC),
   encodes `/` in branch names as `__`, and refuses missing branches or
   backup-name collisions without creating anything. Record `data.prefix`
   (`backup/linearize-<stamp>/`) for the final report; on a non-zero exit, stop
   and report — do not mutate without backups.

8. Rewrite with the least-invasive strategy that works:
   - topology-only move: `gt checkout <branch>`, `gt track -p <new-parent>`, `gt restack`;
   - history rebuild: `git checkout <branch>`, `git reset --hard <new-parent>`, `git cherry-pick <old-parent>..<old-branch>`, `gt track -p <new-parent>`;
   - duplicate drop, only after all three checks pass — the rewritten stack matches the confirmed proposal, `gt restack` reports nothing to do, and `git status` is clean: `gt delete <duplicate-branch> -f -q`.
9. If conflicts occur, use `code-resolve-merge-conflicts` as the conflict-resolution driver and return unresolved/product decisions to this workflow.
10. Once the rewrite succeeds and status is clean, run, as confirmed in the proposal:

```bash
gt submit --no-interactive
```

11. Report final stack, updated PR URLs from submit output, backup ref prefix, close candidates, and any deviations from the confirmed proposal.
