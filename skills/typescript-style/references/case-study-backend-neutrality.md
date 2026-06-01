# Case Study — Backend Neutrality

Use this pattern for storage drivers, payment processors, notification channels, model providers,
transports, or any system where many concrete backends should disappear behind one neutral contract.

## 1. Neutral model

Start with the domain your callers need, not any backend's native shape:

```ts
interface NeutralRequest {
  messages: Message[];
  maxItems?: number;
  signal?: AbortSignal;
}

type NeutralEvent =
  | { type: "text"; text: string }
  | { type: "progress"; completed: number; total?: number }
  | { type: "usage"; units: number; cost?: Money }
  | { type: "done"; reason: "complete" | "limit" }
  | { type: "error"; reason: "failed" | "aborted"; message: string };
```

Each backend translates to and from these shapes at the boundary.

## 2. Open backend identifiers

Known backends should autocomplete; unknown plugin backends should still register:

```ts
type KnownBackend = "memory" | "postgres" | "s3";
type BackendId = KnownBackend | (string & {});
```

Use a closed union only when external registration is impossible by design.

## 3. Tiny provider contract

A provider is a tag plus functions. Keep it small:

```ts
interface BackendProvider<TBackend extends BackendId = BackendId> {
  id: TBackend;
  stream: StreamFunction<TBackend>;
  complete?: CompleteFunction<TBackend>;
}
```

If there are two caller surfaces, separate them intentionally:

- **native/options-rich** for advanced callers that need backend-specific controls;
- **simple/neutral** for most callers, mapped down inside the provider.

Do not leak the native SDK request type into the neutral API.

## 4. Registry wrapper: erase once, assert once

The registry stores providers without preserving each generic tag. Recover the tag in one wrapper after
a runtime check:

```ts
const providers = new Map<string, BackendProvider>();

function registerProvider<TBackend extends BackendId>(provider: BackendProvider<TBackend>): void {
  providers.set(provider.id, {
    id: provider.id,
    stream: (backend, request, context) => {
      if (backend.id !== provider.id) {
        throw new Error(`Mismatched backend: ${backend.id} expected ${provider.id}`);
      }
      return provider.stream(backend as Backend<TBackend>, request, context);
    },
    complete: provider.complete as CompleteFunction | undefined,
  });
}
```

After this point, provider bodies receive the concrete `Backend<TBackend>` and should not re-validate
the tag everywhere.

## 5. Isolate quirks in three layers

1. **Typed capability/config flags** on the backend model:
   `supportsBatching`, `maxPayloadBytes`, `authMode`, `supportsStreaming`.
2. **One resolver** that defaults and normalizes backend metadata:
   `resolveBackendCapabilities(backend): Required<BackendCapabilities>`.
3. **One translation function** from neutral request to native request:
   `buildNativeRequest(request, capabilities)`.

All downstream code reads capabilities. It does not inspect backend names.

## 6. Shared normalization

If multiple backends need the same cleanup, share the neutral transform and inject the backend-specific
piece:

```ts
function normalizeMessages(messages: Message[], options: { normalizeId: (id: string) => string }): Message[] {
  return messages.map((message) => normalizeMessage(message, options.normalizeId));
}
```

The neutral helper owns the shared rule; each backend supplies only its native ID or payload quirk.

## 7. Lazy optional dependencies

Heavy or optional backend SDKs should not load until needed. Use runtime `import()` behind provider
registration or provider resolution. Keep type imports top-level when possible; keep runtime lazy import
for runtime cost.

## 8. Test the neutrality contract

For every backend, run the same conformance tests:

- emits standard event variants;
- maps expected failures to error events/results;
- honors cancellation;
- reports usage/cost/metadata consistently if applicable;
- handles cross-backend handoff or serialization if the product supports it;
- does not require backend-specific branches in neutral callers.

## What to copy

- A neutral domain model first.
- Open backend IDs when plugins are allowed.
- Provider contract = tag + a tiny set of functions.
- Generic tag cast in one registry wrapper after runtime assertion.
- Capability flags resolved once, then read everywhere.
- One conformance test matrix across all backends.
