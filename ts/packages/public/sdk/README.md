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

## Host behavior

The ns CLI loads source inventory, builds one contextful Clinkr app, mounts separately labelled filesystem and programmatic sources, and delegates execution and completion to that app. Rendering capabilities belong to each invocation's resolved output sink: callback-hosted output defaults to settled non-TTY, non-ANSI capabilities, while standalone process-backed execution retains terminal capabilities. A host can explicitly provide callback-sink capabilities, but enabling ANSI color does not grant TTY cursor ownership. The SDK does not enumerate command routes, select argv, apply source precedence, or adapt nested legacy runtimes.

See `docs/sdk-reference.md` for the complete exported author surface.
