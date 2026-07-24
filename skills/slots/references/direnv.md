# direnv across slots

Each slot is a separate directory, so direnv tracks a separate `.envrc`
approval per slot. The repo's `.envrc` is a tracked file; when it changes,
every slot that picks up the new content shows `direnv: error .envrc is
blocked` until that slot's copy is re-allowed.

Proactive refresh process after `.envrc` changes land on trunk:

1. **Propagate the new `.envrc`** to parked slots by fast-forwarding detached
   slots to trunk (see "Fast-forward detached slots to trunk" in `SKILL.md`):

   ```bash
   ns slot foreach --yes -- git merge --ff-only master
   ```

   Attached slots pick the change up whenever their branch rebases onto or
   merges trunk; there is nothing slot-specific to do for them beyond the
   normal branch workflow.

2. **Re-approve the `.envrc` in every worktree**:

   ```bash
   ns slot foreach --yes -- direnv allow
   ```

   `direnv allow` is per-directory, so it must run in each slot; foreach does
   exactly that (main worktree included).

3. **Optionally warm each slot** by evaluating the `.envrc` now instead of on
   first `cd` (useful when the `.envrc` does slow work such as dependency
   installs):

   ```bash
   ns slot foreach --yes -- direnv exec . true
   ```

Steps 2–3 are idempotent and safe to rerun any time slots report a blocked or
stale `.envrc`.
