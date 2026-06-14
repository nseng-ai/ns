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

- zero strong cmux tab matches: run `slot checkout <branch> --format json --no-clipboard` if needed, then `cmux new-workspace --name <branch> --description <text> --cwd <worktreePath>`;
- one strong match: focus that surface with `cmux rpc surface.focus`;
- two or more strong matches: show a tab chooser with every matching tab plus a final “Open new cmux tab/workspace anyway” option. `Esc` cancels the chooser; `q` quits the TUI.

Plan/session launch remains future work; there is deliberately no `p` key in this slice.

When the prototype answers the shape question, delete the throwaway shell or absorb the validated branch/topology model into the real `sdlcc` surface.
