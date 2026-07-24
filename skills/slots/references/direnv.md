# direnv across Slots

Direnv approves `.envrc` per directory. After a tracked `.envrc` changes:

1. Fast-forward detached Slots with the guarded process in `../SKILL.md`.
   Attached Slots receive the change through their normal branch update.
2. Re-approve every current copy:

   ```bash
   ns slot foreach --yes -- direnv allow
   ```

3. When first-entry evaluation would be expensive, warm every worktree:

   ```bash
   ns slot foreach --yes -- direnv exec . true
   ```

The main worktree is included. Approval and warming are idempotent.
