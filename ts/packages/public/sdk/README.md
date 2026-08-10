# @nseng-ai/sdk

Public author SDK and host composition support for ns extensions.

## Extension package

Export an extension descriptor from `./ns-extension`. A command contribution is an absolute Clinkr filesystem tree:

```ts
import path from "node:path";
import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
  description: "Example commands.",
  commandDirectory: path.join(import.meta.dirname, "cli"),
});
```

The directory follows Clinkr's route-local layout: commands provide `metadata.ts` and `command.ts`; groups provide `group.ts`; nesting in the directory is nesting in the CLI. Descriptors may additionally declare `points` and `activation`.

## Commands

Command modules export modern contextful Clinkr definitions over `NsExtensionApi`:

```ts
import { defineCommand, ok, z } from "@nseng-ai/sdk";

export function command() {
  return defineCommand({
    schema: z.object({ name: z.string() }),
    resultSchema: z.object({ greeting: z.string() }),
    handler: (_context, request) => ok({ greeting: `Hello, ${request.name}` }),
  });
}
```

`defineRawCommand()` is the contextful Clinkr raw definition constructor. Raw commands own their argv tail, invocation-scoped output, and numeric exit status. Write raw bytes through `invocation.output.writeStdout()` and `invocation.output.writeStderr()` rather than ambient process writers.

Route identity, aliases, descriptions, visibility, and help grouping belong to route-local metadata, not command definitions.

## Command invocation I/O

Structured request input is finite JSON, separate from interaction. Commands that support an inline/file/stdin JSON source use the optional `NsExtensionApi.readJsonInput()` capability only for the JSON-source case, then retain ownership of parsing, schema validation, source-conflict checks, and command-specific errors. Standalone composition may acquire that value from process stdin; embedded hosts must supply invocation-owned finite text and must not inherit ambient process input.

Confirmation and selection are semantic, host-owned operations exposed as `confirm` and `select`. Command code should request those operations rather than reading terminal lines or depending on raw mode, key events, cursor state, or another terminal-session API. Hosts that cannot provide an applicable interaction must fail closed rather than infer one from the physical process terminal.

Human output and rendering are also invocation-scoped. Use `resultOutput.write(text)` only for exact primary durable text that must be emitted before the handler returns. Use `commandIo` for human phases, notifications, and rich messages, and `progress` for typed progress. Ordinary final results should be returned for Clinkr to render. `NsExtensionApi` has no general stdout/stderr fields. Use `renderCapabilities` rather than ambient process writers or TTY detection. Embedded hosts choose presentation and rendering capability; non-terminal hosts can require settled non-TTY, non-ANSI output and sanitize captured text at their presentation boundary.

## Host behavior

The ns CLI loads source inventory, builds one contextful Clinkr app, mounts separately labelled filesystem and programmatic sources, and delegates execution and completion to that app. The SDK does not enumerate command routes, select argv, apply source precedence, or adapt nested legacy runtimes.

See `docs/sdk-reference.md` for the complete exported author surface.
