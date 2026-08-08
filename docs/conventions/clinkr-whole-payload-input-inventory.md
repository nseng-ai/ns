# Clinkr Whole-Payload Input Inventory

This inventory records the completed replacement of general whole-stream input on the bounded modern Clinkr and ns SDK path. It classifies production input acquisition under `ts/packages/**/src`; subprocess input passed to an external command is not host-to-command request input.

## Shared structured request input

| Owner                     | Production path                                                                                                             | Payload                                                                 | Current acquisition and validation owner                                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clinkr framework          | `ts/packages/public/infra/clinkr/src/app/app.ts`                                                                            | One finite JSON document selected by `--input-json`                     | Embedded/test hosts supply `jsonInput`; standalone adapters may lazily supply `readJsonInput`. Clinkr acquires it only after route/framework-argument validation, then parses JSON and validates the selected command schema. |
| ns SDK command context    | `ts/packages/public/sdk/src/sdk/execution.ts`, `ts/packages/public/sdk/src/cli/index.ts`                                    | Finite command-owned payload text                                       | `NsExtensionApi.readJsonInput()` is optional and JSON-specific. The standalone SDK CLI supplies the process reader; embedded hosts supply invocation-owned finite text rather than inheriting process stdin.                  |
| PR Feedback exec commands | `ts/packages/incubating/extensions/pr-feedback/src/{map-branch-prs,branch-pr-checks,wait-for-checks,primitive-commands}.ts` | Finite JSON objects containing branch names or review-thread IDs        | Each command uses `loadJsonInput()` from `@nseng-ai/extension-kit/json-input`; it chooses an inline option or the host's finite JSON reader, then parses and validates with a command-owned Zod schema.                       |
| Reviews exec commands     | `ts/packages/incubating/extensions/reviews/src/operations/cli-operations.ts`                                                | A finite findings JSON object or finite Clinkr review-run envelope JSON | Commands receive finite text from the host JSON reader and retain Reviews-owned JSON parsing and schema validation in `record-findings` and `core/findings-publication.ts`.                                                   |

`@nseng-ai/extension-kit/json-input` is a command helper, not a second transport: it accepts inline option text, file text, or a supplied stdin callback and leaves JSON parsing/schema errors with the owning command.

## Deleted portable Saved Plan path

The former `enriched-plan exec save` command and `enriched-plan-save` skill were the only shared-style arbitrary-text consumer and have been deleted. The retained `enriched-plan` CLI supports Saved Plan listing and resolution only.

Pi `/ns:plan:save`, `/ns:plan:grill-and-save`, `write_saved_plan_file`, and `writeSavedPlanFile()` receive complete content as command/tool/domain arguments and are not stdin consumers.

## Command-owned non-JSON payloads outside the shared seam

Two retained production workflows read arbitrary complete content, but neither consumes the shared Clinkr/SDK finite JSON request contract:

- Brmem `put --stdin` uses `BrmemSourceReader.readStdinBytes()` in `ts/packages/public/infra/brmem/src/source-reader.ts`. Brmem owns byte acquisition and file/stdin source selection.
- Handoff `create` defaults final Markdown to stdin through the same injected `BrmemSourceReader` in `ts/packages/incubating/extensions/handoffs/src/core/operations/create.ts`. Handoffs owns this artifact-content source and can also accept `--file`.

These are explicit source-reader/domain capabilities. They are evidence against claiming that the repository has no non-JSON whole-payload input, but they are not exceptions that require widening the shared structured-command request seam.

## Interactive line input

`readStdinLine()` uses `node:readline` and supplies terminal confirmation adapters in the SDK, Brmem, Handoffs, Slots, Packagechk, and ns-dev contexts. Clinkr's `ClinkrInteraction.confirm()` consumes lines semantically and separately from finite request payloads. These paths must remain interaction adapters; they must not be folded into JSON request input.

## Raw-command ownership

Clinkr raw commands receive verbatim argv plus invocation-scoped byte output (`ts/packages/public/infra/clinkr/src/raw/definition.ts`). They do not receive a Clinkr or SDK stdin capability. The only production `rawCommand()` registration is Vibechk `run`, which owns its argv interpretation and runner subprocess behavior. Any future raw-command input belongs to that explicit escape hatch rather than the structured JSON request contract.

## Conclusion

After portable Saved Plan save was deleted, every production consumer of the **shared** Clinkr/SDK whole-payload surface is a finite JSON request. No shared non-JSON whole-payload consumer remains. Retained arbitrary Brmem/Handoff content is command-owned behind `BrmemSourceReader`, interactive input is line-oriented semantic interaction, and raw commands have no shared input transport.
