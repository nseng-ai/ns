# `@sdl/sdl/sdk` — Reference

`@sdl/sdl/sdk` is the public author API for SDL extensions — the one subpath you import from to write an SDL extension; this document is the complete reference for its exports.

Import everything from the subpath itself:

```ts
import { defineExtension, failed, ok, z } from "@sdl/sdl/sdk";
import type { SdlContext, SdlResult } from "@sdl/sdl/sdk";
```

Do not import SDL implementation modules (`@sdl/sdl/*` other than `./sdk`, `@sdl/core/*`, `@sdl/clinkr/*`). The SDK re-exports the few lower-package types an author needs; those are documented below as first-party SDK vocabulary, with their origin noted.

The exports are grouped by the role they play when authoring a command: you **declare** an extension and its commands, your command **receives** an execution context, and it **returns** a result.

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

### `SdlExtension`

The shape of an SDL extension.

```ts
interface SdlExtension<TCommands extends readonly SdlCommand[] = readonly SdlCommand[]> {
  commands?: TCommands | undefined;
}
```

**Fields.**

- `commands?` — the extension's command contributions. Omit it for an extension that contributes no commands to the current SDL surface.

---

## Commands

### `SdlCommand`

One flat `sdl <name>` command contribution inside an extension's `commands` array.

```ts
interface SdlCommand<S extends SdlCommandSchema = z.ZodObject> {
  name: string;
  description: string;
  schema?: S | undefined;
  positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>> | undefined;
  run(ctx: SdlContext, request: z.output<S>): Promise<SdlResult> | SdlResult;
}
```

**Fields.**

- `name` — the flat command name. Must match `[a-z][a-z0-9-]*`: no nested groups, slashes, colons, spaces, or uppercase.
- `description` — one-line help text shown in `sdl --help`.
- `schema?` — a Zod object schema (`SdlCommandSchema`) describing the command's options. Omit for a command with no parsed arguments.
- `positionals?` — maps schema field names to positional slots (`PositionalSpec`). Only keys present in the schema are valid.
- `run(ctx, request)` — the command body. Receives the execution context and the parsed request (`z.output<schema>`), and returns an `SdlResult` (sync or async).

### `SdlCommandSchema`

```ts
type SdlCommandSchema = z.ZodObject;
```

The schema type a command may declare. Always a Zod object, built with the SDK's `z`.

### `SdlCommandRequest`

```ts
type SdlCommandRequest<S extends SdlCommandSchema> = z.output<S>;
```

The parsed-request type derived from a command's schema — the type `run` receives as its second argument.

### `PositionalSpec`

*Re-exported from `@sdl/clinkr/raw`.* Assigns a schema field to a positional argument slot.

```ts
interface PositionalSpec {
  position: number;
}
```

**Fields.**

- `position` — the zero-based positional index this field reads from.

### `commandSucceeded()`

Tests whether an executed command succeeded.

```ts
function commandSucceeded(result: ExecResult): boolean;
```

**Description.** Returns `true` only when the process exited with code `0` and was not killed. Use it to branch inside `run` after a `ctx.exec(...)` call. See `ExecResult` under [Execution context](#execution-context).

### `formatCommandEvidence()`

Formats a uniform, reviewer-facing evidence block describing a command invocation and its result.

```ts
function formatCommandEvidence(options: FormatCommandEvidenceOptions): string;
```

**Description.** Produces a multi-line string with the intro, the command, the cwd, exit code, killed flag, optional guidance, and the captured stdout/stderr. Pass the returned string to `ok()` or `failed()` as the result message.

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

### `ok()`

Builds a success result.

```ts
function ok(message: string): SdlResult;
```

**Parameters.** `message` — the success message printed to the user.

### `failed()`

Builds a failure result.

```ts
function failed(message: string, exitCode?: number): SdlResult;
```

**Parameters.**

- `message` — the failure message printed to the user.
- `exitCode?` — process exit code; defaults to `1`.

---

## Execution context

### `SdlContext`

The capabilities a command receives as the first argument to `run`. SDL owns the host environment; the command owns the exact external commands, prompts, and policy it applies.

```ts
interface SdlContext {
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

### `SdlOutputStream`

```ts
type SdlOutputStream = "stdout" | "stderr";
```

Tags which stream a chunk belongs to in the `onOutput` hook.

### `SdlConfirmPrompt`

```ts
type SdlConfirmPrompt = (title: string, message: string) => Promise<boolean> | boolean;
```

The signature of the optional `ctx.confirm` hook. Returns (sync or async) whether the user approved.

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

### `TextGenerationRequest`

```ts
interface TextGenerationRequest {
  modelRef: string;
  system: string;
  prompt: string;
  maxTokens?: number;
  reasoning?: "minimal" | "low";
  operation?: "checkpoint-message" | "changes-summary" | "pr-description" | "submit-failure";
}
```

**Fields.**

- `modelRef` — model reference string to generate with.
- `system` — system prompt.
- `prompt` — user prompt.
- `maxTokens?` — optional output cap.
- `reasoning?` — optional reasoning effort, `"minimal"` or `"low"`.
- `operation?` — optional operation tag for host-side routing/telemetry.

### `TextGenerationResult`

```ts
type TextGenerationResult = { ok: true; text: string } | { ok: false; error: string };
```

A discriminated union on `ok`: either the generated `text` or an `error` message.

---

## Schema

### `z`

The SDK re-exports `z` from [zod](https://zod.dev). Build command schemas with **this** `z` so schemas share the SDK's Zod identity rather than a separately-installed copy of zod. Its API is zod's own — see the zod documentation; it is not re-documented here.

```ts
import { z } from "@sdl/sdl/sdk";

const schema = z.object({ slug: z.string().optional() });
```
