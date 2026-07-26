# Filesystem-First Authoring Approved

## Summary

The user approved a filesystem-first, runtime-discovered authoring model as Clinkr's primary README and common path. Direct route directories map to CLI paths; `group.ts` and `command.ts` modules expose cheap metadata separately from lazily selected definitions. The direction explicitly rejects generated manifests, generated runtime modules, and production filesystem codegen.

This decision supersedes the earlier statement that builders are the one primary authoring path. It does not reject the approved builder design: async immutable builders remain Clinkr's canonical lower-level runtime model and public advanced escape hatch, to be covered in separate advanced documentation rather than callback tutorials in the package README.

## Objective Impact

The Objective, roadmap, decision record, contract audit, and draft README now lead with the filesystem adapter over the shared builder/App runtime. They preserve transactional selected-route loading, successful per-app caching and retry, app-only execution/completion, and fresh Foundation apps while recording cheap-top-level, runtime ESM discovery, and intact-route packaging constraints. The exact `app.ts` bootstrap API remains provisional.

No TypeScript implementation occurred. Existing Semantic Updates remain immutable historical evidence of the contract as it stood when recorded; this update provides the superseding context.

## Follow-Ups

- Implement and verify the filesystem adapter and lower builder seam in the approved migration order after the remaining discussion gates permit implementation.
- Settle the exact filesystem bootstrap/helper API before README promotion.
- Document builders in a separate future advanced guide and verify packaging behavior for intact route trees; use builders or a later adapter for unsupported bundled/single-file environments rather than adding a manifest fallback.
- Keep `position` versus `index`, the `md` alias, and remaining outcome, raw, rendering, and completion-error discussions open.
