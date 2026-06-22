# `@sdl/sdl/sdk` — Reference

`@sdl/sdl/sdk` is the public author API for SDL extensions — the one subpath you import from to write an SDL extension; this document is the complete reference for its exports.

Import the SDK's own surface from the subpath itself:

```ts
import { defineExtension, failed, ok, z } from "@sdl/sdl/sdk";
import type { SdlExtensionApi, SdlResult } from "@sdl/sdl/sdk";
```

Command schemas are [Zod](https://zod.dev) schemas. Import the SDK's `z` export so extension modules use the same schema identity as the SDL host.

Do not import SDL implementation modules (`@sdl/sdl/*` other than `./sdk`, `@sdl/core/*`, `@sdl/clinkr/*`) from SDL extension authoring modules. Checked-in `.sdl/extensions` modules follow the same SDK-only rule; if repeated command migrations need shared SDL-owned behavior, promote a deliberate helper into `@sdl/sdl/sdk` and document it here instead of importing internal migration subpaths.

`internalMigrationExports` in `ts/packages/sdl/package.json` are package/internal migration support for workspace code that has not completed a cutover. They are not extension-author API.

The SDK is intentionally small. A command should own its workflow policy — prompts, validation, repair, external commands, GitHub/Graphite choreography, and confirmation boundaries — unless repeated command migrations prove a deeper kernel helper belongs in this author API. When a helper is promoted, this reference becomes the source of truth for the new public surface.

The exports are grouped by the role they play when authoring a command: you **declare** an extension and its commands, your command **receives** an execution context, and it **returns** a result. Each entry carries a minimal worked example; the examples share a running `git`-driven command so they compose into a realistic extension.

---

## Entry point

### `defineExtension()`

Declares an SDL extension. The default export of every SDL extension module is a call to `defineExtension()`.

```ts
function defineExtension(extension: SdlExtension): SdlExtension;
```

**Description.** At runtime `defineExtension()` returns its argument unchanged — it is an identity function. Its job is entirely at the type level: a family of overloads preserves per-command schema inference (so each command's `run` sees the request type implied by its own `schema`) for up to four explicit commands plus a rest tuple. You do not interact with the overloads directly; pass an extension object and TypeScript infers the rest.

**Parameters.**

- `extension: SdlExtension` — the extension to declare. Commands are optional; `defineExtension({})` is a valid commandless extension.

**Returns.** The same `SdlExtension`, with command types preserved.

**Notes.**

- Use as the module's default export: `export default defineExtension({ ... })`.
- Single-file extensions under `.sdl/extensions/` are leaf modules. Workspace packages must never import from them.

**Example.**

```ts
import { defineExtension, ok } from "@sdl/sdl/sdk";

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

### `SdlExtension`

The shape of an SDL extension.

```ts
interface SdlExtension<TCommands extends readonly SdlCommand[] = readonly SdlCommand[]> {
  commands?: TCommands | undefined;
}
```

**Fields.**

- `commands?` — the extension's command contributions. Omit it for an extension that contributes no commands to the current SDL surface.

**Example.**

```ts
// A commandless extension is valid — it simply contributes nothing to the
// current SDL surface.
export default defineExtension({});
```

---

## Commands

### `SdlCommand`

One flat `sdl <name>` command contribution inside an extension's `commands` array.

```ts
interface SdlCommand<S extends SdlCommandSchema = z.ZodObject> {
  name: string;
  summary: string;
  description: string;
  schema?: S | undefined;
  positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>> | undefined;
  run(ctx: SdlExtensionApi, request: z.output<S>): Promise<SdlResult> | SdlResult;
}
```

**Fields.**

- `name` — the flat command name. Must match `[a-z][a-z0-9-]*`: no nested groups, slashes, colons, spaces, or uppercase.
- `summary` — required one-line text shown in `sdl --help`.
- `description` — full help text shown in `sdl <cmd> --help`.
- `schema?` — a Zod object schema (`SdlCommandSchema`) describing the command's options. Omit for a command with no parsed arguments.
- `positionals?` — maps schema field names to positional slots (`PositionalSpec`). Only keys present in the schema are valid.
- `run(ctx, request)` — the command body. Receives the execution context and the parsed request (`z.output<schema>`), and returns an `SdlResult` (sync or async).

**Example.** Declared inline so `request` is inferred from `schema`:

```ts
import { defineExtension, ok, z } from "@sdl/sdl/sdk";

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

### `SdlCommandSchema`

```ts
type SdlCommandSchema = z.ZodObject;
```

The schema type a command may declare. Always a Zod object, built with `z` imported from `@sdl/sdl/sdk`.

**Example.**

```ts
import { z } from "@sdl/sdl/sdk";
import type { SdlCommandSchema } from "@sdl/sdl/sdk";

const schema: SdlCommandSchema = z.object({ force: z.boolean().default(false) });
```

### `SdlCommandRequest`

```ts
type SdlCommandRequest<S extends SdlCommandSchema> = z.output<S>;
```

The parsed-request type derived from a command's schema — the type `run` receives as its second argument. Useful when `run` is a named function declared apart from the command object.

**Example.**

```ts
import { z } from "@sdl/sdl/sdk";
import type { SdlCommandRequest, SdlExtensionApi, SdlResult } from "@sdl/sdl/sdk";

const schema = z.object({ slug: z.string().optional() });

function runAutobranch(ctx: SdlExtensionApi, request: SdlCommandRequest<typeof schema>): SdlResult {
  return ok(request.slug ?? "(auto)"); // request is { slug?: string }
}
```

### `PositionalSpec`

*Re-exported from `@sdl/clinkr/raw`.* Assigns a schema field to a positional argument slot.

```ts
interface PositionalSpec {
  position: number;
}
```

**Fields.**

- `position` — the zero-based positional index this field reads from.

**Example.** Map the `slug` option to the first positional, so `sdl autobranch my-feature` fills it:

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

### `commandSucceeded()`

Tests whether an executed command succeeded.

```ts
function commandSucceeded(result: ExecResult): boolean;
```

**Description.** Returns `true` only when the process exited with code `0` and was not killed. Use it to branch inside `run` after a `ctx.exec(...)` call. See `ExecResult` under [Execution context](#execution-context). Prefer it over a bare `result.code === 0` check, which misses killed (e.g. timed-out) processes.

**Example.**

```ts
const status = await ctx.exec("git", ["status", "--porcelain"]);
if (!commandSucceeded(status)) {
  return failed("Could not read git status.");
}
```

### `formatCommandEvidence()`

Formats a uniform, reviewer-facing evidence block describing a command invocation and its result.

```ts
function formatCommandEvidence(options: FormatCommandEvidenceOptions): string;
```

**Description.** Produces a multi-line string with the intro, the command, the cwd, exit code, killed flag, optional guidance, and the captured stdout/stderr. Pass the returned string to `ok()` or `failed()` as the result message.

**Example.**

```ts
return failed(
  formatCommandEvidence({
    intro: "Could not inspect the worktree status.",
    command: "git status --porcelain",
    cwd: ctx.cwd,
    result: status,
    guidance: "Fix the repository state, then retry.",
  }),
);
```

### `FormatCommandEvidenceOptions`

*Re-exported from `@sdl/core/exec`.* Input to `formatCommandEvidence()`.

```ts
interface FormatCommandEvidenceOptions {
  intro: string;
  command: string;
  cwd: string;
  result: ExecResult;
  guidance?: string | undefined;
}
```

**Fields.**

- `intro` — leading sentence describing what happened.
- `command` — the human-readable command line (e.g. `git status --porcelain`).
- `cwd` — the working directory the command ran in; typically `ctx.cwd`.
- `result` — the `ExecResult` returned by `ctx.exec`.
- `guidance?` — optional remediation guidance appended before the captured output.

**Example.** Built and consumed in the `formatCommandEvidence()` example above.

---

## Text helpers

### `normalizeTextOutput()`

*Re-exported from `@sdl/core/text-normalization`.* Normalizes model text before validation.

```ts
function normalizeTextOutput(output: string): string;
```

Converts CRLF/CR line endings to `\n`, removes outer blank lines, and strips one enclosing Markdown code fence when the whole response is fenced.

### `trimOuterBlankLines()`

*Re-exported from `@sdl/core/text-normalization`.* Removes leading and trailing blank lines while preserving interior text.

```ts
function trimOuterBlankLines(text: string): string;
```

### `stripOuterCodeFence()`

*Re-exported from `@sdl/core/text-normalization`.* Removes one outer Markdown code fence from a whole response.

```ts
function stripOuterCodeFence(text: string): string;
```

### `truncateTextHead()`

*Re-exported from `@sdl/core/text-truncation`.* Keeps the head of a string inside a fixed character budget and appends a caller-defined marker.

```ts
function truncateTextHead(options: HeadTextTruncationOptions): string;
```

### `truncateTextHeadTail()`

*Re-exported from `@sdl/core/text-truncation`.* Keeps head and tail excerpts inside a fixed character budget and inserts a caller-defined marker.

```ts
function truncateTextHeadTail(options: HeadTailTextTruncationOptions): string;
```

### `HeadTextTruncationOptions` / `HeadTailTextTruncationOptions`

*Re-exported from `@sdl/core/text-truncation`.* Options for the truncation helpers.

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

### `SdlResult`

The value a command's `run` returns.

```ts
type SdlResult =
  | { ok: true; message: string }
  | { ok: false; exitCode: number; message: string };
```

A discriminated union on `ok`. Construct values with `ok()` and `failed()` rather than building the literal by hand.

**Example.**

```ts
import type { SdlExtensionApi, SdlResult } from "@sdl/sdl/sdk";

function run(ctx: SdlExtensionApi): SdlResult {
  return ctx.env["DRY_RUN"] ? ok("would run") : ok("ran");
}
```

### `ok()`

Builds a success result.

```ts
function ok(message: string): SdlResult;
```

**Parameters.** `message` — the success message printed to the user.

**Example.**

```ts
return ok("Pushed the current branch.");
```

### `failed()`

Builds a failure result.

```ts
function failed(message: string, exitCode?: number): SdlResult;
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

### `SdlExtensionApi`

The capabilities a command receives as the first argument to `run`. SDL owns the host environment; the command owns the exact external commands, prompts, and policy it applies.

```ts
interface SdlExtensionApi {
  cwd: string;
  env: Record<string, string | undefined>;
  exec(command: string, args: string[], options?: SdlExecOptions): Promise<ExecResult>;
  textGenerator: TextGenerator;
  stdout?: ((text: string) => void) | undefined;
  stderr?: ((text: string) => void) | undefined;
  onOutput?: ((stream: SdlOutputStream, text: string) => void) | undefined;
  confirm?: SdlConfirmPrompt | undefined;
  extensions?: Readonly<Record<string, unknown>> | undefined;
}
```

**Fields.**

- `cwd` — repository working directory for the command's execution.
- `env` — environment visible to the command and to shell execution.
- `exec(command, args, options?)` — low-level argv execution. The command owns exactly which programs it runs. Returns an `ExecResult`.
- `textGenerator` — the text-generation capability; see [Text generation](#text-generation). The command owns its prompts, validation, and repair policy.
- `stdout?` / `stderr?` — durable output hooks for commands that stream multiple chunks before returning. `stdout` is reserved for primary output.
- `onOutput?` — transient live-progress hook for UI bridges, tagged by `SdlOutputStream`.
- `confirm?` — optional interactive confirmation hook (`SdlConfirmPrompt`).
- `extensions?` — project-local extension bag. A command owns any values it reads from it.

**Example.**

```ts
async run(ctx: SdlExtensionApi) {
  const root = await ctx.exec("git", ["rev-parse", "--show-toplevel"], {
    timeoutMs: 30_000,
  });
  if (!commandSucceeded(root)) return failed("Not inside a git repository.", 2);
  return ok(root.stdout.trim());
}
```

### `SdlExecOptions`

Options for `ctx.exec`.

```ts
interface SdlExecOptions {
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

*Re-exported from `@sdl/core/exec`.* The result of `ctx.exec` — the input that `commandSucceeded()` and `formatCommandEvidence()` consume.

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
if (commandSucceeded(log)) {
  ctx.stdout?.(log.stdout.trim());
}
```

### `SdlOutputStream`

```ts
type SdlOutputStream = "stdout" | "stderr";
```

Tags which stream a chunk belongs to in the `onOutput` hook.

**Example.**

```ts
run(ctx: SdlExtensionApi) {
  ctx.onOutput?.("stderr", "working…\n");
  return ok("done");
}
```

### `SdlConfirmPrompt`

```ts
type SdlConfirmPrompt = (title: string, message: string) => Promise<boolean> | boolean;
```

The signature of the optional `ctx.confirm` hook. Returns (sync or async) whether the user approved.

**Example.** Gate a destructive step; treat an absent hook as "not approved":

```ts
const approved = await ctx.confirm?.("Edit PR", "Update the PR body on GitHub?");
if (approved !== true) {
  return failed("Cancelled; GitHub was not modified.");
}
```

---

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
type TextGenerationResult = { ok: true; text: string } | { ok: false; error: string };
```

A discriminated union on `ok`: either the generated `text` or an `error` message.

**Example.**

```ts
const result = await ctx.textGenerator.generateText(request);
if (!result.ok) {
  return failed(`Generation failed: ${result.error}`);
}
ctx.stdout?.(result.text);
```

---

## Command helper facades

These namespaced facades are SDL-owned command-author helpers. They expose repeated lifecycle-command primitives without requiring extensions to import SDL implementation subpaths.

### `pendingWorktree`

Loads and formats a pending worktree snapshot using the command's `SdlExtensionApi`.

```ts
const loaded = await pendingWorktree.loadSnapshot(ctx);
if (!loaded.ok) return failed(pendingWorktree.formatError(loaded.error), 2);
if (loaded.snapshot.isClean) return ok("Working tree is clean.");
```

**Exports.**

- `pendingWorktree.loadSnapshot(ctx)` — runs read-only git facts through `ctx.exec` and returns `SdkPendingWorktreeLoadResult`.
- `pendingWorktree.formatError(error)` — formats extension-facing pending-worktree failures.
- `pendingWorktree.formatCommandDetails(result)` — formats a low-level command result as `exit <code>...` details.
- Types: `SdkPendingWorktreeSnapshot`, `SdkPendingWorktreeError`, `SdkPendingWorktreeLoadResult`, `SdkWorktreeCommandResult`.

`SdkPendingWorktreeSnapshot` uses `isClean` as the author-facing clean-worktree predicate.

### `checkpoint`

Prepares validated checkpoint commit messages and creates checkpoint commits.

```ts
const prepared = await checkpoint.prepareMessage({
  status: snapshot.status,
  diff: snapshot.diff,
  textGenerator: ctx.textGenerator,
  modelRef: textGeneration.selectCheckpointModelRef(ctx.env),
});
if (!prepared.ok) return failed(prepared.error, 2);

const committed = await checkpoint.createCommit(ctx, prepared.message);
if ("error" in committed) return failed(committed.error, 2);
```

**Exports.**

- `checkpoint.prepareMessage(options)` — routes to SDL's canonical checkpoint prompt, validation, and repair flow.
- `checkpoint.createCommit(ctx, message)` — stages all changes, commits with the prepared message, and returns the created commit summary.
- Types: `PrepareCheckpointMessageOptions`, `SdkPreparedCheckpointMessage`.

### `textGeneration`

Groups model-selection constants and helpers used by SDL lifecycle commands.

```ts
const modelRef = textGeneration.selectChangesModelRef(ctx.env);
```

**Exports.**

- `textGeneration.selectCheckpointModelRef(env)`, `textGeneration.selectChangesModelRef(env)`, `textGeneration.selectSubmitFailureModelRef(env)`.
- Object constants: `CHECKPOINT_MODEL_ENV`, `LEGACY_CHECKPOINT_MODEL_ENV`, `DEFAULT_CHECKPOINT_MODEL_REF`, `CHANGES_MODEL_ENV`, `LEGACY_CHANGES_MODEL_ENV`, `DEFAULT_CHANGES_MODEL_REF`, `SUBMIT_FAILURE_MODEL_ENV`, `DEFAULT_SUBMIT_FAILURE_MODEL_REF`.
- The same constants and selector functions are also named exports from `@sdl/sdl/sdk` for compatibility with existing SDK callers.

---

## Schema

### `z` (from Zod)

Command schemas are [Zod](https://zod.dev) schemas. The SDK exports the host's schema builder so single-file extensions do not need their own resolvable `zod` dependency. Its API is Zod's own — see the Zod documentation; it is not re-documented here.

```ts
import { z } from "@sdl/sdl/sdk";

const schema = z.object({ slug: z.string().optional() });
```

Using the SDK export keeps schemas on the same Zod identity as the SDL host at runtime.
