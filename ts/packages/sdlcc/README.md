# sdlcc

` sdlcc` opens a dashboard-first full-screen OpenTUI app shell.

## Launch

```bash
bun ts/packages/sdlcc/src/cli.ts
```

Package-local run:

```bash
pnpm --dir ts --filter sdlcc run start
```

Direct stack-map fallback:

```bash
pnpm --dir ts --filter sdlcc run stack-map
```

## Internal tabs

- `Dashboard` — default no-args view
- `Stack Map` — preserved stack-map experience inside the shell

Keys:

- `Tab` / `Shift+Tab`: next / previous tab
- `1` / `2`: jump to Dashboard / Stack Map
- Dashboard rows: `↑`/`k`, `↓`/`j`, `Enter`, `r`, `q`
- Stack Map keeps its existing keys when opened directly

## Dashboard behavior

- Shows workspaces from the current cmux window only
- Refreshes every 3 seconds and on manual `r`
- Preserves the selected workspace by ref across refreshes
- Uses conservative structural buckets only: `here`, `active`, `selected`, `idle/open`, `multi-surface`, `unmatched-branch`, `diagnostic`
- `Enter` focuses the known safe surface when exactly one target is clear; otherwise it opens an internal chooser

## Notes

- `sdlcc stack-map` remains the direct compatibility path
- The prototype does not mutate cmux layout
