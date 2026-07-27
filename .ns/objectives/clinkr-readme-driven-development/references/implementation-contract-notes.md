# Implementation Contract Notes

This file preserves implementation-relevant details intentionally removed from the package README during cold-audience editing. Removing detail from the README is an editorial decision, not a reversal of an approved behavior. The README remains the primary user story; this file, the decision record, and the steelthread contract records supply the detailed acceptance contract for implementation.

## Filesystem topology and loading

- `src/cli/` is Clinkr-owned topology. Keep domain logic, gateways, renderers, and reusable application modules outside it; selected `command.ts` modules may import them normally.
- `commandDirectory` is an absolute path. Clinkr rejects relative paths and never resolves it against the process working directory. `import.meta.dirname` is the recommended colocated form; callers may supply another absolute directory.
- Parent help and command-name completion inspect only immediate children. They may import cheap command `metadata.ts` modules and cheap, complete group `group.ts` modules, but do not import or construct sibling command definitions.
- Execution, selected-command help, schema introspection, and option-value completion may import the selected `command.ts` and construct its definition. Only execution invokes its handler.
- Selected-command loading is transactional: concurrent requests share in-flight work, successful loads cache for the app lifetime, and failed loads clear so a later request can retry. Each run still gets a fresh Commander tree.
- Group modules expose one cheap, complete `group()` definition. Children come from the directory; there is no second group metadata module.
- Incomplete command pairs, malformed mixed command/group shapes, and invalid metadata fail explicitly.
- Hidden commands and groups remain invocable but are omitted from parent help. Invoking a scope with no selected child runs its default command when present and otherwise shows help.
- Runtime-discovered command/group files and directories, including both files in each command pair, must ship intact. Do not add generated manifests or production codegen as a fallback. Bundled or single-file consumers may use the programmatic composition seam or a future dedicated adapter.

## Application factory and execution

- The conventional `src/cli/app.ts` exports an `app()` factory. Importing the module must not construct or execute the app.
- `app()` returns a fresh `ClinkrApp`; the direct executable path calls it inside `if (import.meta.main)` and only that block calls `clinkr.run(process.argv.slice(2))` and assigns `process.exitCode`.
- One app factory uses `requiresContext: true` as the runtime-visible and type-level discriminant for one homogeneous context type across the tree. Omitting it means context-free. Every structured command definition in a contextful tree also carries `requiresContext: true`; selected loading rejects an app/definition mismatch.
- Context belongs to an invocation, not app construction or global state. Context-free trees expose `handler(request)` and `clinkr.run(args)`; contextful trees expose `handler(context, request)` and require context for each run. Runtime dispatch follows `requiresContext` rather than inspecting function arity or always calling an underlying two-argument handler.
- The boolean discriminant preserves request and outcome inference from command schemas while the handler's annotated first parameter supplies its context type. A direct leading context generic cannot preserve inference of omitted trailing schema generics in TypeScript, and a uniform invocation object would require a synthetic null context for context-free commands. Repeating `requiresContext: true` on contextful definitions is the accepted tradeoff for truthful call shapes and runtime validation.
- `ClinkrApp.run()` resolves to an exit code and never calls `process.exit()`.
- The supported Node.js floor is `>=24.12.0`; the package `engines` metadata and qualification matrix must match.

## Programmatic topology and source composition

- The public advanced interface is a narrow scoped callback builder, not a public immutable-node/provenance/publication lifecycle.
- The builder mounts lazy topology sources. Filesystem discovery and programmatic sources lower into this same source model, selected-only loader, routing traversal, validation owner, and command-dispatch runtime.
- Sources own disjoint subtrees. A duplicate command path is an error. A group path contributed by more than one source is also an error, even when the sources would otherwise contribute distinct children. There is no source priority, mount-order override, or compatible-group merge.
- Collision diagnostics identify both sources and the canonical conflicting path. SDK composition must preserve recursive topology until mounting; it must not flatten to leaf candidates and reconstruct groups.
- Selected loads retain transactional in-flight sharing, success caching, failure retry, and provenance internally, but those mechanisms are not exposed as public node lifecycle APIs.

## Schema projection and CLI annotations

- Plain top-level request fields project predictably to kebab-case long options. `cliOption(...)` decorates that projection; `cliPositional(...)` replaces it with an explicitly ordered positional.
- Apply either helper around the final field after modifiers such as `.optional()` and `.default()`.
- Store CLI annotations in Clinkr's private typed Zod registry, not Zod's global `.meta()` registry, so CLI-only presentation metadata does not leak into generated JSON Schema.
- Aliases are explicit public API and are never inferred.

## JSON request input

- Every structured command exposes the reserved framework flag `--input-json` in help. It is transport metadata, not part of the request JSON Schema. Raw commands do not expose or interpret it and retain complete stdin ownership.
- `--input-json` may appear before or after the selected route. Routing still comes from argv; after route selection, the complete request comes from exactly one source: either command-specific argv fields or stdin JSON. Repeated `--input-json` and any mixture with command-specific flags or positionals are framework usage errors. Other framework options, including `--format`, remain independent.
- Consume stdin through invocation I/O at most once, only during selected structured-command execution. Help, `--json-schema`, completion, and parse failures never read it. Executable adapters provide process stdin; tests and embedded hosts may inject bytes. Clinkr imposes no payload-size limit initially.
- Strip at most one leading UTF-8 BOM, parse the complete stdin payload as exactly one JSON value, and require an object. Empty or whitespace-only input, malformed JSON, trailing non-whitespace content, arrays, and primitives produce framework usage error type `invalid-json-input` with exit code `2`. `{}` is valid when the request schema permits it.
- Reject unknown top-level object fields even when the Zod object would otherwise strip them; nested strictness remains owned by nested schemas. Validate JSON-native values directly through the selected command's request schema, including defaults and transforms, without Commander-style string coercion. Schema rejection produces framework usage error type `invalid-request` with structured Zod issues and exit code `2`.
- Every request field remains argv-projectable. JSON input is an alternate transport for the same request contract, not a JSON-only schema escape hatch. Interaction remains application policy; the framework does not classify interactive commands or enforce confirmation-bypass flags.

## Outcomes, schemas, and rendering

- The four handler-returned statuses are success, negative, failure, and usage error, with one unified status vocabulary used both as the outcome discriminant and on the wire: `success | negative | failure | usage-error`.
- Typed success, untyped diagnostics (Design A; see `updates/2026-07-27-design-a-typed-success-untyped-diagnostics.md`): `resultSchema` is the only declared payload schema and validates every success outcome's `data`. Omitting it makes success bodyless: a success outcome carrying data without `resultSchema` is a programmer error.
- Negative, failure, and usage-error outcomes have fixed shapes (`status`, `message`, plus `errorType` on failure and usage-error) and may carry optional freeform `data: unknown` diagnostics. Diagnostics are never validated and must be JSON-serializable.
- The machine envelope is the outcome plus `exitCode`, minus render overrides. The `data` key is omitted entirely when its value is `undefined`; there is no distinct explicitly-undefined-payload representation.
- Framework-owned usage errors use the same single usage-error envelope arm with `errorType` `invalid-request` or `invalid-json-input` and optional diagnostics such as `{ issues }` or `{ commanderCode }`; they are not separate schema alternatives.
- Clinkr alone validates success data, constructs machine envelopes, and publishes the four-arm discriminated envelope union through `--json-schema` from one schema builder. Adapters pass schemas through rather than rebuilding or partially validating outcomes.
- Invalid handler output is a programmer error and propagates to application crash policy. Unexpected exceptions likewise propagate; they do not become expected failure envelopes.
- Exit semantics follow the grep convention: success `0`, expected negative `1`, failure/usage error `2`. Success and negative human output go to stdout; failure and usage-error human output go to stderr. Every JSON outcome envelope goes to stdout.
- Rendering is command-level only. Do not restore per-exit human/Markdown overrides. Markdown falls back to the human renderer, then structured data falls back to indented JSON when no suitable renderer exists.
- The external output-format domain is exactly `human | json | md` in parsing, help, completion, validation, generated schemas, and any machine surface exposing the selected format. The CLI token `markdown` is unsupported. The public renderer remains named `renderMarkdown`, and prose continues to call the language Markdown.

## Raw commands and entrypoint boundaries

- A raw filesystem command retains the standard selected-module `command()` export. It returns a raw definition created by `defineRawCommand(...)` from `@nseng-ai/clinkr/raw`.
- Raw definitions receive the selected argv tail and own output bytes and exit status. They do not use the structured request/outcome schema model.
- Specialized APIs are available only from their named subpaths. The root does not re-export raw construction, completion planning/script rendering, stream sinks, or testing helpers.
- The root owns apps, structured command/group authoring, outcomes, rendering, interaction, and app-level completion configuration.
- Migration mechanics (temporary): the rebuild is quarantined under `@nseng-ai/clinkr/app` (runtime, command definitions, Design A outcomes, confirmation helper) and `@nseng-ai/clinkr/app/testing` (in-process app test runs) so shared legacy modules stay at their pre-rebuild shape for existing consumers. Nothing under `src/app/` imports legacy `exit.ts`, `emit.ts`, `group.ts`, `completion.ts`, or legacy confirmation logic, and legacy modules do not import from `src/app/`. The roadmap's tail deletion row flips the root export to the new surface and removes these temporary subpaths; the README-draft's `/app` import paths convert to root at that flip.

## Completion and progressive output

- Completion is app opt-in and derives static candidates from the same topology and schemas used for parsing and help. Dynamic providers mirror handler signatures: context-free definitions use `completionProvider(request)`, while definitions with `requiresContext: true` use `completionProvider(context, request)`.
- Dynamic providers augment static candidates; Clinkr merges and deduplicates them. If a provider throws, call optional app policy `completion.onProviderError` with the error and command/completion context, then retain static candidates. Observer failure must not break fallback, and Clinkr must not print the provider error itself.
- Normal progress and logs use stderr, preserving stdout for the answer or JSON envelope. More specialized progress/reporting belongs behind invocation context so hosts and tests can supply their own I/O policy.
- Animation is TTY-gated. Durable mid-command stdout is exceptional and must be disabled in JSON mode; derive that policy before `run()` and carry it through context when needed.
