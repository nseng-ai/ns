# Clinkr Steelthread Contract Changes

**Evidence window:** the implementation steelthread from `clinkr-immutable-app-builder-runtime` (`e0b2d4b08`) through `colocate-objectives-cli-remove-operations` (`2830c0e4f`), built above the original contract branch `adopt-filesystem-first-cli-authoring` (`b1d3c9a74`).

## Purpose

The original contract made the major product decisions before implementation. The steelthread then exercised those decisions through Clinkr, Foundation, the SDK host, Flow, Objectives, and Brmem. This document records every material refinement to the contract that came from building and using that vertical slice. It is not a branch changelog and does not make the prototype implementation authoritative. The refreshed `README-draft.md` is the current cold-audience contract candidate; this document explains what changed and why. Once the README blessing gate closes, it becomes the user-facing source of truth.

## Changes to the filesystem authoring contract

### Commands require an eager metadata file and a selected-only definition file

The original filesystem design placed `metadata()` and `command()` in one `command.ts`. Building recursive help and completion showed that importing the module to read metadata also evaluates its top-level implementation imports. Requiring every command to have two files creates a module-level laziness seam that does not depend on authors remembering to hide imports inside a function:

```text
metadata.ts  # eager, cheap route metadata
command.ts   # selected-only schemas, handlers, renderers, gateways, providers
```

Either file without the other is invalid. The pair represents a named command, a group default, or the app default according to its directory peers. A group retains one eager, cheap `group.ts`; it does not acquire a metadata sidecar or second lazy definition phase.

Selection includes execution, command help, `--json-schema`, and option-value completion. Those operations may import `command.ts` and construct the command definition, but only execution invokes the handler. Top-level and group help and command-name completion import only immediate command metadata and group definitions. Because `command.ts` is itself selected-only, ordinary top-level implementation imports are allowed there; private dynamic imports are optional rather than the normal authoring requirement.

This refinement was recorded during the steelthread in `2026-07-26-command-metadata-two-file-seam-approved.md` and implemented first as a structural proof.

### CLI field annotations belong beside their Zod fields

The steelthread retained parallel `positionals` and `options` maps keyed back into the request schema. The rebuild replaces those maps with Clinkr-owned `cliPositional(...)` and `cliOption(...)` helpers backed by a private typed Zod registry. Each helper wraps the final Zod field and owns its CLI-only description plus positional or short-flag metadata. Positional annotations require an explicit zero-based `position`; declaration order never defines the public argument order. Long flags remain derived from camelCase schema keys.

Clinkr deliberately owns this description instead of relying on Zod `.describe()` or global `.meta()`. Validation and CLI presentation remain colocated, while CLI-only metadata stays out of generated JSON Schema. Route aliases, summaries, help groups, and visibility remain in `metadata.ts` because they describe the command path rather than a request field.

### `src/cli/` is a framework-owned topology seam

The first migration placed the discoverable tree under a generic commands directory. Brmem showed that the clearer default is a self-rooted `src/cli/` directory containing only:

- `app.ts`;
- Clinkr `group.ts` files;
- command `metadata.ts`/`command.ts` pairs;
- the directories that directly express the CLI path.

Domain operations, gateways, and reusable application modules remain outside that directory and are imported by selected command definitions. This makes the entire command surface visible in one place without allowing framework topology to become the domain architecture. Alternate absolute command directories remain supported for host composition, but the README teaches `commandDirectory: import.meta.dirname` from `src/cli/app.ts`.

This refinement came from the Brmem migration and is recorded in `2026-07-26T220143Z-clinkr-owned-cli-directory.md`.

### Strict shape and package integrity are part of the contract

The adapter must reject incomplete command pairs, malformed mixed command/group shapes, and invalid metadata before execution. Runtime-discovered files and directories—including both files in every command pair—must ship intact. Bundled and single-file environments may use the programmatic composition seam or a future dedicated adapter; they do not justify a generated-manifest fallback in the common path.

The Brmem pack check established tarball inventory inspection as relevant evidence for this claim. Source-tree tests alone are insufficient.

## Changes to the outcome and rendering contract

### Framework usage errors are not command-owned usage errors

The original four-schema design was too simple for usage errors. A command's optional `usageErrorSchema` governs only usage errors returned by its handler. Clinkr can also reject an invocation before the handler:

- Commander parsing failures carry exact `{ commanderCode }` data;
- request validation failures carry exact `{ issues }` data.

Generated machine schemas must compose those framework-owned alternatives with the command-owned handler alternative. An omitted command `usageErrorSchema` means handler-returned usage errors are bodyless; it must not erase framework-owned data-bearing branches. Command schemas validate command outcomes only and do not claim ownership of parser data.

This was discovered through Brmem confirmation behavior and recorded in `2026-07-26T215033Z-usage-error-schema-composition.md`.

### Presentation-ready strings need explicit renderers

The generic fallback for structured data is indented JSON. Therefore a string result without a renderer is rendered as a JSON string literal in human mode, escaping newlines and ANSI bytes. Flow demonstrated that presentation-ready prose is not self-describing merely because its data type is `string`.

Commands that promise verbatim human text must declare a command-level human renderer. Markdown may deliberately inherit it. JSON continues to preserve the original string as envelope data. Serialized JSON payload strings should remain unrendered. This is a command-contract distinction, not a reason to special-case strings in Clinkr's fallback.

This was recorded in `2026-07-26-flow-string-rendering-reconciled.md`.

### Every returned status must match its declared schema

Flow also exposed the operational consequence of the four-status contract. If a handler returns negative or failure data, the command must declare the corresponding schema. Omitted means bodyless; it does not mean “reuse the result schema” or “accept unknown data.” Mixed early-return paths must be normalized to the command's declared status shape.

Violations are programmer errors. Diagnostics must identify the canonical command path, returned status, mismatched schema, and a concrete repair, while preserving the schema error as the cause. The framework must not weaken validation or convert the violation into an ordinary failure envelope merely to keep a migrated caller running.

This was recorded in `2026-07-26-flow-outcome-schemas-actionable-diagnostics.md`.

### Confirmation usage data should be schema-derived and reusable

Once framework-owned and command-owned usage errors were separated, reusable confirmation behavior needed a reusable schema as well as a TypeScript type. Clinkr therefore exposes `confirmationUsageErrorDataSchema` alongside its derived type. Consumers can adopt that exact contract rather than duplicate a mirror schema.

## Clarifications confirmed by the steelthread

The following original decisions survived real consumer use and are now stronger than design assumptions:

- negative human answers belong on stdout with exit `1`;
- failures and usage errors belong on stderr with exit `2`;
- JSON always emits one status envelope on stdout;
- rendering belongs to stable command-level renderers, never per-exit overrides;
- outcome-schema violations propagate as programmer errors;
- selected command help and schema introspection load definitions but never run handlers;
- aliases are explicit application surface;
- `position` remains the positional ordinal field;
- `markdown` remains canonical and `md` remains its explicit alias;
- expected operational failures are returned outcomes; unexpected exceptions propagate;
- raw execution remains a narrow argv/bytes/status escape hatch rather than an alternate structured command model;
- context is invocation-owned, and Foundation creates a fresh app after `prepareRun`;
- dynamic completion failure preserves static candidates and app-level observation cannot break that fallback.

## Lower-interface questions exposed and settled

The steelthread did not invalidate the filesystem result, but it showed that several lower-interface decisions were premature or insufficiently exact. README review and the 2026-07-27 design grill settled them:

1. **Builder API shape.** Expose one narrow scoped callback builder for programmatic topology, extension mounting, custom loading, framework integration, and packaging environments that cannot preserve command directories. It mounts lazy topology sources; immutable nodes, provenance, publication, and prototype lifecycle machinery remain private.
2. **Context-free typing.** One explicit app context mode defaults to context-free. `handler(request)` and `clinkr.run(args)` are real type/runtime contracts; contextful mode uses one homogeneous typed context and requires it per invocation.
3. **Completion ownership.** Enabling completion on an app installs the visible setup command and hidden resolver. The lower-level completion entrypoint remains available when a host owns transport.
4. **Extension composition.** Filesystem and SDK sources preserve recursive topology and mount through the same lazy source model. Sources own disjoint subtrees: duplicate commands and every shared group path fail with diagnostics naming both sources and the canonical path. There is no precedence or group merge.
5. **Raw filesystem definitions.** A raw filesystem module exports the standard `command()` function and returns `defineRawCommand(...)` from `@nseng-ai/clinkr/raw`.
6. **Programmatic and filesystem topology.** Both authoring modes lower into one routing and validation model without compatibility imports or global validation exceptions. Specialized APIs remain exclusive to their named subpaths.

## Implication for the rebuild

Once blessed, the refreshed README plus `implementation-contract-notes.md`, not the prototype code, are the implementation source of truth. Until then, they are the current contract candidate and detailed acceptance checklist. The implementation stack is retained as evidence of real workflows and failure modes. Port contract tests and consumer scenarios selectively; do not preserve transitional interfaces, lowering paths, or branch structure merely because they existed in the steelthread.
