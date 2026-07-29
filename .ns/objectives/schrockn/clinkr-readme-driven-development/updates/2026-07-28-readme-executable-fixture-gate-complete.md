# README Executable Fixture Gate Complete

## Summary

The approved Clinkr README contract now has executable branch evidence. All 14 TypeScript fences in `references/README-draft.md` are synchronized with compile fixtures. The primary `metadata.ts`, `command.ts`, and `app.ts` example executes through the public app seam for argv and stdin `--input-json --format json`, and a cold-process integration smoke covers direct invocation, process argv/stdin/stdout, and exit status.

The fixture spine exercises truthful context-free/contextful definitions, schema-driven request and success typing, field annotations, command-level rendering, one-shot invocation stdin, and the exact `human | json | md` domain while remaining quarantined from the legacy mutable runtime.

## Objective Impact

This supplies the initial executable evidence required by the README gate without claiming the broader recursive topology, completion, or full runtime is complete. PR #3953 carries this slice and remains open; the evidence is not yet trunk state.

The package-contract and runtime rows still own complete topology validation, recursive selection, completion behavior, transactional loading, raw execution, and broad qualification. An accountability review of PR #3953 also found that the primary greet example is the only example currently exercised end to end. Examples 3–14 are synchronized and compiled, but several are fragments or describe target runtime behavior that the current root-only filesystem app cannot yet execute. Future command metadata remains an explicit expected type error in the compile fixture rather than a declaration augmentation: production types and runtime decoding must implement it before the final testing pass removes that scaffold.

## README Testing Assessment

Add the strongest honest behavioral evidence at the tip of the implementation stack, after the runtime needed by the examples exists:

- Exercise example 3 through the public app boundary for positional and option projection, aliases, validation, JSON output, and generated help.
- Exercise example 5 through the public app boundary for human, Markdown, and JSON rendering.
- Execute example 8 as a filesystem leaf and, after recursive topology lands, through its documented nested route.
- Exercise example 9's contextual handler with a fake Git gateway. Test its completion provider directly now, then through the app completion boundary when that boundary exists.
- Exercise example 13's complete companion for parsing, success-result validation, and schema publication; the synchronized fence remains intentionally abbreviated.
- Exercise example 14 through the public app boundary with strict confirmation fakes for confirmed, declined, and non-interactive paths, including whether deletion occurs.
- Test example 6's exact renderer directly for ANSI and plain output, example 7's exact group descriptor directly until `group.ts` discovery exists, and example 12's exact handler outcomes with controlled lookup behavior.
- Complete examples 4, 7, 8, 9, 10, and 11 against the final recursive runtime rather than fabricating misleading root-command substitutes. This includes nested `contacts find` and alias routing, richer command metadata and help grouping, `group.ts` discovery, nested `issues list`, app-owned completion, and the contextful `contacts list` testing scenario.

Keep the evidence categories explicit: exact synchronization, compile-time evidence, direct behavioral evidence, public-boundary execution, and behavior deferred until its owning runtime exists. Full end-to-end coverage for every fence is not a truthful immediate goal because some fences are intentionally partial teaching fragments; complete each example to the best level its final documented shape permits.

## Follow-Ups

- Keep README fixtures synchronized while later runtime slices evolve the implementation beneath the public examples.
- Preserve the cold-process smoke through the final root-surface cutover.
- Complete the roadmap's tip-of-stack README testing row before README promotion.
- Reconcile the stale status-specific-schema sentence in the README with the approved typed-success/untyped-diagnostics contract.
