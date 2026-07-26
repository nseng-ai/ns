# ADR 0043: Unified Subagent Tool and Runtime Selection

## Status

Accepted

## Context

Delegated behavior and child execution architecture are separate decisions. Read-only exploration and focused implementation need different permissions and task bounds; either may execute through isolated subprocess or explicitly selected in-process session. Encoding each combination as model-visible tool duplicates schemas and orchestration, lets runtime mechanics blur policy.

ns also requires control over permission enforcement, prompt and result contracts, transcript evidence, progress presentation, Pi-version integration. Existing in-house Runner-Subagent Substrate already provides subprocess isolation, JSON protocol handling, terminal capture, bounded results, concurrency primitives; third-party projects are useful references, would not remove ownership of these policy and UX surfaces.

## Decision

Pi registers exactly one model-visible typed tool named `subagent`. Its common input selects Agent Type, supplies titled tasks, may request Execution Architecture or closed `cheap` Routing Intent. No per-agent tools, no compatibility aliases.

Immutable typed **Agent Registry** contains **Agent Descriptors**. Each descriptor owns executable behavioral policy: task and concurrency bounds, timeout, tool permissions, prompt-context policy, model policy, result bounds, supported runtimes, deterministic automatic runtime preference. Markdown agent definitions own prompt and steering prose only; cannot grant executable permissions.

Separate **Runtime Registry** owns available Runtime Adapters and execution mechanics for `subprocess` and `in-process`. Omitted or `auto` execution follows descriptor preference deterministically; both built-ins initially prefer subprocess isolation. Explicit supported runtime may change how child runs; can never add tools, relax task bounds, or otherwise weaken descriptor policy. Unsupported or unavailable combinations fail before launch.

Built-in `explorer` descriptor permits bounded parallel read-only reconnaissance. Read-only behavior is enforced by its tool allowlist, not by prompting; if shell-like reconnaissance is needed, add vetted read-only tool rather than admitting `bash`. Built-in `task` descriptor permits exactly one focused shared-worktree task. Results stay bounded in parent context while persistent child transcript stays authoritative; orchestration owns concurrency and progress.

Model-visible routing contract is closed. Implementation task children inherit parent provider, model, thinking policy by default. Only caller-selected down-route is `routing: "cheap"`, resolved before dispatch to approved model within same concrete provider; when no approved mapping exists, it inherits. Launch failure never authorizes reactive provider or model rerouting. Descriptor-owned explorer routing and trusted direct-consumer contracts stay separate typed policies.

Unified tool is built in-house on Runner-Subagent Substrate. Lower-level `RunnerSubagent*`, `dispatchRunnerSubagent`, `SubagentRuntime.dispatch` contracts stay valid for direct consumers, including terminal-capture users. Third-party implementations stay design references, not dependencies, so ns keeps permission enforcement, protocol, prompt, transcript, bounded-preview, UI control without adopting larger delegation framework or forked agent runtime.

## Consequences

- Model sees one stable delegation interface, typed catalog of behavioral choices.
- New Agent Types extend startup registry rather than adding visible tools; schema identity changes need restart.
- Behavioral policy and execution architecture evolve independently, with equivalent descriptor enforcement across runtimes.
- Subprocess provides automatic isolation default. Explicit in-process execution accepts weaker fault isolation, disables extension recursion and delegated prompt-template expansion, keeps normal skills, context discovery, persistent session evidence.
- Fleet visibility is session-local, not durable job database.
- Package owns Pi integration churn and orchestration code in exchange for precise policy, result, transcript, presentation contracts.

## Alternatives

- **One model-visible tool per agent:** rejected: duplicates orchestration, grows model surface.
- **Runtime-selected permissions or mandatory runtime choice:** rejected: execution mechanics must not determine behavior or burden ordinary callers.
- **Markdown-defined executable policy:** rejected: permissions and bounds need typed validation and immutable registration.
- **Adopt a third-party delegation framework:** rejected: available projects add incompatible Pi coupling or broader frameworks while leaving ns-specific policy and UX fork-owned.
- **Free-form model overrides or failure fallback:** rejected: routing authority must stay closed, provider-local, decided before launch.
