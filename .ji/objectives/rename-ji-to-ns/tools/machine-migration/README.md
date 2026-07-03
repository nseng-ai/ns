# ji -> ns machine migration

`migrate.sh` migrates the owner machine from the `ji` tool surface to `ns`
after the rename lands on master. It is defensive, idempotent, and
re-runnable; every mutation is guarded and narrated.

## When to run

- ONLY after the ns cutover (stack PR-4 core cutover and PR-5 internal sweep)
  has merged to master. The script refuses to run otherwise (it requires
  `.ns/` present, `.ji/` absent, and the `ns shell integration` markers in
  `kernel/src/cli/shell.ts`).
- Run once, manually, from any terminal:

      ./migrate.sh --dry-run   # inspect the plan first
      ./migrate.sh             # execute

## Prerequisites

- On `master` in the canonical checkout with a clean tree (the script
  verifies and `git pull --ff-only`s).
- `corepack`, `just`, `node`, and `git` on PATH.
- No slot worktree locked (locked worktrees are skipped with a warning;
  unlock and re-run).

## What it does (ordered)

1. Preflight: master, clean tree, pull, rename-landed checks.
2. Fresh install: `rm -rf ts/node_modules`, `corepack pnpm --dir ts install`,
   `just install-tools` (bakes the shims' canonical checkout to the main
   checkout — the old shims pointed into a slot worktree), then removes stale
   `~/.local/bin/ji` and `~/.local/bin/sdl`.
3. zshrc: timestamped backup (`~/.zshrc.pre-ns-migration.<ts>`), deletes the
   old block between `# >>> ji shell integration >>>` and
   `# <<< ji shell integration <<<`, runs `ns shell install --yes --shell zsh`,
   then prints (never edits) any remaining `JI_*` references in
   `~/.zshrc`, `~/.zprofile`, `~/.zshenv` for manual rename.
4. XDG: plain-`mv`s `~/.config/ji`, `~/.local/share/ji`, `~/.cache/ji` to `ns`
   siblings where present (none existed at authoring time). Slot worktrees are
   moved with `git worktree move` only — note they still live under the
   legacy **sdl** state root (`~/.local/state/sdl/slots/...`; the sdl->ji
   migration never moved them), so the script relocates worktrees found under
   either `~/.local/state/sdl/slots/` or `~/.local/state/ji/slots/` to
   `~/.local/state/ns/slots/`, preserving the `repos/sdl-tools/worktrees/slot-NN`
   tail. Non-slot state (`enriched-plan`, `submit-failure-logs`,
   `pi-cli-command-extension`) moves from `~/.local/state/ji` to
   `~/.local/state/ns`. Emptied skeletons are `rmdir`ed; leftover pre-ji data
   in `~/.local/state/sdl` is reported for manual merge/retire (blind moves
   would collide: both eras contain `enriched-plan/gh--nseng-ai--sdl-tools`).
5. Refs: each `refs/ji/**` ref is copied to `refs/ns/<suffix>`, the copy is
   verified against the source sha, and only then is the old ref deleted
   (with an old-value guard).
6. Prints a smoke checklist for a NEW shell.

## Smoke checks (new terminal required)

- `ns --help`
- `ns objective list --minimal --format md`
- `ns slot cd <slot>` then `pwd` (should land under
  `~/.local/state/ns/slots/repos/sdl-tools/worktrees/`), then `cd -` —
  exercises the `NS_CD_DIRECTIVE_FILE` round-trip.
- `git worktree list` — no paths under `~/.local/state/{sdl,ji}/slots/`.

## Deferred: checkout-dir rename (`~/code/sdl-tools` -> `~/code/ns`)

Explicitly out of scope for `migrate.sh` (locked plan decision). When you do
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
