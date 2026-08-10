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

`commandDirectory` must be absolute. The descriptor may also declare points and project activation. It does not list command routes or loader callbacks.

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

`defineRawCommand({ run })` creates a contextful raw definition. The runner receives `{ context, argv, output }`, writes raw bytes through the invocation-scoped `output.writeStdout()` and `output.writeStderr()` adapter, and returns the exit status. Do not use ambient process writers. Raw commands do not participate in structured schema, rendering, or dynamic completion.

```ts
import { defineRawCommand } from "@nseng-ai/sdk";

export function command() {
  return defineRawCommand({
    run: ({ argv, output }) => {
      output.writeStdout(new TextEncoder().encode(`${argv.join(" ")}\n`));
      return 0;
    },
  });
}
```

## Structured request input and interaction

When a command explicitly accepts a JSON document from stdin, call `context.readJsonInput()` only after its source-selection checks choose that path. Treat the returned string as one finite request value and keep parsing, schema validation, source conflicts, and errors in the command. Do not use it as a general text stream or interactive input mechanism.

Use `context.confirm()` and `context.select()` for demonstrated interactive decisions. These are semantic host capabilities, not terminal readers: the standalone host may prompt in a terminal, while an embedded host can map them to native UI. Handle an unavailable capability explicitly and fail closed when the operation is required.

Use `context.resultOutput.write(text)` only for exact primary durable text that must be emitted before the handler returns. Use `context.commandIo` for human phases, notifications, and rich messages, `context.progress` for typed progress, and returned outcomes for ordinary final results. Use `context.renderCapabilities` for rendering policy. `NsExtensionApi` has no general stdout/stderr fields. Do not write to ambient process output or infer ANSI support from `process.stdout`; embedded hosts provide invocation-local presentation and may require settled non-TTY, non-ANSI rendering.

## Ownership

- Route files own names, aliases, descriptions, visibility, and help grouping.
- Command definitions own request/result schemas, handlers, renderers, and dynamic completion.
- Descriptors own package-level discovery, points, and activation.
- The ns host mounts each package as a separately labelled source into one Clinkr app. Clinkr owns routing and completion.
