# direnv across Slots

Direnv approves `.envrc` per directory. After a tracked `.envrc` changes:

1. Fast-forward clean detached Slots to the configured local trunk:

   ```bash
   ns slot ff-detached
   ```

2. Update or restack attached feature branches through their normal workflow.
   `ff-detached` cannot and does not update attached branches.
3. After the relevant worktrees contain the new `.envrc`, re-approve every
   current copy:

   ```bash
   ns slot foreach --yes -- direnv allow
   ```

4. Optionally warm every worktree when first-entry evaluation would be
   expensive:

   ```bash
   ns slot foreach --yes -- direnv exec . true
   ```

The main worktree is included in `foreach`. Approval and warming are idempotent.
If an attached branch receives the changed `.envrc` later, approve that worktree
again after the branch update.
