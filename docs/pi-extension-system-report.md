# Pi's Extension System — Design Report

*Subject repo: `badlogic/pi-mono`, package `packages/coding-agent`. Primary code: `src/core/extensions/{index,loader,runner,types,wrapper}.ts`; docs: `docs/extensions.md`, `docs/security.md`, `docs/packages.md`.*

## 1. What it is

Pi (a terminal coding agent shipped as a single compiled Bun binary) lets users extend its behavior by dropping **TypeScript modules** into known directories. An extension is a default-exported factory function that receives one object, `pi: ExtensionAPI`, and uses it to: subscribe to lifecycle events, register LLM-callable tools, add slash-commands / keyboard shortcuts / CLI flags, register model providers, drive custom TUI, and persist session state.

```typescript
export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
      if (!await ctx.ui.confirm("Dangerous!", "Allow?")) return { block: true };
    }
  });
  pi.registerTool({ name: "greet", /* … */ });
  pi.registerCommand("hello", { /* … */ });
}
```

The stated product goal (`docs/extensions.md:1`): *"pi can create extensions. Ask it to build one for your use case"* — the agent itself authors extensions, so the API is optimized to be LLM-writable, and the docs double as the model's reference.

The breadth is real: ~75 example extensions ship in `examples/extensions/`, ranging from permission gates and git checkpointing to SSH remote execution, vim-modal editors, custom model providers, and full games (Snake, Doom-in-an-overlay).

## 2. Architecture: a fan-out adapter over a thin harness

There are three layers, and the separation is the central architectural decision.

```
┌─ Extensions (N user .ts modules) ──────────────────────────┐
│   each gets its own ExtensionAPI + Extension record        │
└──────────────────────────┬─────────────────────────────────┘
                           │  pi.on/registerTool/…
┌─ ExtensionRunner (coding-agent) ───────────────────────────┐
│   fan-out: loops over all extensions × all handlers        │
│   owns dispatch semantics, error isolation, staleness      │
└──────────────────────────┬─────────────────────────────────┘
                           │  installs ONE of each primitive
┌─ Agent harness (@earendil-works/pi-agent-core) ────────────┐
│   subscribe(listener), beforeToolCall, afterToolCall       │
│   emits AgentEvent stream; runs the model/tool loop        │
└─────────────────────────────────────────────────────────────┘
```

The lower-level `Agent` (`packages/agent/src/agent.ts`) exposes only **singular, primitive** hooks — one `beforeToolCall`, one `afterToolCall`, a set of event subscribers. It knows nothing about extensions. `AgentSession` (`packages/coding-agent/src/core/agent-session.ts`) occupies *exactly one* of each primitive slot and multiplexes through a single `ExtensionRunner`, which loops over every extension and every handler. `_handleAgentEvent` translates each harness `AgentEvent` into an extension event (`_emitExtensionEvent`, agent-session.ts:602-673).

Two consequences worth highlighting:

- **Hot-reload is cheap.** The harness hooks are installed *once* and read `this._extensionRunner` at call time (agent-session.ts:396-402). Reloading extensions just swaps the runner instance — the harness wiring is never touched.
- **Extensions are a hard dependency that degrades to nothing.** `_extensionRunner` is non-optional, but with zero extensions its handler maps are empty, and `runner.hasHandlers(event)` guards let the agent skip even constructing an event context (agent-session.ts:406, 1006). There is no "extensions on/off" mode — absence is the off state.

A noteworthy finding: a richer, reducer-style `AgentHarness` hook layer exists in `packages/agent/src/harness/` (docs `agent-harness.md`, `hooks.md`) but is **designed-but-not-yet-implemented**. Today's extension system sits on the legacy `Agent` class, not on that newer harness.

### Two orthogonal event planes

Don't conflate them:

| Plane | Mechanism | Direction | Catalog |
|---|---|---|---|
| **Lifecycle events** | `ExtensionRunner.emit*()` | host → extensions | Fixed `ExtensionEvent` union |
| **`pi.events`** | plain Node `EventEmitter` (`event-bus.ts`, 33 lines) | extension ↔ extension | Arbitrary string channels |

`pi.events` is one shared bus threaded into every extension's API (loader.ts:325, 422), used for inter-extension coordination. The runner holds no reference to it.

## 3. The programming model

**Factory + injected API.** Each extension module default-exports `(pi: ExtensionAPI) => void | Promise<void>`. Loaded via **jiti**, so TypeScript runs without a build step. An *async* factory is awaited before startup proceeds — pi guarantees async init (e.g. fetching remote model lists for `pi.registerProvider()`) completes before `session_start` and before `pi --list-models` (docs:180-217). The docs explicitly warn *not* to start background resources (watchers, sockets, timers) in the factory because it may run in invocations that never start a session — defer to `session_start`, clean up in `session_shutdown`.

**Registration vs. action split.** This is enforced structurally. `createExtensionRuntime()` (loader.ts:124-170) builds a runtime whose action methods are **throwing stubs** (`notInitialized`). During factory execution, `pi.on()`, `pi.registerTool()`, etc. write into the extension's own record and are legal; but `pi.sendMessage()` and other *actions* throw "Extension runtime not initialized." Only after `bindCore()` (runner.ts:307-379) replaces the stubs with real implementations — by direct field assignment into the single shared runtime object, so all extensions light up at once — can actions run.

**Context objects.** Every handler receives `ctx: ExtensionContext`. It's built from **lazy guarded getters** (runner.ts:617-686): each property calls `assertActive()` then reads a live runner field, so values reflect late binds rather than freezing at construction. Command handlers get a *superset*, `ExtensionCommandContext`, adding session-control methods (`newSession`, `fork`, `switchSession`, `navigateTree`, `reload`, `waitForIdle`). These are command-only **by construction** — they simply aren't present on the event-handler context — because they can deadlock or reenter if fired from inside a passive event. (Implementation detail: the command context copies property *descriptors* rather than spreading, runner.ts:692-695, precisely to avoid eagerly evaluating the guarded getters and freezing stale values.)

## 4. The event/lifecycle model — the heart of the design

Lifecycle (abbreviated from docs:276-342):

```
project_trust → session_start → resources_discover
user prompt → [extension cmd?] → input → before_agent_start → agent_start
  └ turn loop: turn_start → context → before_provider_request → after_provider_response
       → tool_execution_start → tool_call → tool_result → tool_execution_end → turn_end
agent_end
/new /resume /fork → session_before_* (cancelable) → session_shutdown → session_start
```

**Dispatch is strictly sequential, never parallel, in extension load order then registration order.** Every dispatcher is the same nested loop with `await` per handler — no `Promise.all`. The only ordering guarantees are (a) load order, (b) registration order within an extension, (c) later handlers observe earlier handlers' mutations. There is no priority system.

The genuinely interesting design work is in **how multiple handlers' return values combine** — and it differs per event, with the type system (`RunnerEmitEvent` excludes specialized events, runner.ts:120-132) forcing each through the right combiner:

| Event | Combination semantics |
|---|---|
| **`tool_call`** | First handler returning `{block}` short-circuits. `event.input` is mutable in place; later handlers see earlier mutations; no re-validation. |
| **`tool_result`** | Middleware chain mutating a shared `currentEvent` — each handler sees accumulated `content`/`details`/`isError`. |
| **`before_agent_start`** | System prompt is **chained** (each handler sees prior edits via rebound `getSystemPrompt`), but only the **last** edit survives. Injected messages **accumulate** into an array. |
| **`context`** | Input deep-cloned (`structuredClone`) first; message array threaded through handlers. |
| **`message_end`** | Chains the message; **rejects** any replacement that changes `role`. |
| **`input`** | Transform chain; `handled` short-circuits, `transform` updates text/images. |
| **`session_before_*`** | `cancel: true` is first-wins short-circuit; otherwise last result wins. |
| **`resources_discover`** | Pure fan-in: concatenates all skill/prompt/theme paths. |
| **`project_trust`** | First `yes`/`no` wins; `undecided` falls through. |

**Error isolation is deliberately asymmetric.** Almost every dispatcher wraps each handler in try/catch, routes to an error listener, and **continues** (fail-open: a crashing handler is skipped, the event proceeds). The one exception is `tool_call`, which has **no try/catch** (runner.ts:870-880): a thrown error propagates and the caller **re-throws to block the tool** (agent-session.ts:410-422, "Extension failed, blocking execution"). So a permission-gate extension that crashes *blocks* rather than waves the call through — **fail-safe** exactly where safety matters. This is the single most important and easily-missed nuance in the model.

## 5. Capability surface

Beyond events, `ExtensionAPI` is broad:

- **Tools** — `pi.registerTool()` with a typebox schema (note: `StringEnum` from `pi-ai` required for Google API compatibility). Registration → `runtime.refreshTools()` → `_refreshToolRegistry` aggregates built-ins + extension + SDK tools, dedupes (first-registration-wins), wraps each to run inside extension context, then `setActiveToolsByName` writes the active set into `agent.state.tools` — the list sent to the model. Works *after* startup too (no `/reload`). Extensions can **override built-ins** (`read`, `bash`, `edit`, …) by name; rendering is inherited per-slot. `prepareArguments()` provides a compatibility shim for resuming old sessions whose stored tool args predate a schema change. Custom file-mutating tools should use `withFileMutationQueue()` since tools run in parallel by default.
- **Commands / shortcuts / flags** — `registerCommand` (with argument autocompletion), `registerShortcut`, `registerFlag` (queryable via `getFlag`). Duplicate command names get numeric suffixes (`/review:1`, `/review:2`).
- **Providers** — `registerProvider()` dynamically adds/overrides model providers (custom endpoints, proxies, OAuth flows for `/login`). Calls during the factory are queued and flushed in `bindCore`; later calls take effect immediately.
- **UI** — `ctx.ui` offers `select/confirm/input/editor/notify` (with timeout + AbortSignal support), `setStatus/setWidget/setFooter/setTitle`, working-indicator customization, autocomplete providers, full custom components via `ctx.ui.custom()` (including experimental floating overlays), and full **editor replacement** (vim/emacs modes via `CustomEditor`).
- **Session/state** — `appendEntry` (persisted, *non*-LLM-context state), `sendMessage`/`sendUserMessage` (with `steer`/`followUp`/`nextTurn` delivery modes), `setSessionName`, `setLabel`, model/thinking-level control, `compact()`, `getContextUsage()`, graceful `shutdown()`.

## 6. Loading & distribution

**jiti with a dual module-resolution strategy** (loader.ts:331-343), switched on `isBunBinary`:

- **Compiled Bun binary:** `virtualModules: VIRTUAL_MODULES` + `tryNative: false`. The libraries extensions import (`typebox`, `pi-ai`, `pi-tui`, `pi-agent-core`, `pi-coding-agent`) are **statically imported into the binary** (so Bun bundles them) and exposed as virtual modules. Inside a compiled binary there is no `node_modules` tree to resolve against — `virtualModules` maps the specifiers to the already-bundled module *objects*, so host and extension share the **exact same instances** (critical for `instanceof`, theme symbol identity, shared registries). `tryNative: false` forces jiti to intercept *all* imports, including transitive ones.
- **Node/dev:** `alias` pointing each specifier at the workspace `dist/` build or resolved node_modules.

**Tradeoff:** extensions are pinned to pi's bundled versions of these core libs — they cannot choose arbitrary versions. Hence the package rules: core pi libs must be `peerDependencies: "*"` and *not* bundled; the package manager even strips peer resolution on install (`--legacy-peer-deps` / `--omit=peer`, package-manager.ts:1739) since those peers resolve through the loader, not node_modules. The upside is guaranteed singleton identity and zero host/extension version skew. (Aside: both `@earendil-works/*` and legacy `@mariozechner/*` specifiers are aliased to the same modules — a scope rename kept backward-compatible without forcing extension edits.)

**Discovery** (loader.ts:520-605): one-level scan of `~/.pi/agent/extensions/` (global) and `.pi/extensions/` (project-local), plus settings-configured `extensions`/`packages`. Rules: direct `*.ts`/`*.js` → load; subdir with `index.ts` → load; subdir with `package.json` carrying a `pi.extensions` manifest → load what it declares. No recursion beyond one level.

**Distribution as packages** (`docs/packages.md`): `pi install npm:@scope/pkg@1.2.3` or `git:host/user/repo@ref` or local paths. Scope determines install root (`~/.pi/agent/...` for user, `.pi/...` for project, hashed `tmp` dir mode `0o700` for `-e` temporary). Git packages install with `--omit=dev`; `resolveManagedPath` refuses path-escaping names (`../` guard). Project settings shared with a team **auto-install** missing packages on startup — but only *after* trust resolves.

**Hot reload** (`/reload`, agent-session.ts:2435-2457): emits `session_shutdown(reason:"reload")`, reloads settings + packages + **re-loads every extension module from scratch**, rebuilds the runtime/runner carrying flag values forward, re-emits `session_start(reason:"reload")`. The key enabler is jiti's `moduleCache: false` (loader.ts:332) — every reload re-transpiles and re-executes, so edited source genuinely takes effect. Cost: no reload caching; correct tradeoff for a dev loop. Reload **preserves** the existing trust decision rather than re-prompting.

## 7. Security & trust model

The boundary is **narrow and explicit** (`docs/security.md`): project trust is *only an input-loading guard*, not a sandbox. It stops a freshly-cloned repo from silently loading its `.pi/extensions`, project settings, skills, and packages — code that runs with your full user permissions — before you approve. It does **not** restrict what trusted tools/extensions can do; real isolation is explicitly delegated to containers/VMs, and prompt injection from repo files is acknowledged as unpreventable.

The implementation is a **two-pass bootstrap** (resource-loader.ts:325-339):

1. Force `setProjectTrusted(false)`, load extensions. With trust false, `SettingsManager` refuses project settings, so this pass sees **only user/global + CLI `-e`** extensions — never `.pi/extensions`.
2. Those extensions vote via the **`project_trust` event** (first `yes`/`no` wins). Resolution priority: CLI `--approve` override → no-trust-requiring-resources auto-trust → extension vote → saved `trust.json` → `defaultProjectTrust` setting (`always`/`never`/`ask`) → interactive prompt (or deny if no UI).
3. Only after trust resolves does the second settings/package reload pull in project-local extensions.

`trust.json` (`~/.pi/agent/trust.json`) stores canonicalized paths (symlink-proof) with **hierarchical lookup** (trusting a parent trusts descendants) and `proper-lockfile` concurrency safety. Defense-in-depth: project package storage and project settings writes throw if accessed while untrusted. Carve-out: `AGENTS.md`/`CLAUDE.md` context files load regardless of trust (read-only data, accepted injection exposure). Non-interactive modes (`-p`, json, rpc) never prompt — only `defaultProjectTrust: "always"` trusts protected resources unattended.

**Headline security tradeoff:** the model optimizes for *usability of a local dev tool* over *isolation*. It guards the one-time "should this repo configure my agent" decision well, then trusts completely. Anyone treating extensions as a security sandbox would be wrong; the docs are admirably blunt about this.

## 8. State & session model

State design steers extensions toward **session-native storage** rather than in-memory globals, because of branching/forking. Two mechanisms:

- **Tool result `details`** — recommended for stateful tools, because results live in the session tree and reconstruct correctly across branches/forks (docs:1679-1711).
- **`pi.appendEntry(customType, data)`** — persisted custom entries that do *not* enter LLM context; reconstructed by scanning `ctx.sessionManager.getEntries()` on `session_start`.

**Session replacement staleness** is handled by a one-way latch. `AgentSession.dispose()` calls `runner.invalidate()`, setting a `staleMessage` checked by every guarded getter/action via `assertActive()`. Any `ctx`/`pi` captured before a `newSession`/`fork`/`switchSession`/`reload` is permanently poisoned and throws a long explanatory error. The sanctioned continuation path is the `withSession(ctx)` callback, which hands back a fresh context bound to the new session. This is a recurring documented footgun (docs:1164-1205) precisely because closures naturally capture the old handle.

## 9. Design choices & tradeoffs — synthesis

**What's well-designed:**

1. **Thin-harness / fat-adapter layering.** Keeping the agent core ignorant of extensions and concentrating all fan-out in `ExtensionRunner` yields cheap hot-reload, a testable core, and a clean place for all the dispatch policy. This is the best decision in the system.
2. **Per-event combination semantics that match intent.** Blocking is first-wins; middleware (`tool_result`) chains; resource discovery fans in; system-prompt edits chain but messages accumulate. Each is the *right* policy for its event, even though it means there's no single uniform rule to learn.
3. **Fail-safe exactly where it counts.** Fail-open everywhere except `tool_call`, which fails *closed*. A crashing guard blocks rather than leaks.
4. **Structural capability gating.** Session-control methods are absent from event contexts rather than runtime-checked; staleness is a getter-level latch. Safety via construction, not discipline.
5. **Singleton module identity via bundling + virtual modules.** Solves the "no node_modules in a compiled binary" problem and eliminates host/extension version skew.
6. **LLM-first ergonomics.** Default-export factory, no build step (jiti), typebox schemas, ~75 worked examples, and prose docs that read as model instructions. The agent can write its own extensions.

**The costs accepted:**

1. **Sequential dispatch.** Every handler on every relevant event awaits in series. Simple and ordered, but a slow handler stalls the turn; no parallelism, no timeouts, no priorities.
2. **Order-dependent, mutation-based chaining.** `tool_call` mutates `event.input` in place with no re-validation; `tool_result` mutates a shared event; `before_agent_start` system-prompt edits are last-write-wins (two extensions both rewriting it silently clobber). Composition between independently-authored extensions is fragile and load-order-sensitive.
3. **No sandbox.** Full user permissions; trust guards only the loading decision. Acceptable for a local tool, dangerous if misread.
4. **Version lock to bundled libs.** The identity guarantee costs extensions the freedom to pin their own versions of pi's core libraries.
5. **Reload cost & stale-context footguns.** `moduleCache:false` re-executes everything each reload; captured contexts poison after any session replacement — a sharp edge the docs spend significant space warning about.
6. **Inconsistent surface as a learning burden.** The flip side of "right policy per event" is a large API where every event has its own return contract, error behavior, and timing (e.g. parallel-tool-mode caveats about when `tool_call` sees sibling results). Power-for-complexity.

**Bottom line:** Pi's extension system is a maturely engineered, unusually *complete* plugin layer — closer to an editor/IDE extension API than to a typical agent's "tool plugin" hook. Its defining moves are the thin-harness/fat-runner split (enabling hot reload and a clean core), per-event dispatch semantics tuned to each event's purpose with a deliberate fail-safe asymmetry at the tool boundary, and a pragmatic security model that guards configuration-loading rather than pretending to sandbox. The tradeoffs are coherent: it optimizes for breadth, LLM-authorability, and local-dev velocity, paying for it in sequential/order-coupled composition and an explicit non-isolation stance.
