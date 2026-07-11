# `@nseng-ai/kernel/sdk` — Reference

`@nseng-ai/kernel/sdk` is the public author API for ns extensions — the one package you import from to write an ns extension; this document is the complete reference for its exports. `@nseng-ai/kernel/sdk` is the SDK layer; `@nseng-ai/kernel` is the host/kernel that loads extensions.

For an end-to-end package layout and extension authoring walkthrough, start with [Writing an ns extension](./writing-an-ns-extension.md).
Import the SDK's own surface from the package itself:

```ts
import { defineExtension, failure, hiddenExecGroup, ok, usageError, z } from "@nseng-ai/kernel/sdk";
import type { CommandExit, NsExtensionApi } from "@nseng-ai/kernel/sdk";
```

Command schemas are [Zod](https://zod.dev) schemas. Import the SDK's `z` export so extension modules use the same schema identity as the ns host.

Do not import ns implementation modules (`@nseng-ai/kernel/*`, `@nseng-ai/foundation/*`, `@nseng-ai/clinkr/*`) from ns extension authoring modules. The SDK re-exports the few lower-package types an author needs; those are documented below as first-party SDK vocabulary, with their origin noted.

Capability APIs such as `@nseng-ai/<cap>/api` are consumer/provider capability surfaces above the SDK, not part of `@nseng-ai/kernel/sdk` and not general ns extension-author API. They are for first-party capability packages that deliberately depend on each other in-process; command authors still import only this SDK unless a capability's package documentation explicitly tells them otherwise.
For this repository's checked-in grouped flow extension, repeated command-author helper code should stay under the owning implementation package's helper layer, currently `ts/packages/capabilities/flow/src/shared/` in `@nseng-ai/flow`, until a later explicit decision promotes a stable helper into this SDK. `internalWorkspaceExports` in `ts/packages/kernel/package.json` and capability-building primitive subpaths under `@nseng-ai/capability-kit/*` exist for package/internal workspace sharing, not as extension-author API; importing or documenting those subpaths is not SDK promotion.

The SDK is intentionally small. A command should own its workflow policy — prompts, validation, repair, external commands, GitHub/Graphite choreography, and confirmation boundaries — unless repeated command migrations prove a deeper kernel helper belongs in this author API. When a helper is promoted, this reference becomes the source of truth for the new public surface.

The exports are grouped by the role they play when authoring a command: you **declare** an extension and its commands, your command **receives** an execution context, and it **returns** a result. Each entry carries a minimal worked example; the examples share a running `git`-driven command so they compose into a realistic extension.

---

## Entry point

### `defineExtension()`

Declares an ns extension. The default export of every ns extension module is a call to `defineExtension()`.

```ts
function defineExtension<const TDescriptor extends ExtensionDescriptor>(extension: TDescriptor): TDescriptor;
```

**Description.** At runtime `defineExtension()` returns its argument unchanged — it is an identity function. Its type-level job is to preserve the typed descriptor shape. Command implementation modules default-export `RawArgvCommand` objects directly.

**Parameters.**

- `extension: ExtensionDescriptor` — the descriptor to declare. A commandless descriptor still needs `description` and can omit `entries`.

**Returns.** The same descriptor, with literal types preserved.

**Notes.**

- Use as the module's default export: `export default defineExtension({ ... })`.
- Extension packages expose a typed descriptor module through `exports["./ns-extension"]`; descriptor modules should import only this SDK at top level.

**Example.**

```ts
import { defineExtension } from "@nseng-ai/kernel/sdk";

export default defineExtension({
  group: "greet",
  description: "Greeting commands.",
  entries: [{ name: "hello", load: () => import("./commands/hello.ts") }],
});
```

---

## Extension descriptors

An extension package exposes its descriptor module through `package.json` `exports["./ns-extension"]`.
The descriptor module default-exports `defineExtension({ ... })`. Production discovery loads extension packages named in repo-root `ns.toml` `extensions`; legacy extension roots and package JSON contribution shims are not discovery inputs.

Descriptor-level contributions include `entries` for commands, `points` for point definitions,
`activation` for repository activation metadata, and `bundledArtifacts` for harness artifacts.

### `ExtensionDescriptor` / `ExtensionActivation`

```ts
interface ExtensionActivation {
  readonly instructions?: string;
  readonly consumerDirs?: readonly string[];
}

interface ExtensionDescriptor {
  readonly group?: string;
  readonly description: string;
  readonly entries?: readonly ExtensionEntry[];
  readonly points?: readonly ExtensionPointDefinition[];
  readonly activation?: ExtensionActivation;
  readonly bundledArtifacts?: readonly BundledArtifactDefinition[];
}
```

`ExtensionActivation` is the public plain-data contract for activation needs. `instructions`, when
present, is preserved verbatim and must be one non-empty Markdown section beginning with a non-empty
`##` heading; deeper subsections are allowed, but another `##` heading is rejected. `consumerDirs`,
when present, contains unique canonical POSIX-style repository-relative directories strictly beneath
`.ns/`. Validation rejects `.ns` itself, absolute or outside paths, trailing slashes, empty or `.`/`..`
segments, backslashes, and duplicates rather than normalizing them. Both fields are independently
optional, so an empty activation object is valid.

The descriptor carries no activation hook or filesystem behavior. Core lifecycle machinery owns
instruction rendering and consumer-directory creation; descriptor validation defines the author
contract independently of that lifecycle consumption.

### `hiddenExecGroup()`

Constructs the standard hidden `exec` group for agent/skill-only commands.

```ts
function hiddenExecGroup(description: string, entries: readonly ExtensionEntry[]): ExtensionGroupEntry;
```

Use this helper instead of hand-writing `{ group: "exec", hidden: true, ... }` in extension descriptors.

**Example.**

```ts
import { defineExtension, hiddenExecGroup } from "@nseng-ai/kernel/sdk";

export default defineExtension({
  group: "sample",
  description: "Sample commands.",
  entries: [
    hiddenExecGroup("Agent-only sample operations.", [
      { name: "inspect", load: () => import("./commands/inspect.ts") },
    ]),
  ],
});
```

---

## Commands

### `RawArgvCommand`

`RawArgvCommand` is the one command object contract loaded by the kernel. `defineRawCommand()` constructs it directly. Commands have `name`, `summary`, `description`, `run(ctx, { argv })`, and an optional neutral `complete(ctx, request)` hook. `argv` is the post-route argument tail.

```ts
interface RawArgvCommand<T = unknown> {
  name: string;
  summary: string;
  description: string;
  run(ctx: NsExtensionApi, invocation: { readonly argv: readonly string[] }): Promise<CommandExit<T>> | CommandExit<T>;
  complete?: KernelCommandCompletionProvider | undefined;
}
```

`defineCommand()` is the structured convenience adapter. It accepts a schema/handler spec, builds the Clinkr surface internally, and returns a neutral `RawArgvCommand`. The returned command's `run(ctx, { argv })` parses `argv`, handles `-h`/`--help`, `--json-schema`, and `--format human|json|markdown`, invokes the typed handler with `z.output<S>`, and returns standard command exits. `--format json` is always the standard ns machine envelope; `--json-schema` publishes the schema-backed input/output document.

**Example.** Use `defineCommand()` so `request` is inferred from `schema` while the exported command remains neutral:

```ts
import { defineCommand, ok, z } from "@nseng-ai/kernel/sdk";

export default defineCommand({
  name: "greet",
  summary: "Greet someone.",
  description: "Greet someone with a configurable name.",
  schema: z.object({ name: z.string().default("world") }),
  resultSchema: z.string(),
  handler: (ctx, request) => ok(`hello ${request.name}`),
});
```

### `KernelCommandCompletionProvider` / `NsCommandCompletionProvider`

```ts
type KernelCommandCompletionProvider = (
  ctx: NsExtensionApi,
  request: ClinkrDynamicCompletionRequest,
) =>
  | Promise<ClinkrCompletionResult | readonly ClinkrCompletionCandidate[]>
  | ClinkrCompletionResult
  | readonly ClinkrCompletionCandidate[];
```

Provides dynamic completion candidates for the selected command without invoking `run`. `NsCommandCompletionProvider` is a compatibility alias. Use it for cheap, read-only lookups such as branch names. Return either a candidate array or `{ candidates }`; candidate values are newline-rendered by the shell resolver, while descriptions are currently ignored by the newline renderer.

**Boundaries.**

- The provider runs only on the async completion path for the selected command; it is never invoked for unrelated commands and does not eager-load other extensions.
- Provider candidates are appended to the static command/option/enum candidates and deduped; the provider augments rather than replaces static completion.
- Keep it cheap and read-only: do not mutate state, prompt, or perform expensive work. It runs on every completion keystroke for the selected command.
- Provider failures are captured by the command adapter: static candidates are still returned, resolver stdout stays candidate-only, and the resolver keeps exit code `0`.

**Example.** Complete local branch names for a positional argument:

```ts
import { defineCommand, ok, z } from "@nseng-ai/kernel/sdk";

export default defineCommand({
  name: "checkout",
  summary: "Check out a branch.",
  description: "Check out an existing local branch.",
  schema: z.object({ branch: z.string().optional() }),
  resultSchema: z.string(),
  positionals: { branch: { position: 0 } },
  async completionProvider(ctx) {
    const result = await ctx.exec("git", ["branch", "--format=%(refname:short)"]);
    if (result.type !== "exited" || result.code !== 0 || result.signal !== null) return [];
    return result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((value) => ({ value, type: "positional-value" }));
  },
  handler: (ctx, request) => ok(request.branch ?? "(current)"),
});
```

The user-facing setup, resolver behavior, supported shells, and limitations for ns shell completion are documented in [`../README.md`](../README.md) under "Shell completion".

### `NsCommandSchema`

```ts
type NsCommandSchema = z.ZodObject;
```

The schema type a command may declare. Always a Zod object, built with `z` imported from `@nseng-ai/kernel/sdk`.

**Example.**

```ts
import { z } from "@nseng-ai/kernel/sdk";
import type { NsCommandSchema } from "@nseng-ai/kernel/sdk";

const schema: NsCommandSchema = z.object({ force: z.boolean().default(false) });
```

### `NsCommandRequest`

```ts
type NsCommandRequest<S extends NsCommandSchema> = z.output<S>;
```

The parsed-request type derived from a `defineCommand()` schema — the type `handler` receives as its second argument. Useful when the handler is a named function declared apart from the command spec.

**Example.**

```ts
import { ok, z } from "@nseng-ai/kernel/sdk";
import type { CommandExit, NsCommandRequest, NsExtensionApi } from "@nseng-ai/kernel/sdk";

const schema = z.object({ slug: z.string().optional() });

function runAutobranch(ctx: NsExtensionApi, request: NsCommandRequest<typeof schema>): CommandExit<string> {
  return ok(request.slug ?? "(auto)"); // request is { slug?: string }
}
```

### `PositionalSpec`

*Re-exported from `@nseng-ai/clinkr/raw`.* Assigns a schema field to a positional argument slot.

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

*Re-exported from `@nseng-ai/foundation/text-normalization`.* Normalizes model text before validation.

```ts
function normalizeTextOutput(output: string): string;
```

Converts CRLF/CR line endings to `\n`, removes outer blank lines, and strips one enclosing Markdown code fence when the whole response is fenced.

### `trimOuterBlankLines()`

*Re-exported from `@nseng-ai/foundation/text-normalization`.* Removes leading and trailing blank lines while preserving interior text.

```ts
function trimOuterBlankLines(text: string): string;
```

### `stripOuterCodeFence()`

*Re-exported from `@nseng-ai/foundation/text-normalization`.* Removes one outer Markdown code fence from a whole response.

```ts
function stripOuterCodeFence(text: string): string;
```

### `truncateTextHead()`

*Re-exported from `@nseng-ai/foundation/text-truncation`.* Keeps the head of a string inside a fixed character budget and appends a caller-defined marker.

```ts
function truncateTextHead(options: HeadTextTruncationOptions): string;
```

### `truncateTextHeadTail()`

*Re-exported from `@nseng-ai/foundation/text-truncation`.* Keeps head and tail excerpts inside a fixed character budget and inserts a caller-defined marker.

```ts
function truncateTextHeadTail(options: HeadTailTextTruncationOptions): string;
```

### `HeadTextTruncationOptions` / `HeadTailTextTruncationOptions`

*Re-exported from `@nseng-ai/foundation/text-truncation`.* Options for the truncation helpers.

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
import { failure, ok, usageError } from "@nseng-ai/kernel/sdk";
import type { CommandExit, NsExtensionApi } from "@nseng-ai/kernel/sdk";

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
  if (root.type !== "exited" || root.code !== 0 || root.signal !== null) {
    return failure("git-root-failed", "Not inside a git repository.");
  }
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

type ActiveOperation =
  | { kind: "command"; display: string }
  | { kind: "model"; operation: string; modelRef: string; detail?: string };

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
  | { type: "matrix-active-operations"; operations: readonly ActiveOperation[] };

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

function formatActiveOperation(operation: ActiveOperation): string;
function formatActiveOperationsLine(operations: readonly ActiveOperation[]): string | undefined;
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

The `NsProgressMatrixEvent` sub-union streams an optional per-row × per-column progress grid alongside the phase checklist (for example flow land's branch × Gate/Merge/Verify/Restack matrix). `matrix-declared` announces the column set (and optional row-label header) once; `matrix-rows` replaces the full row set; `matrix-cell` updates one cell's `NsProgressMatrixCellState` with optional compact `text` that hosts render only when it fits the column; `matrix-active-operations` carries typed transient operations that are currently blocking progress, including subprocess commands and model invocations. `formatActiveOperation` formats one operation, while `formatActiveOperationsLine` formats a non-empty operation list as a `Running: ...` line and returns `undefined` for an empty list. Hosts without matrix rendering (including `createProgressPhaseStateStore`) ignore matrix variants; listeners must tolerate them. Hosts with matrix rendering use the exported `isMatrixProgressEvent` guard to split matrix events off the phase wire, and the exported matrix text-layout helpers for shared display-width-aware label clamps, cell centering, and right padding.

Low-level `stdout`, `stderr`, and `onOutput` hooks remain compatibility primitives for durable stream output and transient live-output bridges. `ctx.commandIo` and `ctx.progress` are the preferred SDK services for command-authored human output and typed progress.

### `NsExecOptions`

Options for `ctx.exec`.

```ts
interface NsExecOptions {
  timeoutMs?: number;
  cwd?: string | undefined;
  stdin?: string | undefined;
  onStdout?: ((text: string) => void) | undefined;
  onStderr?: ((text: string) => void) | undefined;
}
```

**Fields.**

- `timeoutMs?` — kill the process after this many milliseconds.
- `cwd?` — working directory for this subprocess; defaults to the command context cwd.
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
type ExecResult =
  | { type: "exited"; stdout: string; stderr: string; code: number | null; signal: string | null }
  | { type: "spawn-failed"; stdout: string; stderr: string; error: string }
  | { type: "cancelled"; stdout: string; stderr: string; code: number | null; signal: string | null }
  | { type: "timed-out"; stdout: string; stderr: string; code: number | null; signal: string | null };
```

Every variant carries captured `stdout` and `stderr`. Ordinary exits, cancellation, and timeout also
carry the observed exit `code` and termination `signal`; spawn failures carry an `error` string.
Only an `exited` result with code `0` and a null signal is successful.

**Example.**

```ts
const log = await ctx.exec("git", ["log", "-1", "--oneline"]);
if (log.type === "exited" && log.code === 0 && log.signal === null) {
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
import { z } from "@nseng-ai/kernel/sdk";

const schema = z.object({ slug: z.string().optional() });
```

Using the SDK export keeps schemas on the same Zod identity as the ns host at runtime.
