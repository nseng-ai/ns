# sdlcc

`sdlcc` is the first OpenTUI command-and-control infrastructure spike for this repository. It currently opens a full-screen throwaway stack-map prototype.

## Prototype question

Does a branch list with a persistent left-side Graphite topology overlay feel like the right base surface for `sdlcc`?

The current prototype queries Graphite metadata from `.graphite_metadata.db`, seeds the visible row set from the current branch, active slot branches, and recent local branches, overlays slot assignments from `slot list --format json`, and reads cmux tab inventory from `cmux tree --json --all` when available. Objective, handoff, branch-context, GitHub, restack-status, and plan-mode workflows remain future work.

## Smoke test

From the repository root:

```bash
bun ts/packages/sdlcc/src/cli.ts
```

Optional package-local run:

```bash
pnpm --dir ts --filter sdlcc run prototype:stack-map
```

Expected display: a full-screen OpenTUI branch list for the current Graphite stack, with Graphite topology glyphs on the left and branch metadata / slot or strong cmux-tab labels aligned in table columns.

Keys:

- `↑`/`k`: previous branch
- `↓`/`j`: next branch
- `c`: cmux action for the selected branch
- `o`: toggle all branches vs. cmux-only rows
- `?`: hide/show the prototype question
- `q` or `Esc`: exit

`c` uses only strong tab matches: explicit branch metadata or explicit worktree/cwd metadata that maps through `slot list`. Workspace titles, tab titles, descriptions, tty names, and visual labels such as `π - slot-05` are diagnostic only and are intentionally not activation targets.

Selected-branch `c` behavior:

- zero strong cmux tab matches: run `slot checkout <branch> --format json --no-clipboard` if needed, then `cmux new-workspace --name <branch> --description <text> --cwd <worktreePath> --command "bun <sdlcc source cli.ts> cmux report || true; exec ${SHELL:-/bin/zsh} -l"`;
- one strong match: focus that surface with `cmux rpc surface.focus`;
- two or more strong matches: show a tab chooser with every matching tab plus a final “Open new cmux tab/workspace anyway” option. `Esc` cancels the chooser; `q` quits the TUI.

The bootstrap reporter is non-blocking: if reporting fails, the workspace still starts an interactive login shell. The bootstrap invokes the source `src/cli.ts` entrypoint from the TUI process instead of the target worktree's `sdlcc` binary, so opening an older/downstack branch can still write current cmux metadata.

## cmux surface reporting

`sdlcc cmux report` runs inside a cmux terminal surface and writes the current git branch/worktree identity into cmux `surface resume` metadata. It is strict by default: it must run inside cmux and inside a named git branch worktree. This slice intentionally has no public `--cwd`, `--branch`, `--workspace`, or `--surface` override flags.

The reporter writes:

- `kind=sdlcc-branch`
- `source=sdlcc`
- `cwd=<git worktree root>`
- `name=<current git branch>`
- a harmless shell restore binding from `$SHELL`, falling back to `/bin/zsh`

Use `sdlcc cmux report --json` for machine-readable success/failure output. Future loader/reconciliation work can query cmux resume metadata to match tabs reliably; this slice only writes the metadata.

Plan/session launch remains future work; there is deliberately no `p` key in this slice.

When the prototype answers the shape question, delete the throwaway shell or absorb the validated branch/topology model into the real `sdlcc` surface.
