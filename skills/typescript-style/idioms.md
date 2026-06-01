# TypeScript Style — Idiom Cookbook

Copy-paste-ready patterns. Read `core-rules.md` for the rules; this file shows how to write the common
forms in a project-neutral way.

---

## Closed sets

```ts
// Closed set of values → string-literal union, not enum.
type RetryPolicy = "never" | "once" | "exponential";

// Runtime list + static type from one source.
const retryPolicies = ["never", "once", "exponential"] as const;
type RetryPolicy = (typeof retryPolicies)[number];
```

## Extensible identifier (open union)

```ts
// Known values get autocomplete; custom plugin/backend ids still type-check.
type KnownBackendId = "memory" | "postgres" | "s3";
type BackendId = KnownBackendId | (string & {});
```

## Discriminated union + exhaustive switch

```ts
interface TextBlock {
  type: "text";
  text: string;
}
interface ImageBlock {
  type: "image";
  data: Uint8Array;
  mimeType: string;
}
interface ActionBlock {
  type: "action";
  name: string;
  input: Record<string, unknown>;
}
type Block = TextBlock | ImageBlock | ActionBlock;

function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}

function renderBlock(block: Block): string {
  switch (block.type) {
    case "text":
      return block.text;
    case "image":
      return `[image ${block.mimeType}]`;
    case "action":
      return `${block.name}(...)`;
    default:
      return assertNever(block);
  }
}
```

Encode legality in the union, not scattered runtime checks:

```ts
interface UserMessage {
  role: "user";
  content: string | Array<TextBlock | ImageBlock>;
}
interface SystemMessage {
  role: "system";
  content: string;
}
interface WorkerMessage {
  role: "worker";
  content: Array<TextBlock | ActionBlock>;
}
type Message = UserMessage | SystemMessage | WorkerMessage;
```

## Tag-through-generics + conditional config

```ts
interface PostgresConfig {
  sslMode: "disable" | "require";
}
interface S3Config {
  region: string;
  bucket: string;
}

type BackendConfig<TBackend extends BackendId> = TBackend extends "postgres" ? PostgresConfig
  : TBackend extends "s3" ? S3Config
  : never;

interface Backend<TBackend extends BackendId = BackendId> {
  id: TBackend;
  config?: BackendConfig<TBackend>;
}
```

## Backend/provider as a tiny neutral contract

```ts
interface RequestContext {
  signal?: AbortSignal;
  logger?: Logger;
}

type EventStream<TEvent> = AsyncIterable<TEvent>;

type StreamFunction<TBackend extends BackendId> = (
  backend: Backend<TBackend>,
  request: NeutralRequest,
  context: RequestContext,
) => EventStream<NeutralEvent>;

interface BackendProvider<TBackend extends BackendId = BackendId> {
  id: TBackend;
  stream: StreamFunction<TBackend>;
}

const providers = new Map<string, BackendProvider>();

function registerProvider<TBackend extends BackendId>(provider: BackendProvider<TBackend>): void {
  const wrapped: BackendProvider = {
    id: provider.id,
    stream: (backend, request, context) => {
      if (backend.id !== provider.id) {
        throw new Error(`Mismatched backend: ${backend.id} expected ${provider.id}`);
      }
      return provider.stream(backend as Backend<TBackend>, request, context);
    },
  };
  providers.set(provider.id, wrapped);
}
```

## Declarative capability flags over runtime sniffing

```ts
interface BackendCapabilities {
  supportsBatching: boolean;
  maxPayloadBytes: number;
  consistency: "strong" | "eventual";
}

function resolveCapabilities(backend: Backend): Required<BackendCapabilities> {
  // Fill defaults once at the boundary.
  return {
    supportsBatching: false,
    maxPayloadBytes: 1_000_000,
    consistency: "strong",
    ...lookupBackendMetadata(backend.id),
  };
}

const capabilities = resolveCapabilities(backend);
if (capabilities.supportsBatching) {
  // No scattered backend-name checks.
}
```

## Errors as values

```ts
// 1) Async boundary: failure is a terminal event, not a thrown surprise.
type JobEvent =
  | { type: "progress"; completed: number; total: number }
  | { type: "done"; result: JobResult }
  | { type: "error"; reason: "failed" | "aborted"; message: string };

async function* runJob(input: JobInput, signal?: AbortSignal): AsyncGenerator<JobEvent> {
  try {
    for await (const progress of executeJob(input, signal)) {
      yield { type: "progress", completed: progress.completed, total: progress.total };
    }
    yield { type: "done", result: buildResult() };
  } catch (error) {
    yield {
      type: "error",
      reason: signal?.aborted ? "aborted" : "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

// 2) Synchronous fallible logic: Result<T, E>.
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// 3) Stable typed error for thrown programmer/integration failures.
class ConfigError extends Error {
  code: "missing-field" | "invalid-value";
  cause?: unknown;

  constructor(code: ConfigError["code"], message: string, cause?: unknown) {
    super(message);
    this.name = "ConfigError";
    this.code = code;
    this.cause = cause;
  }
}
```

## Class with explicit fields + change callbacks

```ts
class EditorBuffer {
  private lines: string[] = [""];
  private cursor: Cursor = { line: 0, column: 0 };
  private renderScheduler: RenderScheduler;

  public onChange?: (text: string) => void;

  constructor(renderScheduler: RenderScheduler) {
    this.renderScheduler = renderScheduler;
  }

  insert(text: string): void {
    applyInsert(this.lines, this.cursor, text);
    if (this.onChange) this.onChange(this.getText());
    this.renderScheduler.requestRender();
  }

  getLines(): string[] {
    return [...this.lines];
  }
}
```

## Plan/execute split

```ts
function prepareMigration(schema: Schema, target: Schema): MigrationPlan {
  return diffSchemas(schema, target);
}

async function executeMigration(
  plan: MigrationPlan,
  database: Database,
  signal?: AbortSignal,
): Promise<Result<MigrationResult, MigrationError>> {
  if (signal?.aborted) return err({ code: "aborted", message: "Migration aborted" });
  return database.apply(plan, signal);
}
```

## Budgeting based on real measurements plus estimated tail

```ts
function shouldCompact(usedTokens: number, contextWindow: number, reserveTokens: number): boolean {
  return usedTokens > contextWindow - reserveTokens;
}

function estimateTailTokens(messages: Message[]): number {
  const chars = messages.reduce((total, message) => total + textLength(message), 0);
  return Math.ceil(chars / 4);
}
```

## Extend a neutral core without forking (declaration merging)

```ts
// core/events.ts
export interface CustomEvents {}
export type AppEvent = CoreEvent | CustomEvents[keyof CustomEvents];

// feature/events.ts
declare module "../core/events.ts" {
  interface CustomEvents {
    auditLogWritten: { type: "audit_log_written"; path: string };
  }
}
```

## Schema → types end to end

```ts
const readSchema = Type.Object({
  path: Type.String(),
  lineRange: Type.Optional(Type.String()),
});
type ReadInput = Static<typeof readSchema>;

const readTool = defineTool({
  name: "read",
  parameters: readSchema,
  async execute(input: ReadInput, context: ToolContext) {
    context.signal?.throwIfAborted?.();
    const result = await context.files.read(input.path, input.lineRange);
    if (!result.ok) return err(result.error);
    return ok({ content: [{ type: "text", text: result.value }] });
  },
});
```

## Configurable keybindings

```ts
// Avoid hardcoded key checks at call sites.
if (keybindings.matches(data, "editor.cut")) cutSelection();

export const keybindingDefaults = {
  "editor.cut": { defaultKeys: ["ctrl+x"], description: "Cut selection" },
  "editor.copy": { defaultKeys: ["ctrl+c"], description: "Copy selection" },
} as const satisfies KeybindingDefinitions;
```

## Type-safe string keys with template-literal types

```ts
type ModifierName = "ctrl" | "shift" | "alt" | "meta";
type BaseKey = "a" | "b" | "c" | "left" | "right" | "enter";
type KeyId = BaseKey | `${ModifierName}+${BaseKey}`;

const Key = {
  ctrl: <K extends BaseKey>(key: K) => `ctrl+${key}` as const,
};
```

## `unknown` + type guard at a boundary

```ts
interface NativeHelper {
  run(input: string, signal?: AbortSignal): Promise<string>;
}

function isNativeHelper(value: unknown): value is NativeHelper {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as { run?: unknown }).run === "function";
}
```
