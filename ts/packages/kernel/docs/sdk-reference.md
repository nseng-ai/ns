# `@ns/kernel/sdk` — Reference

`@ns/kernel/sdk` is the public author API for ns extensions — the one package you import from to write an ns extension; this document is the complete reference for its exports. `@ns/kernel/sdk` is the SDK layer; `@ns/kernel` is the host/kernel that loads extensions.
Import the SDK's own surface from the package itself:

```ts
import { defineExtension, failed, ok, z } from "@ns/kernel/sdk";
import type { NsExtensionApi, NsResult } from "@ns/kernel/sdk";
```

Command schemas are [Zod](https://zod.dev) schemas. Import the SDK's `z` export so extension modules use the same schema identity as the ns host.

Do not import ns implementation modules (`@ns/kernel/*`, `@ns/core/*`, `@ns/clinkr/*`) from ns extension authoring modules. The SDK re-exports the few lower-package types an author needs; those are documented below as first-party SDK vocabulary, with their origin noted.

Capability APIs such as `@ns/<cap>/api` are consumer/provider capability surfaces above the SDK, not part of `@ns/kernel/sdk` and not general ns extension-author API. They are for first-party capability packages that deliberately depend on each other in-process; command authors still import only this SDK unless a capability's package documentation explicitly tells them otherwise.
For this repository's checked-in grouped flow extension, repeated command-author helper code should stay under the owning implementation package's helper layer, currently `ts/packages/capabilities/flow/src/shared/` in `@ns/flow`, until a later explicit decision promotes a stable helper into this SDK. `internalWorkspaceExports` in `ts/packages/kernel/package.json` and capability-building primitive subpaths under `@ns/capability-kit/*` exist for package/internal workspace sharing, not as extension-author API; importing or documenting those subpaths is not SDK promotion.

The SDK is intentionally small. A command should own its workflow policy — prompts, validation, repair, external commands, GitHub/Graphite choreography, and confirmation boundaries — unless repeated command migrations prove a deeper kernel helper belongs in this author API. When a helper is promoted, this reference becomes the source of truth for the new public surface.

The exports are grouped by the role they play when authoring a command: you **declare** an extension and its commands, your command **receives** an execution context, and it **returns** a result. Each entry carries a minimal worked example; the examples share a running `git`-driven command so they compose into a realistic extension.

---

## Entry point

### `defineExtension()`

Declares an ns extension. The default export of every ns extension module is a call to `defineExtension()`.

```ts
function defineExtension(extension: NsExtension): NsExtension;
```

**Description.** At runtime `defineExtension()` returns its argument unchanged — it is an identity function. Its job is entirely at the type level: a family of overloads preserves per-command schema inference (so each command's `run` sees the request type implied by its own `schema`) for up to four explicit commands plus a rest tuple. You do not interact with the overloads directly; pass an extension object and TypeScript infers the rest.

**Parameters.**

- `extension: NsExtension` — the extension to declare. Commands are optional; `defineExtension({})` is a valid commandless extension.

**Returns.** The same `NsExtension`, with command types preserved.

**Notes.**

- Use as the module's default export: `export default defineExtension({ ... })`.
- Single-file extensions under `.ns/extensions/` are leaf modules. Workspace packages must never import from them.

**Example.**

```ts
import { defineExtension, ok } from "@ns/kernel/sdk";

export default defineExtension({
  commands: [
    {
      name: "greet",
      summary: "Say hello.",
      description: "Say hello with details.",
      run: () => ok("hello"),
    },
  ],
});
```

### `NsExtension`

The shape of an ns extension.

```ts
interface NsExtension<TCommands extends readonly NsCommand[] = readonly NsCommand[]> {
  commands?: TCommands | undefined;
}
```

**Fields.**

- `commands?` — the extension's command contributions. Omit it for an extension that contributes no commands to the current ns surface.

**Example.**

```ts
// A commandless extension is valid — it simply contributes nothing to the
// current ns surface.
export default defineExtension({});
```

---

## Repo-local extension descriptors

### `repoLocalNsCommandDescriptor()`

Builds a descriptor for a checked-in `.ns/extensions/<group>/src/commands/<name>.ts` shim that re-exports a package-owned command module. The static `.ns/extensions/*/package.json` manifests remain hand-authored because repo-local discovery must read JSON without executing TypeScript; these descriptors are the package-owned parity oracle that integration tests compare against those static manifests and shims until generation is introduced.

```ts
function repoLocalNsCommandDescriptor(options: RepoLocalNsCommandDescriptorOptions): RepoLocalNsExtensionCommandDescriptor;
```

Repo-local first-party extensions in this repository use this command-leaf pattern:

1. The implementation package owns a `src/repo-local-ns-extension.ts` descriptor.
2. Each public command module exports its named `NsCommand` and a default `defineExtension({ commands: [thatCommand] })` wrapper.
3. `.ns/extensions/<group>/package.json` lists one manifest command entry per command leaf.
4. `.ns/extensions/<group>/src/commands/*.ts` contains only a one-line default re-export of the package command module.

Do not point multiple manifest command entries at a shared `.ns/extensions/<group>/src/extension.ts` multiplexer for first-party repo-local commands. Per-command leaves let discovery validate each manifest route against the package-owned command export and keep shim files mechanically checkable.

`packageExportPrefix` is joined with the manifest command name. The name defaults to `command.name`, so nested user-facing routes such as `path: ["exec", "attach"]` can still point at `./src/commands/attach.ts` and `@ns/branch-context/ns/commands/attach`. Pass `manifestName` only when the checked-in leaf filename and package export intentionally encode more than `command.name`, such as Roaster's route-encoded `review-list` leaf.

```ts
import { repoLocalNsCommandDescriptor } from "@ns/kernel/sdk";

const descriptor = repoLocalNsCommandDescriptor({
  command: attachCommand,
  manifestPath: ["exec", "attach"],
  packageExportPrefix: "@ns/branch-context/ns/commands",
});
// manifestEntry: "./src/commands/attach.ts"
// packageExport: "@ns/branch-context/ns/commands/attach"

const routeEncodedDescriptor = repoLocalNsCommandDescriptor({
  command: reviewListCommand,
  manifestName: "review-list",
  manifestPath: ["review", "list"],
  packageExportPrefix: "@ns/roaster/commands",
});
// manifestEntry: "./src/commands/review-list.ts"
// packageExport: "@ns/roaster/commands/review-list"
```

### `defineRepoLocalNsExtensionDescriptor()`

Declares the package-owned descriptor that parity tests compare against a checked-in repo-local extension manifest. It returns its argument unchanged.

---

## Commands

### `NsCommand`

One flat command contribution inside an extension's `commands` array. Direct extension entries appear as `ns <name>`; manifest-grouped packages can present the same flat command name under a group such as `ns flow <name>`.

```ts
interface NsCommand<S extends NsCommandSchema = z.ZodObject, T = unknown> {
  name: string;
  summary: string;
  description: string;
  schema?: S | undefined;
  positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>> | undefined;
  resultSchema?: z.ZodType<T> | undefined;
  renderHuman?: ((data: unknown, caps: RenderCapabilities) => string) | undefined;
  renderMarkdown?: ((data: unknown, caps: RenderCapabilities) => string) | undefined;
  completionProvider?: NsCommandCompletionProvider | undefined;
  run(ctx: NsExtensionApi, request: z.output<S>): Promise<NsResult | ClinkrExit<T>> | NsResult | ClinkrExit<T>;
}
```

**Fields.**

- `name` — the flat command name. Must match `[a-z][a-z0-9-]*`: no nested groups, slashes, colons, spaces, or uppercase.
- `summary` — required one-line text shown in `ns --help`.
- `description` — full help text shown in `ns <cmd> --help`.
- `schema?` — a Zod object schema (`NsCommandSchema`) describing the command's options. Omit for a command with no parsed arguments.
- `positionals?` — maps schema field names to positional slots (`PositionalSpec`). Only keys present in the schema are valid.
- `resultSchema?` — opt into Clinkr-rendered command execution by declaring the successful data schema. Rendered commands get `--format human|json|markdown|md` and publish the schema through `--json-schema`.
- `renderHuman?` / `renderMarkdown?` — optional renderers for successful rendered-command data. These receive `unknown` because the ns kernel stores extension commands heterogeneously; command modules that know `T` should validate or wrap their typed renderer at the package boundary.
- `completionProvider?` — optional shell-completion hook for dynamic values. It receives the `NsExtensionApi` and a Clinkr completion request (`current`, `previous`, command `args`, and `positionalIndex`). Its candidates are appended to static command/option/enum candidates and deduped. Completion stdout remains candidate-only; provider failures are omitted from stdout, keep resolver exit code `0`, and may be reported concisely on stderr.
- `run(ctx, request)` — the command body. Receives the execution context and the parsed request (`z.output<schema>`). Message-only commands return `NsResult`; rendered commands that set `resultSchema` return a `ClinkrExit<T>`.

**Example.** Declared inline so `request` is inferred from `schema`:

```ts
import { defineExtension, ok, z } from "@ns/kernel/sdk";

export default defineExtension({
  commands: [
    {
      name: "greet",
      summary: "Greet someone.",
      description: "Greet someone with a configurable name.",
      schema: z.object({ name: z.string().default("world") }),
      run: (ctx, request) => ok(`hello ${request.name}`),
    },
  ],
});
```

### `NsCommandCompletionProvider`

```ts
type NsCommandCompletionProvider = (
  ctx: NsExtensionApi,
  request: ClinkrDynamicCompletionRequest,
) =>
  | Promise<ClinkrCompletionResult | readonly ClinkrCompletionCandidate[]>
  | ClinkrCompletionResult
  | readonly ClinkrCompletionCandidate[];
```

Provides dynamic completion candidates for the selected command without invoking `run`. Use it for cheap, read-only lookups such as branch names. Return either a candidate array or `{ candidates }`; candidate values are newline-rendered by the shell resolver, while descriptions are currently ignored by the newline renderer.

**Boundaries.**

- The provider runs only on the async completion path for the selected command; it is never invoked for unrelated commands and does not eager-load other extensions.
- Provider candidates are appended to the static command/option/enum candidates and deduped; the provider augments rather than replaces static completion.
- Keep it cheap and read-only: do not mutate state, prompt, or perform expensive work. It runs on every completion keystroke for the selected command.
- Provider failures are captured by the host: static candidates are still returned, resolver stdout stays candidate-only, and the resolver keeps exit code `0`. Errors may be reported concisely on stderr.

**Example.** Complete local branch names for a positional argument:

```ts
import { defineExtension, ok, z } from "@ns/kernel/sdk";

export default defineExtension({
  commands: [
    {
      name: "checkout",
      summary: "Check out a branch.",
      description: "Check out an existing local branch.",
      schema: z.object({ branch: z.string().optional() }),
      positionals: { branch: { position: 0 } },
      async completionProvider(ctx) {
        const result = await ctx.exec("git", ["branch", "--format=%(refname:short)"]);
        if (result.code !== 0 || result.killed) return [];
        return result.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((value) => ({ value }));
      },
      run: (ctx, request) => ok(request.branch ?? "(current)"),
    },
  ],
});
```

The user-facing setup, resolver behavior, supported shells, and limitations for ns shell completion are documented in [`../README.md`](../README.md) under "Shell completion".

### `NsCommandSchema`

```ts
type NsCommandSchema = z.ZodObject;
```

The schema type a command may declare. Always a Zod object, built with `z` imported from `@ns/kernel/sdk`.

**Example.**

```ts
import { z } from "@ns/kernel/sdk";
import type { NsCommandSchema } from "@ns/kernel/sdk";

const schema: NsCommandSchema = z.object({ force: z.boolean().default(false) });
```

### `NsCommandRequest`

```ts
type NsCommandRequest<S extends NsCommandSchema> = z.output<S>;
```

The parsed-request type derived from a command's schema — the type `run` receives as its second argument. Useful when `run` is a named function declared apart from the command object.

**Example.**

```ts
import { z } from "@ns/kernel/sdk";
import type { NsCommandRequest, NsExtensionApi, NsResult } from "@ns/kernel/sdk";

const schema = z.object({ slug: z.string().optional() });

function runAutobranch(ctx: NsExtensionApi, request: NsCommandRequest<typeof schema>): NsResult {
  return ok(request.slug ?? "(auto)"); // request is { slug?: string }
}
```

### `PositionalSpec`

*Re-exported from `@ns/clinkr/raw`.* Assigns a schema field to a positional argument slot.

```ts
interface PositionalSpec {
  position: number;
}
```

**Fields.**

- `position` — the zero-based positional index this field reads from.

**Example.** Map the `slug` option to the first positional, so `ns flow autobranch my-feature` fills it:

```ts
{
  name: "autobranch",
  summary: "Create a branch.",
  description: "Create a branch with an optional slug.",
  schema: z.object({ slug: z.string().optional() }),
  positionals: { slug: { position: 0 } },
  run: (ctx, request) => ok(request.slug ?? "(auto)"),
}
```

## Extension manifest schemas

ns package manifests can describe command entries without loading extension code. The SDK exports permissive Zod schemas for the known author-facing `package.json` manifest shape; unknown package, `ns`, and command-entry fields are accepted and preserved.

### `nsExtensionManifestCommandSchema`

Validates one known `ns.commands[]` entry shape.

```ts
const command = nsExtensionManifestCommandSchema.parse({
  name: "changes",
  path: ["flow", "changes"],
  description: "Show changes.",
  fullDescription: "Show changes with details.",
  entry: "./src/changes.ts",
});
```

Known fields are `name?`, `path?`, `group?`, `description?`, `fullDescription?`, and `entry?`. Filesystem checks, command-name rules, grouping behavior, and final discovery diagnostics remain ns kernel responsibilities.

### `nsExtensionManifestSchema` / `nsExtensionPackageManifestSchema`

Validate the known `ns` object and package-level manifest wrapper.

```ts
const manifest = nsExtensionPackageManifestSchema.parse({
  description: "Flow command package.",
  ns: {
    group: "flow",
    description: "Flow commands.",
    commands: [{ name: "changes", description: "Show changes.", entry: "./src/changes.ts" }],
  },
});
```

The inferred types are exported as `NsExtensionManifestCommand`, `NsExtensionManifest`, and `NsExtensionPackageManifest`.

## Text helpers

### `normalizeTextOutput()`

*Re-exported from `@ns/core/text-normalization`.* Normalizes model text before validation.

```ts
function normalizeTextOutput(output: string): string;
```

Converts CRLF/CR line endings to `\n`, removes outer blank lines, and strips one enclosing Markdown code fence when the whole response is fenced.

### `trimOuterBlankLines()`

*Re-exported from `@ns/core/text-normalization`.* Removes leading and trailing blank lines while preserving interior text.

```ts
function trimOuterBlankLines(text: string): string;
```

### `stripOuterCodeFence()`

*Re-exported from `@ns/core/text-normalization`.* Removes one outer Markdown code fence from a whole response.

```ts
function stripOuterCodeFence(text: string): string;
```

### `truncateTextHead()`

*Re-exported from `@ns/core/text-truncation`.* Keeps the head of a string inside a fixed character budget and appends a caller-defined marker.

```ts
function truncateTextHead(options: HeadTextTruncationOptions): string;
```

### `truncateTextHeadTail()`

*Re-exported from `@ns/core/text-truncation`.* Keeps head and tail excerpts inside a fixed character budget and inserts a caller-defined marker.

```ts
function truncateTextHeadTail(options: HeadTailTextTruncationOptions): string;
```

### `HeadTextTruncationOptions` / `HeadTailTextTruncationOptions`

*Re-exported from `@ns/core/text-truncation`.* Options for the truncation helpers.

**Example.**

```ts
const excerpt = truncateTextHeadTail({
  value: diff,
  maxChars: 24_000,
  headRatio: 0.7,
  buildMarker: (omittedChars) => `\n[... omitted ${omittedChars} chars ...]\n`,
});
```

---

## Results

### `NsResult`

The value a command's `run` returns.

```ts
type NsResult =
  | { ok: true; message: string }
  | { ok: false; exitCode: number; message: string };
```

A discriminated union on `ok`. Construct values with `ok()` and `failed()` rather than building the literal by hand.

**Example.**

```ts
import type { NsExtensionApi, NsResult } from "@ns/kernel/sdk";

function run(ctx: NsExtensionApi): NsResult {
  return ctx.env["DRY_RUN"] ? ok("would run") : ok("ran");
}
```

### `ok()`

Builds a success result.

```ts
function ok(message: string): NsResult;
```

**Parameters.** `message` — the success message printed to the user.

**Example.**

```ts
return ok("Pushed the current branch.");
```

### `failed()`

Builds a failure result.

```ts
function failed(message: string, exitCode?: number): NsResult;
```

**Parameters.**

- `message` — the failure message printed to the user.
- `exitCode?` — process exit code; defaults to `1`.

**Example.**

```ts
return failed("Working tree is dirty; commit or stash first.", 2);
```

---

## Execution context

### `NsExtensionApi`

The capabilities a command receives as the first argument to `run`. ns owns the host environment; the command owns the exact external commands, prompts, and policy it applies.

```ts
interface NsExtensionApi {
  cwd: string;
  env: Record<string, string | undefined>;
  exec(command: string, args: string[], options?: NsExecOptions): Promise<ExecResult>;
  textGenerator: TextGenerator;
  commandIo: NsCommandIo;
  progress: NsProgress;
  renderCapabilities: RenderCapabilities;
  outputFormat?: ClinkrFormat;
  stdout?: ((text: string) => void) | undefined;
  stderr?: ((text: string) => void) | undefined;
  stdin?: (() => Promise<string>) | undefined;
  onOutput?: ((stream: NsOutputStream, text: string) => void) | undefined;
  confirm?: NsConfirmPrompt | undefined;
  extensions?: Readonly<Record<string, unknown>> | undefined;
}
```

**Fields.**

- `cwd` — repository working directory for the command's execution.
- `env` — environment visible to the command and to shell execution.
- `exec(command, args, options?)` — low-level argv execution. The command owns exactly which programs it runs. Returns an `ExecResult`.
- `textGenerator` — the text-generation capability; see [Text generation](#text-generation). The command owns its prompts, validation, and repair policy.
- `commandIo` — required higher-level human command-output service. Command authors can call `ctx.commandIo.phase(...)`, `ctx.commandIo.notify(...)`, `ctx.commandIo.message(...)`, and `ctx.commandIo.clearPhase()` for host-adapted progress and notifications.
- `progress` — required structured phase-progress sink. Command authors can call `ctx.progress.phase(event)` with `NsProgressPhaseEvent` values when a host or capability wants typed phase lifecycle events.
- `renderCapabilities` — required host terminal rendering capabilities for human output and previews. Use this explicit field for color/unicode decisions; do not transport terminal capabilities through `extensions`.
- `outputFormat?` — host-selected command output format, useful only for commands that stream durable output before returning.
- `stdout?` / `stderr?` — durable output hooks for commands that stream multiple chunks before returning. `stdout` is reserved for primary output.
- `stdin?` — optional full stdin reader for commands that consume a finite payload.
- `onOutput?` — transient live-progress hook for UI bridges, tagged by `NsOutputStream`.
- `confirm?` — optional interactive confirmation hook (`NsConfirmPrompt`).
- `extensions?` — project-local extension bag. A command owns any values it reads from it.

**Example.**

```ts
async run(ctx: NsExtensionApi) {
  const root = await ctx.exec("git", ["rev-parse", "--show-toplevel"], {
    timeoutMs: 30_000,
  });
  if (root.code !== 0 || root.killed) return failed("Not inside a git repository.", 2);
  return ok(root.stdout.trim());
}
```

### `NsCommandIo`

Host-adapted human command-output service. It is always present on `NsExtensionApi`.

```ts
type NsNotifyLevel = "info" | "warning" | "error";

interface NsCommandMessageOptions {
  level?: NsNotifyLevel;
  details?: unknown;
  isRichOnly?: boolean;
}

interface NsCommandIo {
  phase(message: string): void;
  notify(message: string, level?: NsNotifyLevel): void;
  message(message: string, options?: NsCommandMessageOptions): void;
  clearPhase(): void;
}
```

- `phase` emits transient human-facing phase text.
- `notify` emits a terminal human notification.
- `message` emits durable human-facing scrollback; rich hosts may use `details`, while text-only hosts may render as phase text or drop `isRichOnly` messages.
- `clearPhase` clears sticky transient phase state where the host has one.

### `NsProgress`

Structured phase-progress sink. It is always present on `NsExtensionApi` and may be a no-op in non-interactive hosts.

```ts
type NsProgressPhaseEvent =
  | { type: "phase-started"; phaseKey: string; label?: string }
  | { type: "phase-progress"; phaseKey: string; label: string }
  | { type: "phase-done"; phaseKey: string; detail?: string }
  | { type: "phase-failed"; phaseKey: string; detail: string };

type NsProgressPhaseListener = (event: NsProgressPhaseEvent) => void;

interface NsProgress {
  phase(event: NsProgressPhaseEvent): void;
}
```

Low-level `stdout`, `stderr`, and `onOutput` hooks remain compatibility primitives for durable stream output and transient live-output bridges. `ctx.commandIo` and `ctx.progress` are the preferred SDK services for command-authored human output and typed progress.

### `NsExecOptions`

Options for `ctx.exec`.

```ts
interface NsExecOptions {
  timeoutMs?: number;
  stdin?: string | undefined;
  onStdout?: ((text: string) => void) | undefined;
  onStderr?: ((text: string) => void) | undefined;
}
```

**Fields.**

- `timeoutMs?` — kill the process after this many milliseconds.
- `stdin?` — string written to the process's stdin.
- `onStdout?` / `onStderr?` — per-chunk output callbacks invoked as the process streams.

**Example.** Feed a commit message over stdin and mirror live output:

```ts
await ctx.exec("git", ["commit", "-F", "-"], {
  stdin: commitMessage,
  timeoutMs: 30_000,
  onStdout: (chunk) => ctx.onOutput?.("stdout", chunk),
});
```

### `ExecResult`

The result of `ctx.exec`.

```ts
interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
  startupError?: string;
}
```

**Fields.**

- `stdout` / `stderr` — captured output streams.
- `code` — process exit code.
- `killed` — whether the process was killed (e.g. by timeout).
- `startupError?` — present when the process could not be spawned.

**Example.**

```ts
const log = await ctx.exec("git", ["log", "-1", "--oneline"]);
if (log.code === 0 && !log.killed) {
  ctx.stdout?.(log.stdout.trim());
}
```

## Text generation

### `TextGenerator`

The text-generation capability exposed as `ctx.textGenerator`.

```ts
interface TextGenerator {
  generateText(request: TextGenerationRequest): Promise<TextGenerationResult>;
}
```

**Description.** A single `generateText` method. The command owns prompt construction, output validation, and any repair policy; the generator only runs the request.

**Example.**

```ts
const drafted = await ctx.textGenerator.generateText({
  modelRef,
  system: "You write terse [cp] checkpoint commit messages.",
  prompt,
  reasoning: "low",
  operation: "checkpoint-message",
});
if (!drafted.ok) return failed(drafted.error);
return ok(drafted.text);
```

### `TextGenerationRequest`

```ts
interface TextGenerationRequest {
  modelRef: string;
  system: string;
  prompt: string;
  maxTokens?: number;
  reasoning?: "minimal" | "low";
  operation?: string;
}
```

**Fields.**

- `modelRef` — model reference string to generate with.
- `system` — system prompt.
- `prompt` — user prompt.
- `maxTokens?` — optional output cap.
- `reasoning?` — optional reasoning effort, `"minimal"` or `"low"`.
- `operation?` — optional operation tag for host-side routing/telemetry. Use any stable string that identifies the generation task.

**Example.** Built and passed to `generateText` in the `TextGenerator` example above.

### `TextGenerationResult`

```ts
interface TextGenerationUsage {
  inputTokens: number;
  outputTokens: number;
}

type TextGenerationResult =
  | { ok: true; text: string; usage?: TextGenerationUsage }
  | { ok: false; error: string };
```

A discriminated union on `ok`: either the generated `text` plus optional token `usage`, or an `error` message.

**Example.**

```ts
const result = await ctx.textGenerator.generateText(request);
if (!result.ok) {
  return failed(`Generation failed: ${result.error}`);
}
ctx.stdout?.(result.text);
```

---

## Schema

### `z` (from Zod)

Command schemas are [Zod](https://zod.dev) schemas. The SDK exports the host's schema builder so single-file extensions do not need their own resolvable `zod` dependency. Its API is Zod's own — see the Zod documentation; it is not re-documented here.

```ts
import { z } from "@ns/kernel/sdk";

const schema = z.object({ slug: z.string().optional() });
```

Using the SDK export keeps schemas on the same Zod identity as the ns host at runtime.
