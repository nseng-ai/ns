# Incorporate land as a command-first migration target

## Semantic Update

`land` is now an in-scope command for the command-first migration. The objective's Scope, Non-Goals, Completion Criteria, Runner Policy, Assumptions, and Open Questions were extended to list `land` alongside `changes`, `cp`, `regenerate-pr`, and `submit`, and a dedicated roadmap row was added for migrating it.

`land` has a distinct migration shape from the prior slices. It has no `sdl land` built-in to remove: it exists today only as the Pi `/sdl:code:land` command delegating to the CCC land-stack orchestration (`@sdl/ccc/land`, ~3300 lines across `ts/packages/ccc/src/land-stack/`) with `PARTIAL` parity and no CLI/skill entry outside Pi. Its slice therefore both establishes the missing project-local `sdl land` CLI surface and closes the `cross-harness-parity` gap, rather than relocating an existing privileged built-in.

The roadmap's still-active Pi-mirror rework row was updated to note that the `land` migration must decide the final Pi land mirror shape (`/sdl:code:land` vs flat `/sdl:land`) and update its parity metadata.

## Open question raised

- Should `land` keep depending on the `@sdl/ccc/land` orchestration boundary from a project-local extension, or does its migration require promoting a public landing/Graphite-stack interface? This is recorded as a new Open Question and as the central SDK-pressure test of the new roadmap row.

## Validation evidence

- `just dprint-fix` (Markdown formatting) ran clean after the edits.
- No code changes in this update; objective tracking only.
