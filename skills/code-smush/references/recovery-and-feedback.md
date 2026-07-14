# code-smush — recovery, feedback absorption, and known limits

Recovery and feedback material for `code-smush`, read alongside `SKILL.md`.
Section references (Phases 6–7, Packaging rule, backup prefixes) point back into the
skill's Procedure.

## Absorbing feedback into a packaged stack

Small post-packaging edits do not require a full repackage:

- **Edits to existing content** — stage the edits at the stack tip, preview with
  `gt absorb --dry-run --no-interactive`, then `gt absorb --force
  --no-interactive`; hunks route to the commits that introduced the lines and
  descendants restack.
- **New files or discrete feedback commits** — `gt modify -c -m "<narrated
  message>" --into <slice-branch> --no-interactive` from the tip.

Both are local mutations: propose-first and backup rules apply.

## Recovery

- Slicing mistakes before squash: slice branches are pointers into unchanged
  history — delete wrong branches (`gt untrack` then `git branch -D`), re-track,
  or `git branch -f` to move a cut.
- Replacement-construction mistakes cost nothing: the input stack was never
  touched, so delete the new branches and re-propose.
- After a squash mistake: restore pointers from the `backup/smush-<stamp>/`
  branches (`git branch -f <branch> backup/smush-<stamp>/<safe-branch-name>`,
  re-run `gt track --parent` to restore metadata), then re-propose.
- A conflicted `gt` operation (should not happen — smush never reorders history):
  abort with `git rebase --abort`, report, and stop.
- A failed `gt squash` before Objective binding (e.g. a stale `index.lock`
  mid-batch): handle the lock per the Phase 6 check, then retry. If the tool keeps
  failing, the guarded equivalent — with a backup present, a clean tree, and the
  parent verified — is `git reset --soft <parent> && git commit -m "<squash
  message>"`, then `gt restack --no-interactive` and re-verification of descendants.
  Recovery-only; never the normal path.

### Objective-binding failure

A Phase 7 failure is deliberately left exactly where it occurred. Smush does not
reset, delete the event, restore either backup, or continue unbound automatically.
The failure report identifies the selected Objective, command and output summary,
current branch/status, event state (untracked, staged, committed, or span-squashed),
safely readable topology/restack state, the original packaging backup prefix, and the
`backup/smush-bind-<stamp>/` tip backup.

After inspecting that evidence, the user chooses one manual path:

- repair the dirty or staged event and retry validation/commit;
- restore the packaged tip from the binding-specific backup, re-track/restack as
  needed, and rerun Phase 7 with a new collision-free event filename;
- if the event was committed but a Span re-squash failed, repair/retry the Span
  Squash and tree-equality checks without rewriting the immutable event content; or
- deliberately restore the pre-binding tip and start a newly ratified unbound run.

Never report the stack submission-ready until the selected path has restored the tip
contract, final topology/restack checks pass, and the worktree is clean. An unbound
choice after failure is a new explicit user decision, not a recovery default.

## Known limits (v1)

- Cuts land on commit boundaries only; a too-coarse commit cannot be split.
- The full replacement cycle on a live, reviewed stack — feedback carry-forward,
  old-stack closure, coexistence naming, CI cost — is not yet observed end to end
  (owned by the objective's repackaging prototype row).
- A submitted replacement stack re-runs CI across the full new stack; repackaging
  frequency compounds that cost across generations.
- Deterministic push-downs (slicing, selective span squash, slice-map read-side)
  are deliberately parked; do not add them from this skill.
