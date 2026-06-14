# sdlcc

`sdlcc` is the first OpenTUI command-and-control infrastructure spike for this repository. It currently opens a full-screen hello-world screen using the imperative `@opentui/core` API.

## Non-goals

This package does not wire real Graphite, cmux, Objective, handoff, branch-context, Git, or GitHub workflows yet.

## Smoke test

From the repository root:

```bash
bun ts/packages/sdlcc/src/cli.ts
```

Optional package-local run:

```bash
pnpm --dir ts --filter sdlcc run start
```

Expected display: a full-screen OpenTUI hello-world view that says `Hello from sdlcc` and shows the exit hint.

Exit with `q` or Ctrl-C. Automated repository checks remain Node/pnpm/Vitest-compatible; the native renderer smoke requires Bun.
