# Case Study — Extension and Plugin Systems

Use this pattern when a host application needs plugins, tools, commands, hooks, or runtime-registered
providers without letting optional behavior bloat the core.

## 1. Small public API

Give extensions a narrow host API. Every method should name a real capability:

```ts
interface ExtensionAPI {
  registerCommand(name: string, command: CommandDefinition): void;
  registerTool(tool: ToolDefinition): void;
  registerProvider(provider: BackendProvider): void;
  on<TEvent extends HostEventType>(type: TEvent, handler: HostEventHandler<TEvent>): Disposable;
}

type ExtensionFactory = (api: ExtensionAPI) => void | Promise<void>;
```

Avoid passing the whole application object to plugins. Expose the smallest surface that can remain
stable.

## 2. Manifest + entrypoint

A plugin should be discoverable without executing arbitrary code:

```json
{
  "name": "example-plugin",
  "main": "dist/index.js",
  "host": {
    "version": "^1.0.0"
  }
}
```

Discovery reads manifests; loading imports only selected entrypoints.

## 3. Registries over privileged paths

Built-in features and external features should register through the same registries when practical:

```ts
class CommandRegistry {
  private commands = new Map<string, CommandDefinition>();

  register(name: string, command: CommandDefinition): Disposable {
    if (this.commands.has(name)) throw new Error(`Command already registered: ${name}`);
    this.commands.set(name, command);
    return { dispose: () => this.commands.delete(name) };
  }
}
```

That keeps the extension path tested by first-party use.

## 4. Runtime validity

Extensions often capture an API object. Make stale APIs fail loudly after reload/shutdown:

```ts
class ExtensionRuntime {
  private active = true;

  assertActive(): void {
    if (!this.active) throw new Error("Extension API is no longer active");
  }

  invalidate(): void {
    this.active = false;
  }
}
```

Every API method calls `runtime.assertActive()` before mutating host state.

## 5. Hook contracts

Model hooks by what they may do:

```ts
type HookResult<T> =
  | { type: "continue" }
  | { type: "replace"; value: T }
  | { type: "veto"; reason: string };
```

Do not make callback presence imply capability. A hook that can replace a payload should return a type
that says so.

## 6. Failure isolation

Plugin failures should usually be contained:

```ts
for (const handler of handlers) {
  try {
    await handler(event, context);
  } catch (error) {
    logger.warn("Extension handler failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
```

Fatal extension points are valid, but they should be documented in the type and tested.

## 7. Tool definitions: core vs. host metadata

Separate the neutral executable definition from host-specific presentation:

```ts
interface Tool<Input, Output> {
  name: string;
  parameters: Schema<Input>;
  execute(input: Input, context: ToolExecutionContext): Promise<Result<Output, ToolError>>;
}

interface PresentedTool<Input, Output> extends Tool<Input, Output> {
  description: string;
  renderResult?: (output: Output) => Renderable;
}
```

The core runner only needs `Tool`; the application can wrap/augment it with UI metadata.

## 8. Unregistration and cleanup

Every registration should have a cleanup path. `Disposable` return values are simple and composable:

```ts
interface Disposable {
  dispose(): void;
}
```

On reload, dispose old registrations before loading new ones. On shutdown, dispose in reverse order if
resources depend on each other.

## What to copy

- Extension API smaller than the host application.
- Manifest discovery separate from code execution.
- Built-ins use the same registries as plugins.
- Stale API objects throw clearly after reload/shutdown.
- Hook result types express observe/replace/veto behavior.
- Plugin failure isolation by default.
- Cleanup/disposable path for every registration.
