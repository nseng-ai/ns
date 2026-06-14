# sdlcc

`sdlcc` is the first OpenTUI command-and-control infrastructure spike for this repository. It currently opens a full-screen throwaway stack-map prototype.

## Prototype question

Does a branch list with a persistent left-side Graphite topology overlay feel like the right base surface for `sdlcc`?

The current prototype queries Graphite metadata from `.graphite_metadata.db`, seeds the visible row set from the current branch, active slot branches, and recent local branches, and overlays slot labels from `slot list --format json`. It is intentionally not wired to real cmux, Objective, handoff, branch-context, GitHub, or restack-status workflows yet.

## Smoke test

From the repository root:

```bash
bun ts/packages/sdlcc/src/cli.ts
```

Optional package-local run:

```bash
pnpm --dir ts --filter sdlcc run prototype:stack-map
```

Expected display: a full-screen OpenTUI branch list for the current Graphite stack, with Graphite topology glyphs on the left and branch metadata / slot labels aligned in table columns.

Keys:

- `↑`/`k`: previous branch
- `↓`/`j`: next branch
- `o`: toggle all branches vs. cmux-only rows
- `?`: hide/show the prototype question
- `q` or `Esc`: exit

When the prototype answers the shape question, delete the throwaway shell or absorb the validated branch/topology model into the real `sdlcc` surface.
