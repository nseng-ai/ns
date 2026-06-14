# sdlcc

`sdlcc` is the first OpenTUI command-and-control infrastructure spike for this repository. It currently opens a full-screen throwaway stack-map prototype.

## Prototype question

Does a branch list with a persistent left-side Graphite topology overlay feel like the right base surface for `sdlcc`?

The current prototype uses in-memory sample data only. It is intentionally not wired to real Graphite, cmux, Objective, handoff, branch-context, Git, or GitHub workflows yet.

## Smoke test

From the repository root:

```bash
bun ts/packages/sdlcc/src/cli.ts
```

Optional package-local run:

```bash
pnpm --dir ts --filter sdlcc run prototype:stack-map
```

Expected display: a full-screen OpenTUI branch list with Graphite topology glyphs on the left, Graphite notes and cmux/worktree badges in columns, and a selected-branch state readout.

Keys:

- `↑`/`k`: previous branch
- `↓`/`j`: next branch
- `o`: toggle all branches vs. cmux-only rows
- `?`: hide/show the prototype question
- `q` or `Esc`: exit

When the prototype answers the shape question, delete the throwaway shell or absorb the validated branch/topology model into the real `sdlcc` surface.
