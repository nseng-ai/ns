# Command Metadata Two-File Seam Approved

## Summary

The user approved a required two-file shape for every filesystem-defined command: eager, cheap `metadata.ts` plus selected-only `command.ts`. This supersedes only the one-file command detail in `2026-07-25-filesystem-route-shapes-refined.md`; that historical update remains unchanged, and its `group.ts` contract and all other decisions remain in force.

`metadata.ts` is imported for top-level/group help and command-name completion. Those operations do not import `command.ts`. Selection includes execution, command help, schema introspection, and option-value completion; selected operations may import `command.ts` and construct the command definition, but help, schema, and completion never run the handler. Because `command.ts` itself is selected-only, ordinary top-level implementation imports are allowed; private dynamic import is optional rather than required.

## Objective Impact

The Objective records and provisional README now require strict filesystem shapes. A command directory contains both `metadata.ts` and `command.ts`, and either file without the other is invalid. A group retains its one-file eager, cheap `group.ts` definition and may contain the required command pair as its default command. Non-group command directories and root defaults use the same required pair. Runtime discovery and packaging must preserve and validate these pair/default/group shapes, including both command files.

The immutable app/builder runtime, selected-definition caching and retry semantics, app-only execution/completion, filesystem lowering, no-manifest/no-codegen direction, clean-break migration, and prohibition on compatibility models remain unchanged.

## Follow-Ups

- Complete the approved TypeScript reconciliation and focused tests without introducing a compatibility shape.
- Verify command execution, selected help, schema introspection, and option-value completion load `command.ts` while only execution invokes the handler.
- Verify top-level/group help and command-name completion do not import command implementation.
- Verify strict incomplete-pair, default-command, group, and package-shipping behavior before README promotion.
