# Remaining Clinkr API Design Settled

## Summary

A focused design grill settled all remaining Clinkr product/API branches recorded after the README consistency audit.

The public advanced composition interface is one narrow scoped callback builder. It mounts lazy topology sources that share the filesystem runtime model; immutable nodes, provenance, transactional publication, and prototype definition lifecycle remain private. Mounted sources own disjoint subtrees: duplicate command paths and every group path contributed by more than one source are errors. Clinkr does not apply source priority, mount-order override, or compatible-group merging, and collision diagnostics identify both sources plus the canonical path.

One app factory supports an explicit context mode that defaults to context-free when omitted. Context-free trees expose `handler(request)` and `clinkr.run(args)`; contextful trees explicitly select one homogeneous context type, expose `handler(context, request)`, and require context per invocation. Raw filesystem modules keep the standard `command()` export and return `defineRawCommand(...)` from `@nseng-ai/clinkr/raw`. Specialized APIs remain exclusive to their named subpaths; the root does not re-export raw construction, completion planning, stream sinks, or testing helpers.

## Objective Impact

The builder, context typing, extension composition, raw constructor, and export-placement questions are no longer open. `objective.md`, `roadmap.md`, `references/README-draft.md`, `references/implementation-contract-notes.md`, `references/decision-record.md`, and `references/steelthread-contract-changes.md` now carry the settled answers.

SDK reconstruction must change accordingly: preserve each extension source's recursive topology until it is mounted through the shared lazy source model, and reject rather than override or merge any cross-source shared command/group path. The rebuild must not expose the steelthread's immutable-node and provenance machinery merely because those mechanisms remain useful internally.

## Follow-Ups

- Finish the README blessing gate by removing remaining provisional wording and compiling/executing its fixtures.
- Implement the settled source, context-mode, raw-command, and export contracts in the single-runtime rebuild.
- Resolve only the parent-process gate amendment before the Objective's design questions are fully closed.
