# ji -> ns machine migration

`migrate.py` migrates the owner machine from the `ji` tool surface to `ns`
after the rename lands on master, as nine individually runnable steps. It is
defensive, idempotent, and re-runnable; every mutation is guarded and
narrated, every step can be dry-run first, and every mutating step re-asserts
the rename-landed gate before touching anything.

## When to run

- ONLY after the ns cutover (stack PR-4 core cutover and PR-5 internal sweep)
  has merged to master. Every mutating step refuses to run otherwise (the
  gate requires being on `master` with `.ns/` present, `.ji/` absent, and the
  `ns shell integration` markers in `kernel/src/cli/shell.ts`).
- Run manually, from any terminal. The recommended careful workflow is one
  step at a time:

      uv run --no-project python migrate.py --list                 # steps in order, with status
      uv run --no-project python migrate.py <step-name> --dry-run  # inspect one step's mutations
      uv run --no-project python migrate.py <step-name>            # execute that step

  For each pending step in order: dry-run it, review the printed mutations,
  then execute it. Finish with `smoke` in a NEW terminal. `--list` is purely
  read-only and works on any branch.

- The original one-shot linear run is still available:

      uv run --no-project python migrate.py --all --dry-run
      uv run --no-project python migrate.py --all

## Prerequisites

- On `master` in the canonical checkout; the `preflight` step additionally
  requires a clean tree and does the `git pull --ff-only`.
- `uv`, `corepack`, `just`, `node`, and `git` on PATH.
- No slot worktree locked (locked worktrees are skipped with a warning;
  unlock and re-run).

## Steps (ordered)

1. `preflight`: clean-tree check and `git pull --ff-only` (the master +
   rename-landed assertions run as a gate before every mutating step).
2. `install`: `rm -rf ts/node_modules`, `corepack pnpm --dir ts install`,
   `just install-tools` (bakes the shims' canonical checkout to the main
   checkout — the old shims pointed into a slot worktree), then removes stale
   `~/.local/bin/ji` and `~/.local/bin/sdl`.
3. `zshrc`: timestamped backup (`~/.zshrc.pre-ns-migration.<ts>`), deletes the
   old block between `# >>> ji shell integration >>>` and
   `# <<< ji shell integration <<<`, runs `ns shell install --yes --shell zsh`,
   then prints (never edits) any remaining `JI_*` references in
   `~/.zshrc`, `~/.zprofile`, `~/.zshenv` for manual rename.
4. `xdg-roots`: plain-`mv`s `~/.config/ji`, `~/.local/share/ji`, `~/.cache/ji`
   to `ns` siblings where present (none existed at authoring time).
5. `slot-worktrees`: moves slot worktrees with `git worktree move` only —
   note they still live under the legacy **sdl** state root
   (`~/.local/state/sdl/slots/...`; the sdl->ji migration never moved them),
   so the step relocates worktrees found under either
   `~/.local/state/sdl/slots/` or `~/.local/state/ji/slots/` to
   `~/.local/state/ns/slots/`, preserving the `repos/sdl-tools/worktrees/slot-NN`
   tail, then verifies none remain under a legacy root.
6. `state-dirs`: non-slot state (`enriched-plan`, `submit-failure-logs`,
   `pi-cli-command-extension`) moves from `~/.local/state/ji` to
   `~/.local/state/ns`.
7. `cleanup`: emptied legacy skeletons are `rmdir`ed (with `.DS_Store`
   handling); leftover pre-ji data in `~/.local/state/sdl` is reported for
   manual merge/retire (blind moves would collide: both eras contain
   `enriched-plan/gh--nseng-ai--sdl-tools`).
8. `refs`: each `refs/ji/**` ref is copied to `refs/ns/<suffix>`, the copy is
   verified against the source sha, and only then is the old ref deleted
   (with an old-value guard).
9. `smoke`: prints the manual smoke checklist for a NEW shell (no mutations).

## Smoke checks (new terminal required)

- `ns --help`
- `ns objective list --minimal --format md`
- `ns slot cd <slot>` then `pwd` (should land under
  `~/.local/state/ns/slots/repos/sdl-tools/worktrees/`), then `cd -` —
  exercises the `NS_CD_DIRECTIVE_FILE` round-trip.
- `git worktree list` — no paths under `~/.local/state/{sdl,ji}/slots/`.

## Deferred: checkout-dir rename (`~/code/sdl-tools` -> `~/code/ns`)

Explicitly out of scope for `migrate.py` (locked plan decision). When you do
it later:

1. `mv ~/code/sdl-tools ~/code/ns`
2. From the moved checkout, repair every worktree link:
   `cd ~/code/ns && git worktree repair` — then, for safety, run
   `git worktree repair <path>` for each slot worktree path printed by
   `git worktree list` if any remain broken.
3. `just install-tools` from `~/code/ns` (re-bakes the shims' canonical
   checkout path).
4. Open a new shell; re-run the smoke checks above.
   Note: the slots repo dir name (`slots/repos/sdl-tools/`) is derived from
   the checkout basename; after the rename new slot operations will use
   `slots/repos/ns/`. Existing worktrees keep working where they are.

## Rollback notes

- zshrc: restore from the timestamped backup the script printed
  (`~/.zshrc.pre-ns-migration.<ts>`).
- Refs: copied-then-deleted. `git update-ref -d` on these refs is NOT
  reflog-recoverable (they carry no reflogs), which is exactly why the script
  verifies the `refs/ns/*` copy sha before deleting the `refs/ji/*` original.
  To roll back a ref, copy it back:
  `git update-ref refs/ji/<suffix> $(git rev-parse refs/ns/<suffix>)`.
- Worktrees: move back with `git worktree move <new-path> <old-path>`.
- Shims: re-running `just install-tools` from any checkout regenerates them;
  the deleted `ji`/`sdl` shims are intentionally unrecoverable (stale by
  design after the rename).
- State dirs: plain `mv`s are reversible by `mv`ing back.
