# `@ns/kernel/sdk` — Reference

`@ns/kernel/sdk` is the public author API for ns extensions — the one package you import from to write an ns extension; this document is the complete reference for its exports. `@ns/kernel/sdk` is the SDK layer; `@ns/kernel` is the host/kernel that loads extensions.
Import the SDK's own surface from the package itself:

```ts
import { defineExtension, failure, ok, usageError, z } from "@ns/kernel/sdk";
import type { CommandExit, NsExtensionApi } from "@ns/kernel/sdk";
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

## Extension descriptors

An extension package exposes its descriptor module through `package.json` `exports["./ns-extension"]`.
The descriptor module default-exports `defineExtension({ ... })`. Production discovery loads extension packages named in repo-root `ns.toml` `extensions`; it does not scan `.ns/extensions` roots or parse `package.json` `ns.commands`, `ns.points`, or `ns.harnessArtifacts` shims.

Descriptor-level contributions include `entries` for commands, `points` for point definitions, and `bundledArtifacts` for harness artifacts.

---

## Commands

### Raw `KernelCommand` and structured `NsCommand`

`defineRawCommand()` constructs the neutral low-level command contract. Raw commands have only `name`, `summary`, `description`, and `run(ctx, { argv })`; `argv` is the post-route argument tail. They do not declare `resultSchema` and do not expose Clinkr result types.

```ts
interface KernelCommand<T = unknown> {
  name: string;
  summary: string;
  description: string;
  run(ctx: NsExtensionApi, invocation: { readonly argv: readonly string[] }): Promise<CommandExit<T>> | CommandExit<T>;
}
```

`defineCommand()` is the structured convenience API. It parses a Zod schema, supports positionals/options/completion/renderers, requires `resultSchema`, and returns an `NsCommand` that the kernel can render as human, markdown, JSON, or JSON Schema.

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
  run(ctx: NsExtensionApi, request: z.output<S>): Promise<CommandExit<T>> | CommandExit<T>;
}
```

Both command styles return the kernel-owned command-exit constructors documented below. `--format json` is always the standard ns machine envelope. Structured commands publish a schema-backed envelope through `--json-schema`; raw commands own their own argument parsing and help surface.

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
import { ok, z } from "@ns/kernel/sdk";
import type { CommandExit, NsCommandRequest, NsExtensionApi } from "@ns/kernel/sdk";

const schema = z.object({ slug: z.string().optional() });

function runAutobranch(ctx: NsExtensionApi, request: NsCommandRequest<typeof schema>): CommandExit<string> {
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

### `CommandExit` and `MachineEnvelope`

Commands return `CommandExit<T>`. The CLI serializes command exits as the standard machine envelope for `--format json`:

```ts
type MachineEnvelope =
  | { status: "ok"; exitCode: 0; data: unknown }
  | { status: "negative"; exitCode: 1; message: string; data?: unknown }
  | { status: "failure"; exitCode: 2; errorType: string; message: string; data?: unknown }
  | { status: "usageError"; exitCode: 2; errorType: "usageError"; message: string; data?: unknown };
```

Use constructors rather than building exits by hand:

- `ok(data, overrides?)` — success (`exitCode: 0`).
- `negative(message, { data?, human? }?)` — expected semantic non-success (`exitCode: 1`).
- `failure(errorType, message, data?)` — command/system failure (`exitCode: 2`).
- `usageError(message, data?)` — invalid invocation (`exitCode: 2`).

`machineEnvelopeSchema`, `buildSuccessMachineEnvelopeSchema`, `buildFailureMachineEnvelopeSchema`, and `buildMachineEnvelopeSchema` are exported for consumers that need to validate or publish the envelope shape.

**Example.**

```ts
import { failure, ok, usageError } from "@ns/kernel/sdk";
import type { CommandExit, NsExtensionApi } from "@ns/kernel/sdk";

function run(ctx: NsExtensionApi): CommandExit<{ pushed: boolean }> {
  if (ctx.cwd === "") return usageError("cwd is required", { field: "cwd" });
  if (ctx.env["DRY_RUN"] === "1") return ok({ pushed: false });
  return failure("push-failed", "git push failed", { command: "git push" });
}
```

---

## Execution context

### `NsExtensionApi`

The capabilities a command receives as the first argument to `run`. ns owns the host environment; the command owns the exact external commands, prompts, and policy it applies.

```ts
interface NsExtensionApi {
  cwd: string;
  env: Record<string, string | undefined>;
  /** Compatibility ingress; adapt into domain-specific contexts before use. */
  homeDir?: string;
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
- `homeDir?` — compatibility ingress for a host-resolved user home. Command packages should convert it into their own domain contexts; it is not the owner of harness path semantics or XDG discovery policy.
- `exec(command, args, options?)` — low-level argv execution. The command owns exactly which programs it runs. Returns an `ExecResult`.
- `textGenerator` — the text-generation capability; see [Text generation](#text-generation). The command owns its prompts, validation, and repair policy.
- `commandIo` — required higher-level human command-output service. Command authors can call `ctx.commandIo.phase(...)`, `ctx.commandIo.notify(...)`, `ctx.commandIo.message(...)`, and `ctx.commandIo.clearPhase()` for host-adapted progress and notifications.
- `progress` — required structured phase-progress sink. It is always present; it may be a no-op in non-interactive hosts, so check `ctx.progress.isLive` before doing host-only progress work. Command authors can call `ctx.progress.phase(event)` with `NsProgressPhaseEvent` values when a host or capability wants typed phase lifecycle events.
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
  if (root.code !== 0 || root.killed) return failure("git-root-failed", "Not inside a git repository.");
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
interface NsProgressPhaseInfo {
  key: string;
  name: string;
  label?: string;
  detail?: string;
}

type NsProgressMatrixCellState = "pending" | "active" | "done" | "skipped" | "failed";

interface NsProgressMatrixColumnInfo {
  key: string;
  label: string;
  /** Preferred display width hint in cells; hosts may ignore. */
  width?: number;
}

interface NsProgressMatrixRowInfo {
  rowKey: string;
  label: string;
}

type NsProgressMatrixEvent =
  | { type: "matrix-declared"; columns: readonly NsProgressMatrixColumnInfo[]; labelHeader?: string }
  | { type: "matrix-rows"; rows: readonly NsProgressMatrixRowInfo[] }
  | { type: "matrix-cell"; rowKey: string; columnKey: string; state: NsProgressMatrixCellState; text?: string }
  | { type: "matrix-running"; commands: readonly string[] };

type NsProgressPhaseEvent =
  | { type: "phases-declared"; title: string; phases: readonly NsProgressPhaseInfo[] }
  | { type: "title-changed"; title: string }
  | { type: "phase-started"; phaseKey: string; label?: string }
  | { type: "phase-progress"; phaseKey: string; label: string }
  | { type: "phase-done"; phaseKey: string; detail?: string }
  | { type: "phase-failed"; phaseKey: string; detail: string }
  | NsProgressMatrixEvent;

const MATRIX_PROGRESS_MIN_LABEL_WIDTH_CHARS = 18;
const MATRIX_PROGRESS_MAX_LABEL_WIDTH_CHARS = 36;

function isMatrixProgressEvent(event: NsProgressPhaseEvent): event is NsProgressMatrixEvent;
function matrixProgressDisplayWidthChars(value: string): number;
function clampMatrixProgressLabelWidthChars(preferredWidthChars: number): number;
function centerMatrixProgressText(text: string, widthChars: number): string;
function padMatrixProgressTextEnd(text: string, widthChars: number): string;

type NsProgressPhaseListener = (event: NsProgressPhaseEvent) => void;

interface NsProgress {
  readonly isLive: boolean;
  phase(event: NsProgressPhaseEvent): void;
}
```

`NsProgressPhaseInfo` is presentation metadata for a declared phase checklist.

The `NsProgressMatrixEvent` sub-union streams an optional per-row × per-column progress grid alongside the phase checklist (for example flow land's branch × Gate/Merge/Verify/Restack matrix). `matrix-declared` announces the column set (and optional row-label header) once; `matrix-rows` replaces the full row set; `matrix-cell` updates one cell's `NsProgressMatrixCellState` with optional compact `text` that hosts render only when it fits the column; `matrix-running` carries a transient in-flight-commands line. Hosts without matrix rendering (including `createProgressPhaseStateStore`) ignore matrix variants; listeners must tolerate them. Hosts with matrix rendering use the exported `isMatrixProgressEvent` guard to split matrix events off the phase wire, and the exported matrix text-layout helpers for shared display-width-aware label clamps, cell centering, and right padding.

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
if (!drafted.ok) return failure("draft-failed", drafted.error);
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
  return failure("generation-failed", `Generation failed: ${result.error}`);
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
