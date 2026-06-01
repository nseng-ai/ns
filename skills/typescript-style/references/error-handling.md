# Error Handling Reference

The goal is predictable control flow. Callers should know from the type whether failure is expected and
how to handle it.

## Expected failures are values

At system boundaries, failure is normal: network requests fail, files are missing, users cancel,
plugins throw, validation rejects input. Model those outcomes in returned data.

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

function parsePort(value: unknown): Result<number, { code: "invalid-port"; message: string }> {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return { ok: false, error: { code: "invalid-port", message: "Port must be a positive integer" } };
  }
  return { ok: true, value };
}
```

Use helper constructors if the project likes them:

```ts
const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

## Async streams terminate with error events

For streaming or event-producing APIs, do not make consumers catch a rejected producer for expected
runtime failures. Emit a terminal error event, then close.

```ts
type SyncEvent =
  | { type: "item"; item: Item }
  | { type: "done"; count: number }
  | { type: "error"; reason: "failed" | "aborted"; message: string };

async function* syncItems(signal?: AbortSignal): AsyncGenerator<SyncEvent> {
  let count = 0;
  try {
    for await (const item of fetchItems(signal)) {
      count += 1;
      yield { type: "item", item };
    }
    yield { type: "done", count };
  } catch (error) {
    yield {
      type: "error",
      reason: signal?.aborted ? "aborted" : "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
```

## Throw for programmer errors and invariants

Throw when continuing would hide a bug:

- impossible discriminated-union branch;
- mismatched registry tag after a runtime assertion should have prevented it;
- corrupted internal state;
- renderer output that violates a hard terminal/screen invariant;
- a public API called in the wrong lifecycle state.

Thrown errors should be loud and actionable:

```ts
if (lineWidth > terminalWidth) {
  throw new Error(`Renderer produced an over-wide line: ${lineWidth} > ${terminalWidth}`);
}
```

## Typed errors at layer seams

When throwing across a layer seam is the right contract, use stable codes:

```ts
class StorageError extends Error {
  code: "not-found" | "permission-denied" | "unavailable";
  cause?: unknown;

  constructor(code: StorageError["code"], message: string, cause?: unknown) {
    super(message);
    this.name = "StorageError";
    this.code = code;
    this.cause = cause;
  }
}
```

Normalize unknown errors at boundaries:

```ts
function normalizeStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  if (error instanceof Error) return new StorageError("unavailable", error.message, error);
  return new StorageError("unavailable", String(error));
}
```

## Cancellation

Cancellation is not exceptional from the user's point of view. Thread `AbortSignal` through every
long-running operation and represent cancellation distinctly from failure.

```ts
async function loadReport(id: string, signal?: AbortSignal): Promise<Result<Report, LoadError>> {
  if (signal?.aborted) return err({ code: "aborted", message: "Load aborted" });
  try {
    return ok(await fetchReport(id, signal));
  } catch (error) {
    if (signal?.aborted) return err({ code: "aborted", message: "Load aborted" });
    return err({ code: "failed", message: error instanceof Error ? error.message : String(error) });
  }
}
```

## Plugin and listener isolation

Hosts should decide whether extension failures are fatal. Most plugin/listener systems should isolate
failures so one handler does not break the loop:

```ts
for (const handler of handlers) {
  try {
    await handler(event, context);
  } catch (error) {
    context.logger.warn("Plugin handler failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
```

If a hook is allowed to replace or veto core behavior, make that explicit in the hook result type.

## Choosing a contract

| Situation                                      | Prefer                                          |
| ---------------------------------------------- | ----------------------------------------------- |
| Pure parse/validate/resolve helper             | `Result<T,E>`                                   |
| Long-running stream                            | terminal `error` / `aborted` event              |
| User cancellation                              | returned cancellation result                    |
| Public API misuse                              | thrown typed error                              |
| Broken internal invariant                      | thrown `Error` with actionable message          |
| Plugin/listener failure in host-managed system | catch, log/report, continue unless fatal by API |
