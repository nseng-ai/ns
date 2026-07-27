# README Contract Blessed with JSON Input

## Summary

The cold-audience review approved `references/README-draft.md` as the Clinkr product contract, subject only to executable fixture evidence before the roadmap blessing gate closes. The review removed the unresolved license placeholder and the promise of a future advanced-builder guide, while retaining exported TypeScript types as the current detailed reference.

The approved contract adds stdin-only JSON request transport for structured commands through explicit `--input-json`. Routing remains in argv; request fields come entirely from either command-specific argv or one JSON object on stdin and never merge. JSON-native values pass directly through the selected request schema, unknown top-level fields fail, framework options remain independent, invocation I/O owns the injectable one-time read, and raw commands retain stdin ownership. Framework ingestion failures use `invalid-json-input`; request-schema failures use `invalid-request`.

The review also fixed the runtime floor at Node.js `>=24.12.0`, made `md` the sole Markdown CLI format token while retaining the `renderMarkdown` API name, retained `ClinkrExit`, aligned dynamic completion provider signatures with context-free/contextful handlers, and recorded that Zsh completion is well-tested while Bash and Fish support is untested.

## Objective Impact

The active README-blessing row remains in progress only because fixture evidence is outstanding. The prose and detailed implementation contract are now approved; implementation should not reopen these choices without contradictory evidence. Compile every TypeScript example, execute the primary one-command path, and exercise the JSON-input path before closing the row.

The earlier immutable update `2026-07-25-public-surface-naming-settled.md` remains historical evidence of the previous `markdown`-plus-`md` decision. This update supersedes only that format-token disposition: externally observable values are now exactly `human | json | md`, while prose still names Markdown and the renderer remains `renderMarkdown`.

## Follow-Ups

- Add compile fixtures for every TypeScript example in `references/README-draft.md`.
- Add executable fixtures for the primary one-command path and the approved `--input-json` contract, including no-merging, exact-object parsing, structured error types, and invocation-I/O behavior.
- Add `engines.node >=24.12.0` to Clinkr package metadata during package-contract reconciliation.
- Directly qualify Zsh completion and treat Bash and Fish as untested until evidence changes that statement.
