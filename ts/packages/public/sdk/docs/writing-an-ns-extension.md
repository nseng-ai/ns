# Writing an ns extension

An ns extension package publishes a descriptor at `./ns-extension` and keeps its commands in a Clinkr filesystem route tree.

## Descriptor

```ts
import path from "node:path";
import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
  description: "Repository reports.",
  commandDirectory: path.join(import.meta.dirname, "cli"),
});
```

`commandDirectory` must be absolute. The descriptor may also declare points, project activation, and bundled artifacts. It does not list command routes or loader callbacks.

## Route tree

For `ns report show`, use:

```text
cli/
  report/
    group.ts
    show/
      metadata.ts
      command.ts
```

`group.ts` exports `group()`, `metadata.ts` exports `metadata()`, and `command.ts` exports `command()`. Clinkr opens only the scopes needed for help, completion, or execution and loads only the selected command definition.

```ts
// cli/report/show/metadata.ts
import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
  return { description: "Show the repository report." };
}
```

```ts
// cli/report/show/command.ts
import { defineCommand, ok, z } from "@nseng-ai/sdk";

export function command() {
  return defineCommand({
    schema: z.object({ verbose: z.boolean().default(false) }),
    resultSchema: z.object({ report: z.string() }),
    handler: async (context, request) => {
      const suffix = request.verbose ? ` in ${context.cwd}` : "";
      return ok({ report: `ready${suffix}` });
    },
    renderHuman: (result) => `${result.report}\n`,
  });
}
```

Use the `options` and `positionals` maps on `defineCommand()` when fields need Clinkr CLI annotations. Return `ok`, `negative`, `failure`, or `usageError` outcomes. Unexpected exceptions remain exceptions.

## Raw commands

`defineRawCommand({ run })` creates a contextful raw definition. The runner receives `{ context, argv }`, owns process I/O, and returns the exit status. Raw commands do not participate in structured schema, rendering, or dynamic completion.

## Ownership

- Route files own names, aliases, descriptions, visibility, and help grouping.
- Command definitions own request/result schemas, handlers, renderers, and dynamic completion.
- Descriptors own package-level discovery, points, activation, and artifacts.
- The ns host mounts each package as a separately labelled source into one Clinkr app. Clinkr owns routing and completion.
