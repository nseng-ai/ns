# External Case Study — How `flue` Consumes the Pi Core Libraries

> **Status: external reference, not asdl architecture.** This document studies a
> *different* project — [`withastro/flue`](https://github.com/withastro/flue) —
> and how it builds on the same `@earendil-works/` ("pi") libraries that asdl
> depends on. It is kept here as a contrasting consumption pattern, not as a
> description of anything asdl ships. The body below (§1–§11 + file index) is the
> original flue usage report, preserved verbatim; the **asdl contrast** callouts
> are the only additions.

## Why this is in asdl's docs

asdl and flue both sit on top of pi, but they consume *different surfaces of it
in opposite directions*:

|                                     | **flue** (this case study)                                                                                                                   | **asdl** (this repo)                                                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Relationship to pi                  | **Embeds pi as a runtime engine**                                                                                                            | **Extends pi as a host**                                                                                                                               |
| Primary packages                    | `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`                                                                                     | `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `@earendil-works/pi-ai`                                                                   |
| Integration shape                   | Constructs and drives a pi `Agent`; owns the streaming/event seams around it                                                                 | Drops extension modules into the pi terminal binary's discovery dirs (`.pi/extensions/`); registers tools/commands/renderers against the extension API |
| Pinned version (at time of writing) | `0.79.4`                                                                                                                                     | `0.79.1`                                                                                                                                               |
| Where to read asdl's own model      | This `docs/pi/` collection + [`docs/pi-extension-system-report.md`](../pi-extension-system-report.md) (what pi's extension host actually is) | —                                                                                                                                                      |

The short version: **flue treats pi as a library it calls; asdl treats pi as a
platform it plugs into.** flue does not register extensions — it implements its
own `StreamFn` and event re-projection around pi's `Agent`. asdl does not
construct an `Agent` — it lets the pi binary own the loop and contributes
behavior through the extension API documented in
[`docs/pi-extension-system-report.md`](../pi-extension-system-report.md).

The one place the two patterns genuinely overlap is **pi-ai's model/provider
layer** (§5) and its **non-streaming completion call** (§7): asdl's `sdl` package
uses exactly these. See the asdl-contrast callouts under those sections.

> **Provenance:** generated 2026-06-17 against `withastro/flue`. Version numbers,
> file paths, and findings describe flue at that snapshot and will drift as both
> projects upgrade pi. Do not treat any flue file path as existing in this repo.

---

# How flue Uses the "pi" Core Libraries — Holistic Report

*Repo: withastro/flue · generated 2026-06-17*

## 1. What "pi" actually is here

There is **no dependency literally named `pi`**. "pi" is the agent SDK published
under the npm scope **`@earendil-works/`**. flue consumes two of its packages,
both pinned to `^0.79.4` and resolved at `0.79.4` in `pnpm-lock.yaml`:

| Package                         | Layer                                      | What flue takes from it                                                                                       |
| ------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `@earendil-works/pi-agent-core` | **Agent runtime** — the orchestration loop | `Agent` class, message/tool types, the `StreamFn` contract                                                    |
| `@earendil-works/pi-ai`         | **Model/provider layer** — talking to LLMs | model registry, streaming primitives, message types, usage accounting, provider registration, schema (`Type`) |

`pi-agent-core` itself depends on `pi-ai`, so flue sits on top of a two-tier
stack: flue → pi-agent-core → pi-ai.

The relationship is summarized by the one architectural mention in `AGENTS.md`:

> "Turn — one LLM round-trip inside pi-agent-core"

**flue is a server/runtime framework wrapped around pi's agent engine.** pi
provides the agent loop and model I/O; flue provides everything around it —
HTTP routing (Hono), durable submissions, session persistence, skills,
sandboxed tools (`just-bash`), MCP, and Cloudflare/Node deployment.

> **asdl contrast.** asdl does **not** depend on `pi-agent-core` and never
> constructs an `Agent`. asdl's `ts/packages/pi-extensions` and `ts/packages/sdl`
> depend on `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, and
> `@earendil-works/pi-ai` (pinned `0.79.1`). flue wraps the agent *loop*; asdl
> plugs into the agent *host*. The loop is flue's to own; for asdl the loop
> belongs to the pi binary and asdl contributes extensions to it.

## 2. Where the dependency is declared

- **`packages/runtime/package.json`** — the only package depending on *both*
  pi packages, as runtime `dependencies`. This is the core integration site.
- **`examples/react-chat/package.json`**, **`examples/chat-sdk/package.json`** —
  each depends on `@earendil-works/pi-ai` directly (`^0.79.4`) for the faux
  providers in their `src/agents/assistant.ts`.
- **`apps/www`** (the website) — no package dependency; it fetches pi-ai's
  generated model catalog over HTTP at build time (see §8).

## 3. The central integration: the Agent loop (`session.ts`)

`packages/runtime/src/session.ts` is the heart of flue's use of pi. flue's
internal `Session` constructs and drives a pi `Agent`:

```ts
import { Agent } from '@earendil-works/pi-agent-core';   // the loop
import { streamSimple } from '@earendil-works/pi-ai';    // the model call

this.agentLoop = new Agent({
  initialState: { systemPrompt, model, tools, messages, thinkingLevel },
  getApiKey: (provider) => this.getProviderApiKey(provider),
  onPayload: (payload, model) => this.applyProviderPayloadOverrides(payload, model),
  streamFn: this.emitTurnRequestAndStream,   // flue's wrapper around streamSimple
  toolExecution: 'parallel',
  sessionId: this.affinityKey,
});
this.agentLoop.subscribe(async (event) => { /* translate pi events -> flue events */ });
```

Key facts:

- flue **owns the streaming boundary.** It supplies a custom `StreamFn`
  (`emitTurnRequestAndStream`) that does flue-specific work — assigns turn IDs,
  sets up the durable `StreamChunkWriter`, emits a `turn_request` event, fires
  journal callbacks — then **delegates the actual model call to pi's
  `streamSimple(model, context, options)`**. This is the seam where flue's
  durability/observability layer wraps pi's transport.
- flue **subscribes to pi's event stream** and re-projects pi `Agent` events
  (`agent_start`, `turn_start`, `message_start`, …) into flue's own event
  schema that the rest of the runtime and clients consume.
- pi handles tool execution (`toolExecution: 'parallel'`); flue supplies the
  tools and the API-key/payload callbacks.

> **asdl contrast.** This whole section has no asdl analog. asdl never owns a
> `StreamFn` or subscribes to an `Agent` event stream — that wiring lives inside
> the pi binary. asdl's equivalent integration seams are the *extension*
> primitives (`pi.on(...)`, `pi.registerTool`, `pi.registerCommand`, custom TUI
> renderers) described in [`docs/pi-extension-system-report.md`](../pi-extension-system-report.md).

## 4. Tools are pi tools (`agent.ts`, `result.ts`, `shell.ts`)

flue's built-in tools (`read`, `write`, `edit`, `bash`, `grep`, `glob`, plus
`task`/skill tools) are authored against pi's tool contract:

```ts
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { type Static, Type } from '@earendil-works/pi-ai';   // TypeBox-style schema
```

- Every tool is an `AgentTool<TParams>` returning `AgentToolResult<TDetails>`.
- Tool parameter schemas are declared with pi-ai's **`Type`** builder
  (`Type.Object`, `Type.String`, `Type.Optional`, …) and typed via `Static<…>`.
  flue's tool-schema system *is* pi-ai's schema system.
- The tool bodies run flue's own sandbox (`just-bash`), but the interface they
  expose to the model is entirely pi's.

> **asdl contrast.** asdl extensions also register tools, but through the
> `pi-coding-agent` extension API (`pi.registerTool`), not by importing
> `AgentTool` from `pi-agent-core` and handing it to an `Agent` constructor.
> Same destination (an LLM-callable tool), different registration path: host
> plug-in vs. engine configuration.

## 5. Models and providers (`internal.ts`, `runtime/providers.ts`)

flue layers its own provider registry on top of pi-ai's model catalog:

```ts
import { type Api, getModel, getModels, type KnownProvider, type Model,
         registerApiProvider as piRegisterApiProvider } from '@earendil-works/pi-ai';
```

- **Model resolution** (`resolveModel` in `internal.ts`): flue parses
  `"provider-id/model-id"` specifiers, checks its own `registerProvider()`
  registrations first, then falls back to pi-ai's catalog via
  **`getModel(provider, modelId)`**, returning a pi-ai `Model<Api>`. Error
  messages explicitly reference pi-ai ("not registered with
  `@earendil-works/pi-ai`").
- **Custom providers**: flue's public `registerProvider` / `registerApiProvider`
  (re-exported from `index.ts`) wrap pi-ai's `registerApiProvider`, letting
  users add HTTP providers or Cloudflare Workers-AI bindings on top of pi's
  built-in catalog.
- `Api` and `KnownProvider` are pi-ai types threaded through flue's provider
  config surface.

> **asdl contrast — this is the real overlap.** asdl's `sdl` package consumes the
> same pi-ai model layer. `ts/packages/sdl/src/pi-text-generation.ts` parses the
> identical `"provider/model-id"` specifier shape, resolves a
> `PiAi.Model<PiAi.Api>` from a registry, and threads `Api`/`Model` types through
> its own gateway interface — see `parsePiModelRef` and `PiModelRegistry`. The
> difference is the registry source: asdl loads pi-coding-agent's
> `ModelRegistry.create(AuthStorage.create())` (auth-aware, tied to `/login`)
> rather than calling pi-ai's `getModel`/`registerApiProvider` directly. flue
> builds a *provider registry*; asdl reuses pi-coding-agent's registry behind a
> `TextGenerationGateway`.

## 6. Custom Cloudflare provider built on pi-ai internals (`cloudflare/workers-ai-provider.ts`)

This is the deepest coupling. flue implements a bespoke pi-ai provider that
dispatches through a Cloudflare `env.AI` binding instead of HTTP, reusing
pi-ai's lower-level building blocks:

```ts
import type { ApiProvider, OpenAICompletionsCompat, SimpleStreamOptions,
              StreamFunction, StreamOptions, Tool, ToolCall, Usage, ... } from '@earendil-works/pi-ai';
import { createAssistantMessageEventStream, parseStreamingJson } from '@earendil-works/pi-ai';
import { convertMessages } from '@earendil-works/pi-ai/openai-completions';   // subpath export
```

- Registered under flue's own `cloudflare-ai-binding` API.
- Translates request bodies via pi-ai's **`convertMessages`** (OpenAI-completions
  wire format) and parses the binding's SSE response with pi-ai's
  **`createAssistantMessageEventStream`** + **`parseStreamingJson`**.
- A code comment notes flue **hardcodes a mirror of pi-ai's `getCompat()` /
  `detectCompat('cloudflare-workers-ai')` behavior** and warns to "re-mirror if
  pi-ai's detection logic or registry overrides change upstream." An explicit,
  fragile coupling to pi-ai internals worth flagging.

> **asdl contrast.** asdl has no equivalent — it does not implement custom pi-ai
> providers or reach into pi-ai's OpenAI-completions/SSE internals. This is the
> most upgrade-fragile part of flue's integration and is precisely the kind of
> internal-mirroring asdl avoids by leaning on pi-coding-agent's registry.

## 7. Messages, usage, compaction, streaming chunks

flue consumes pi's data model pervasively rather than defining its own:

- **Message types** — `AgentMessage` (pi-agent-core) and `AssistantMessage`,
  `UserMessage`, `Message`, `ToolResultMessage`, `ImageContent`, `TextContent`,
  `Context` (pi-ai) flow through `session-history.ts`, `submission-state.ts`,
  `event-redaction.ts`, `compaction.ts`, and `types.ts`.
- **Usage/cost** — `usage.ts` aggregates pi-ai's **`Usage`** into flue's
  `PromptUsage` (`fromProviderUsage`, `addUsage`) for per-call token + cost
  rollups across `prompt()`, `skill()`, `task()`, and compaction.
- **Context compaction** (`compaction.ts`) — uses pi-ai's **`completeSimple`**
  (a non-streaming model call for generating summaries) and
  **`isContextOverflow`** (to detect when the provider rejected an over-long
  context and trigger compact-then-retry).
- **Streaming chunks** (`runtime/stream-chunks.ts`) — flue's durable
  `StreamChunkWriter` stores pi-ai **`AssistantMessageEvent`** values directly;
  its on-disk chunk segments *are* pi-ai event objects.

> **asdl contrast.** asdl uses pi-ai's **`completeSimple`** too, but for a much
> narrower purpose: `sdl`'s `PiTextGenerationGateway` makes one-shot
> non-streaming text generations (`generateText`), building a single user
> message with a `text` content block and reading back `response.content` /
> `response.stopReason`. asdl does not aggregate `Usage`, persist
> `AssistantMessageEvent` streams, or run pi-ai-driven context compaction — that
> bookkeeping is the pi binary's job, not asdl's.

## 8. Type augmentation — flue extends pi's type system (`types.ts`)

flue doesn't just consume pi's types; it **augments** them:

```ts
declare module '@earendil-works/pi-agent-core' {
  interface CustomAgentMessages {
    signal: SignalMessage;   // flue's own non-LLM "signal" message role
  }
}
```

This injects a flue-specific `signal` message variant into pi's open
`CustomAgentMessages` extension point, so flue's signal messages travel through
pi's message pipeline as first-class citizens. `ThinkingLevel` is also
re-exported from pi-agent-core through flue's public types.

## 9. Examples and website

- **`examples/chat-sdk` / `examples/react-chat`** (`src/agents/assistant.ts`) —
  use pi-ai's **faux provider** test harness: `registerFauxProvider`,
  `fauxAssistantMessage`, `fauxText`, `fauxToolCall`. These run deterministic
  agents without a real model, demonstrating that flue's provider-registration
  path is pi-ai's.
- **`apps/www/src/pages/models.json.ts`** — the marketing site builds its model
  list by fetching pi-ai's generated catalog over HTTP:
  `https://unpkg.com/@earendil-works/pi-ai/dist/models.generated.js`, importing
  its `MODELS` export. Even flue's *documentation* of supported models is
  sourced from pi-ai.

## 10. Test surface

~12 test files under `packages/runtime/test/` import from pi (dispatch,
stream-chunks, tool, session-operations, session-event-images,
node-agent-coordinator, providers, submission-state, session-skills,
session-compaction, cloudflare-workers-ai-provider, context, structured-results),
plus one CLI integration test
(`cloudflare-deployment-extension.integration.test.ts`). They exercise the same
pi types/faux providers the runtime uses.

## 11. Holistic assessment

**pi is flue's engine, not an optional plugin.** The dependency is load-bearing
and broad:

- **The agent loop is pi's** — flue does not implement its own turn loop or tool
  dispatcher; it configures and observes a pi `Agent`.
- **The model I/O is pi's** — `streamSimple`, `completeSimple`, the model
  catalog, provider registration, usage accounting, and context-overflow
  detection all come from pi-ai.
- **The data model is pi's** — messages, tool definitions, schemas (`Type`),
  streaming events, and usage objects are pi types passed through flue's stores
  and event streams largely unmodified.
- **flue's value-add wraps pi** — durability (submissions/journals), HTTP
  routing, session persistence, skills, sandboxed filesystem/bash tools, MCP,
  and multi-target deployment. flue inserts itself at exactly two clean seams:
  the `StreamFn` (to wrap each model call) and the `Agent` event subscription
  (to re-project events).

**Coupling / risk notes:**

- The pin is exact (`0.79.4`) and *consistent* across all three consuming
  packages. A pi upgrade is effectively a coordinated flue runtime change.
- The Cloudflare Workers-AI provider reaches into pi-ai internals (compat
  detection, OpenAI-completions conversion, SSE parsing) and **mirrors logic by
  hand**, with an explicit "re-mirror on upstream change" warning — the most
  upgrade-sensitive spot.
- The `declare module` augmentation of `CustomAgentMessages` relies on that
  extension point continuing to exist in pi-agent-core.
- The website's build-time fetch of `models.generated.js` from unpkg ties docs
  freshness to whatever pi-ai version unpkg serves (no version pin in the URL).

> **asdl takeaways (editorial).** Three of flue's risk notes generalize to any
> pi consumer, asdl included:
>
> 1. **Pin pi consistently across packages.** asdl pins `0.79.1`; flue pins
>    `0.79.4`. Keep the pin uniform within a repo — a split pin turns a pi bump
>    into a cross-package coordination problem.
> 2. **Avoid hand-mirroring pi internals.** flue's Cloudflare provider is the
>    cautionary tale. asdl's reliance on pi-coding-agent's `ModelRegistry`
>    instead of re-deriving provider/compat logic is the safer posture.
> 3. **Type-augmentation and unpinned catalog fetches are silent upgrade
>    hazards.** asdl has neither today; if either is introduced, treat it as a
>    pi-version coupling point.

---

### Quick file index

> All paths below are **flue** files, not asdl files.

| File                                                                                   | pi usage                                                                                            |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `packages/runtime/src/session.ts`                                                      | Constructs `Agent`, wraps `streamSimple` via custom `StreamFn`, subscribes to pi events             |
| `packages/runtime/src/agent.ts`                                                        | Tools as `AgentTool`/`AgentToolResult`; schemas via `Type`/`Static`                                 |
| `packages/runtime/src/internal.ts`                                                     | `resolveModel` over `getModel` + pi-ai `Model`/`Api`                                                |
| `packages/runtime/src/runtime/providers.ts`                                            | Provider registry over `registerApiProvider`, `getModel`, `getModels`                               |
| `packages/runtime/src/cloudflare/workers-ai-provider.ts`                               | Custom pi-ai provider; `convertMessages`, `createAssistantMessageEventStream`, `parseStreamingJson` |
| `packages/runtime/src/compaction.ts`                                                   | `completeSimple`, `isContextOverflow`, message/`Context`/`Usage` types                              |
| `packages/runtime/src/usage.ts`                                                        | Aggregates pi-ai `Usage` -> `PromptUsage`                                                           |
| `packages/runtime/src/session-history.ts`, `submission-state.ts`, `event-redaction.ts` | pi message types                                                                                    |
| `packages/runtime/src/runtime/stream-chunks.ts`                                        | Stores pi-ai `AssistantMessageEvent`                                                                |
| `packages/runtime/src/types.ts`                                                        | Augments `CustomAgentMessages`; re-exports `ThinkingLevel`                                          |
| `examples/*/src/agents/assistant.ts`                                                   | pi-ai faux providers                                                                                |
| `apps/www/src/pages/models.json.ts`                                                    | Fetches pi-ai `models.generated.js`                                                                 |
