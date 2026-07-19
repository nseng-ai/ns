# Authoring subagent agents and runtimes

The package has one model-visible `subagent` tool. Extend its immutable startup catalogs; do not register another model-visible delegation tool.

## Add an agent type

1. Add `.ns/pi/agents/<name>.md` with `schema: ns.pi-agent.v1`, matching `name`, and `toolName: subagent`. Put child prompt wrapping, parent guidelines, and doctrine in Markdown.
2. Create a typed `SubagentAgentDescriptor`. It owns task limits, concurrency, optional whole-call timeout, tool permissions, prompt-context policy, model policy, output bounds, supported runtime kinds, and deterministic runtime preference.
3. Construct the complete descriptor array before registration. Built-ins and consumer descriptors use the same path:

```ts
const agents = createSubagentAgentRegistry(
  [EXPLORER_AGENT_DESCRIPTOR, TASK_AGENT_DESCRIPTOR, consumerAgent],
  (name) => loadPiAgentDefinition(name, cwd),
);

registerSubagentTool(pi, {
  agents,
  runtimes,
  fleetRegistry,
  loadAgentDefinition: loadPiAgentDefinition,
});
```

The registry rejects duplicate or invalid descriptors. It validates each Markdown definition independently, so one unhealthy entry does not hide healthy catalog entries. The registered JSON schema enum is fixed from this startup registry. Selected definitions are reloaded for execution and identity drift fails that call until restart.

Do not add agent-specific fields to the public input. If a policy belongs to an agent, encode it in the descriptor. Implementation agents inherit the parent provider, model, and thinking policy unless the caller selects the closed `routing: "cheap"` intent up front; that intent resolves only to an approved model within the parent's concrete provider and otherwise inherits. Launch failure never authorizes reactive rerouting. Explorer and review routing remain separate descriptor-owned cases. Prompt composition, prompt-context enrichment, descriptor tools, and model selection are applied once before runtime dispatch; runtime selection must never alter descriptor tools or the resolved model. Each task dispatches exactly once.

## Add a runtime adapter

A `SubagentRuntimeAdapter` declares one execution kind and, given the tool context, returns the shared `SubagentOutcome` shape: it creates a `SubagentRuntime` (`{ ok: true, runtime }`) or returns an availability diagnostic (`{ ok: false, diagnostic }`). The registry is built once at registration; adapters read per-call host state from the context passed to `create`. Register adapters separately from agent descriptors:

```ts
const runtimes = createSubagentRuntimeRegistry([
  {
    kind: "subprocess",
    create: () => ({ ok: true, runtime: createSubprocessSubagentRuntime() }),
  },
  { kind: "in-process", create: (ctx) => inProcessRuntimeOrDiagnostic(ctx) },
]);
```

Descriptors declare compatible kinds and preference only; they do not contain adapter implementations. `auto` walks descriptor preference deterministically. Explicit overrides are validated before dispatch.

The built-in in-process adapter is final-text-only and requires the host `modelRegistry`. Project-owned runtime-independent contracts carry foundation `ModelSelection` values (`provider` and `modelId`) while thinking remains separate metadata. Host adapters translate Pi's `ModelInfo.id` at ingress; subprocess and in-process runtimes unpack the selection only at their terminal Pi seams. The in-process adapter resolves that selection to a concrete SDK model, creates a persistent session, disables extension recursion, retains skills/context discovery, and prompts with template expansion disabled.

## Result and lifecycle requirements

- Enforce descriptor policy before creating fleet entries or runtimes.
- Thread caller cancellation through every task; remove listeners and dispose sessions exactly once.
- Return diagnostics and `sessionFile` for non-success outcomes.
- Bound model-visible final text; leave full transcripts in child session files.
- Keep shared-worktree mutation sequential unless a future descriptor explicitly proves a safe policy.
- Do not claim in-process terminal capture. Lower-level subprocess consumers may continue to use terminal mode directly.

## Tests

Cover descriptor validation and healthy-entry degradation; generated schema/catalog; auto and explicit runtime resolution; task limits/concurrency; permissions in both runtimes; provider-local cheap routing and inherited policies; cancellation and session evidence; prompt/resource policy; and direct-consumer subprocess terminal/final-text regression. Default tests use function runtimes and SDK/session fakes—no real model, network, or subprocess.

Run:

```bash
pnpm --dir ts --filter @internal/ns-pi-subagents test
pnpm --dir ts --filter @internal/ns-pi-subagents check
```
