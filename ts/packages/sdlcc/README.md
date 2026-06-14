# sdlcc

`sdlcc` opens a full-screen OpenTUI stack map for this repository. It shows the current Graphite branch graph, slot assignments, and strong cmux tab matches in one branch-oriented surface.

## Stack map

The stack map reads branch graph data from the sanctioned hidden command:

```bash
slot gt exec stack-map-branches --format json
```

That command owns Graphite metadata-store parsing on the Python side and returns selected branch rows, graph edges, assigned slot rows, and warnings. `sdlcc` separately reads cmux tab inventory with `cmux tree --json --all` and overlays tabs only when there is strong branch evidence.

## Run

From the repository root:

```bash
bun ts/packages/sdlcc/src/cli.ts
```

Package-local run:

```bash
pnpm --dir ts --filter sdlcc run stack-map
```

Expected display: a full-screen OpenTUI branch list with Graphite topology glyphs on the left and branch metadata / slot or strong cmux-tab labels aligned in table columns.

Keys:

- `↑`/`k`: previous branch
- `↓`/`j`: next branch
- `c`: cmux action for the selected branch
- `o`: toggle all branches vs. cmux-only rows
- `q` or `Esc`: exit

`c` uses only strong tab matches: explicit branch metadata or explicit worktree/cwd metadata that maps through slot rows. Workspace titles, tab titles, descriptions, tty names, and visual labels such as `π - slot-05` are diagnostic only and are intentionally not activation targets.

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

Use `sdlcc cmux report --json` for machine-readable success/failure output.

Plan/session launch remains future work; there is deliberately no `p` key in this slice.
