# Clinkr Whole-Payload Input Inventory

This inventory is the migration baseline for replacing general whole-stream input on the bounded modern Clinkr and ns SDK path. It classifies production input acquisition under `ts/packages/**/src`; subprocess input passed to an external command is not host-to-command request input.

## Shared finite JSON input

| Owner                     | Production path                                                                                                             | Payload                                                                 | Acquisition and validation owner                                                                                                                                                                                               | Final classification                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Clinkr framework          | `ts/packages/public/infra/clinkr/src/app/app.ts`                                                                            | One finite JSON document selected by `--input-json`                     | `ClinkrRunAdapterOptions.readJsonInput` acquires text only after route and framework-argument validation; Clinkr parses JSON and validates the selected command schema. The standalone process adapter drains `process.stdin`. | Framework JSON request input. Deferred acquisition prevents unrelated invocations and argument conflicts from reading host input. |
| ns SDK command context    | `ts/packages/public/sdk/src/sdk/execution.ts`, `ts/packages/public/sdk/src/cli/index.ts`                                    | Finite command-owned JSON payload text                                  | Optional `NsExtensionApi.readJsonInput()` carries the same bounded capability. Standalone SDK execution supplies the process adapter; embedded hosts inject finite text.                                                       | Shared JSON-specific host capability. It is not interactive input or a general stdin abstraction.                                 |
| PR Feedback exec commands | `ts/packages/incubating/extensions/pr-feedback/src/{map-branch-prs,branch-pr-checks,wait-for-checks,primitive-commands}.ts` | Finite JSON objects containing branch names or review-thread IDs        | Each command uses Clinkr-owned `loadJsonInput()` from `@nseng-ai/clinkr/app`; it lazily chooses inline option text, file text, or host JSON input, then validates with a command-owned Zod schema.                             | SDK command-owned JSON payloads. No arbitrary-text consumer.                                                                      |
| Reviews exec commands     | `ts/packages/incubating/extensions/reviews/src/operations/cli-operations.ts`                                                | A finite findings JSON object or finite Clinkr review-run envelope JSON | Reviews imports Clinkr-owned `parseJsonInputText()` and `JsonInputError`; Reviews-owned schemas and publication logic retain domain validation and error translation.                                                          | SDK command-owned JSON payloads. The Reviews runtime and client expose the same JSON-specific host capability.                    |

Clinkr owns the reusable JSON-input operation through `@nseng-ai/clinkr/app`: it accepts inline option text, file text, or a supplied `readJsonInput` callback and leaves command-specific schema wording and error translation with the owning command.

## Deleted portable Saved Plan path

The former `enriched-plan exec save` command and `enriched-plan-save` skill were the only shared-style arbitrary-text consumer and have been deleted. The retained `enriched-plan` CLI supports Saved Plan listing and resolution only.

Pi `/ns:plan:save`, `/ns:plan:grill-and-save`, `write_saved_plan_file`, and `writeSavedPlanFile()` receive complete content as command/tool/domain arguments and are not stdin consumers.

## Command-owned non-JSON payloads outside the shared seam

Two retained production workflows read arbitrary complete content, but neither consumes Clinkr or `NsExtensionApi.readJsonInput()`:

- Brmem `put --stdin` uses `BrmemSourceReader.readStdinBytes()` in `ts/packages/public/infra/brmem/src/source-reader.ts`. Brmem owns byte acquisition and file/stdin source selection.
- Handoff `create` defaults final Markdown to stdin through the same injected `BrmemSourceReader` in `ts/packages/incubating/extensions/handoffs/src/core/operations/create.ts`. Handoffs owns this artifact-content source and can also accept `--file`.

These are explicit source-reader/domain capabilities. They are evidence against claiming that the repository has no non-JSON whole-payload input, but they are not exceptions that require widening the shared structured-command request seam.

## Interactive line input

`readStdinLine()` uses `node:readline` and supplies terminal confirmation adapters in the SDK, Brmem, Handoffs, Slots, Packagechk, and ns-dev contexts. Clinkr's `ClinkrInteraction.confirm()` consumes lines semantically and separately from finite request payloads. These paths must remain interaction adapters; they must not be folded into JSON request input.

## Raw-command ownership

Clinkr raw commands receive verbatim argv plus invocation-scoped byte output (`ts/packages/public/infra/clinkr/src/raw/definition.ts`). They do not receive a Clinkr or SDK stdin capability. The only production `rawCommand()` registration is Vibechk `run`, which owns its argv interpretation and runner subprocess behavior. Any future raw-command input belongs to that explicit escape hatch rather than the structured JSON request contract.

## Conclusion

After portable Saved Plan save was deleted, every production consumer of the **shared** Clinkr/SDK whole-payload surface is a finite JSON request. No shared non-JSON whole-payload consumer remains. Retained arbitrary Brmem/Handoff content is command-owned behind `BrmemSourceReader`, interactive input is line-oriented semantic interaction, and raw commands have no shared input transport.
