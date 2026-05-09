# asdl-slots persists no Pool state

asdl-slots holds no metadata of its own on disk. Pool size, Slot membership, and per-Slot state (**Assigned** vs **Available**, branch, dirty/clean) are derived from `git worktree list` (and a `git status` per worktree) on every command. There is no `~/.slots/<repo>/pool.json`, no lease file, no inventory cache.

We chose this because the worktree directory tree is already the source of truth: any persisted record can drift from it (the user runs `git worktree remove` directly, edits a branch out-of-band, etc.), and reconciliation logic is more complex than just re-deriving. The cost is that asdl-slots cannot record soft metadata — reservations, GC timestamps, per-Slot ownership, agent affinity. If we ever need any of those, this ADR should be revisited rather than worked around with ad-hoc dotfiles.

## Consequences

- Every command that needs Pool facts shells `git worktree list` (and per-worktree `git status` when liveness matters); commands are read-mostly and trivially correct under concurrent edits.
- "Pool" is a derived concept, not a stored one — the `Inventory` data structure used internally is reconstructed each invocation.
- Features that would require persistent per-Slot metadata (leases, intent flags, owner tags) are out of scope until this ADR is superseded.
