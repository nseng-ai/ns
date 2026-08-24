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

Each command receives required invocation-scoped project configuration through `context.projectConfig`:

```ts
import { type ProjectSetting, z } from "@nseng-ai/sdk";

const widgetSetting = {
  path: ["widgets", "default"] as const,
  schema: z.string().min(1),
} satisfies ProjectSetting<string>;

const result = await context.projectConfig.get(widgetSetting);
```

A configured value includes project-source provenance. An absent setting or missing project `ns.toml` returns a successful `undefined`; repository discovery, source reads, malformed TOML, and invalid setting data return distinct typed failures. Consumers do not discover repository roots or construct filesystem config gateways for effective reads.

## Host behavior

The ns CLI loads source inventory, builds one contextful Clinkr app, mounts separately labelled filesystem and programmatic sources, and delegates execution and completion to that app. It constructs one `EffectiveProjectConfig` after final invocation `cwd` and environment are known. The capability is a stable snapshot for that invocation; long-lived hosts create a fresh capability for each command callback. The SDK does not enumerate command routes, select argv, apply source precedence, or adapt nested legacy runtimes.

See `docs/sdk-reference.md` for the complete exported author surface.
