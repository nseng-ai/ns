# Type System Reference

The throughline: types should make illegal states hard to express and should stay aligned with runtime
behavior. Prefer patterns that keep JavaScript output simple and type information precise.

## Erasable TypeScript

In many modern runtimes and build setups, TypeScript syntax is stripped rather than transformed. Code
that uses `enum`, `namespace`, parameter properties, or CommonJS `import =`/`export =` needs emit-time
transformation and is less portable.

Default for new code:

```ts
type Status = "idle" | "running" | "failed";

class Runner {
  private status: Status;

  constructor(status: Status) {
    this.status = status;
  }
}
```

If a project already uses emit-only features, do not churn existing code mechanically. Prefer erasable
syntax for new isolated code unless local conventions say otherwise.

## String-literal unions instead of enums

Unions are plain type information and compose with template literals, discriminated unions, mapped
types, and runtime literal arrays.

```ts
const statuses = ["queued", "running", "complete", "failed"] as const;
type Status = (typeof statuses)[number];
```

When runtime validation is needed, use the literal list as the source of truth for both validator and
type. Avoid maintaining a TS enum plus a separate runtime list.

## Discriminated unions

Use one stable field to identify each runtime variant:

```ts
type LoadState =
  | { type: "idle" }
  | { type: "loading"; requestId: string }
  | { type: "loaded"; value: Data }
  | { type: "failed"; error: LoadError };
```

Consume with `switch`. Add `assertNever` when the project does not have exhaustive-switch linting.
Prefer one explicit union over several booleans like `isLoading`, `hasLoaded`, and `hasFailed`.

## Open unions for registries

Closed unions are right for closed domains. Registries are often open: plugins, storage drivers,
payment processors, transport protocols, command IDs.

```ts
type KnownTransport = "http" | "websocket";
type TransportId = KnownTransport | (string & {});
```

This keeps known values discoverable while allowing external extensions. Use this only when unknown
custom values are intentionally allowed.

## Tag-through-generics

When a tag controls legal config, push that tag through the type:

```ts
type BackendConfig<T extends BackendId> = T extends "postgres" ? PostgresConfig
  : T extends "s3" ? S3Config
  : never;

interface Backend<T extends BackendId = BackendId> {
  id: T;
  config?: BackendConfig<T>;
}
```

Callers with `Backend<"postgres">` see only `PostgresConfig`. Generic registry storage may erase the
specific tag; recover it in one wrapper after checking `backend.id === provider.id`.

## `satisfies`

Use `satisfies` when an object literal must conform to a shape while preserving precise literal types:

```ts
const keybindings = {
  "editor.save": { defaultKeys: ["ctrl+s"], description: "Save" },
} as const satisfies KeybindingDefinitions;
```

Avoid `as KeybindingDefinitions`; it can hide missing fields and widen useful literals.

## Post-defaulting types

After applying defaults, downstream code should not keep checking for undefined fields. Express that:

```ts
interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

type ResolvedRetryOptions = Required<RetryOptions>;

function resolveRetryOptions(options: RetryOptions): ResolvedRetryOptions {
  return { maxAttempts: 3, baseDelayMs: 100, ...options };
}
```

For partial subsets, use `Required<Omit<T, "field">>` or an explicit resolved interface.

## Declaration merging as an extension point

A neutral core can expose an empty interface for app-specific variants:

```ts
export interface CustomEvents {}
export type Event = CoreEvent | CustomEvents[keyof CustomEvents];
```

A feature can then add events without forking the core union:

```ts
declare module "../core/events.ts" {
  interface CustomEvents {
    reportGenerated: { type: "report_generated"; path: string };
  }
}
```

Use this intentionally. For a closed application union, a normal union in one file is simpler.

## `interface` vs. `type`

Use `interface` for named object shapes and contracts:

```ts
interface Renderer {
  render(lines: string[]): void;
}
```

Use `type` for unions, function aliases, conditional types, mapped types, primitives, and tuples:

```ts
type RenderEvent = { type: "start" } | { type: "end" };
type RenderFunction = (event: RenderEvent) => void;
```

## `unknown` at boundaries

External data is `unknown` until proven:

```ts
function isConfig(value: unknown): value is Config {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { endpoint?: unknown };
  return typeof candidate.endpoint === "string";
}
```

Do not launder data through `any`. A value that enters as `unknown` should either be narrowed, rejected,
or remain opaque.

## Narrow casts

Some library APIs force casts. Keep them:

- adjacent to the runtime check that justifies them;
- wrapped in one helper if repeated;
- documented when the relationship is non-obvious.

A cast far from the invariant is a future bug.
