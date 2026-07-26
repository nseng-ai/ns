# Filesystem Route Shapes Refined

## Summary

The settled filesystem-first authoring contract now distinguishes groups from commands. A `group.ts` exports one cheap, complete `group(): ClinkrGroupDefinition` containing its metadata and cheap configuration; it has no separate `metadata()` or lazy second group-definition function. A `command.ts` retains cheap, explicitly typed `metadata(): ClinkrCommandMetadata` plus async `command()` because command construction may be expensive. Command definitions use the generic typed `defineCommand({...})` authoring shape so schemas drive handler and renderer inference.

This corrective update supersedes the earlier filesystem-first Semantic Update only where that update described a shared `metadata()` plus lazy definition split for groups. It preserves filesystem-owned children, adjacent default commands, cheap module top levels, selected-only command construction, and exported functions for future-proofing.

## Objective Impact

The Objective, roadmap, decision record, contract audit, and draft README now describe group modules as cheap complete definitions and command modules as cheap metadata plus lazy selected definitions. Heavy command imports remain behind `command()` or a private dynamic import, while `group()` itself must stay cheap. Filesystem-first runtime discovery, no codegen or manifest, the immutable builder lower seam, and the public builder escape hatch remain unchanged.

No TypeScript implementation occurred. Existing Semantic Updates remain untouched as historical evidence; this update supplies the corrective and superseding context.

## Follow-Ups

- Reconcile the filesystem adapter and public types/helpers to these route shapes during the approved implementation phase.
- Settle the exact provisional type/helper spellings and bootstrap API before README promotion while preserving the documented `defineCommand({...})` inference style.
- Keep all unrelated open decisions, including `position` versus `index`, the `md` alias, and outcome, raw, rendering, and completion-error discussions, open.
