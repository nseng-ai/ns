# ADR 0043: Unified Subagent Tool and Runtime Selection

## Status

Accepted

## Context

Delegated behavior and child execution architecture are separate decisions. Read-only exploration and focused implementation need different permissions and task bounds, while either may execute through an isolated subprocess or an explicitly selected in-process session. Encoding each combination as a model-visible tool duplicates schemas and orchestration and lets runtime mechanics blur policy.

ns also needs control over permission enforcement, prompt and result contracts, transcript evidence, progress presentation, and Pi-version integration. The existing in-house Runner-Subagent Substrate already provides subprocess isolation, JSON protocol handling, terminal capture, bounded results, and concurrency primitives; third-party projects are useful references but would not remove ownership of these policy and UX surfaces.

## Decision

Pi registers exactly one model-visible typed tool named `subagent`. Its common input selects an Agent Type, supplies titled tasks, and may request an Execution Architecture or the closed `cheap` Routing Intent. There are no per-agent tools or compatibility aliases.

An immutable typed **Agent Registry** contains **Agent Descriptors**. Each descriptor owns executable behavioral policy: task and concurrency bounds, timeout, tool permissions, prompt-context policy, model policy, result bounds, supported runtimes, and deterministic automatic runtime preference. Markdown agent definitions own prompt and steering prose only; they cannot grant executable permissions.

A separate **Runtime Registry** owns available Runtime Adapters and execution mechanics for `subprocess` and `in-process`. Omitted or `auto` execution follows descriptor preference deterministically; both built-ins initially prefer subprocess isolation. An explicit supported runtime may change how a child runs but can never add tools, relax task bounds, or otherwise weaken descriptor policy. Unsupported or unavailable combinations fail before launch.

The built-in `explorer` descriptor permits bounded parallel read-only reconnaissance. Read-only behavior is enforced by its tool allowlist, not by prompting; if shell-like reconnaissance is needed, add a vetted read-only tool rather than admitting `bash`. The built-in `task` descriptor permits exactly one focused shared-worktree task. Results are bounded in parent context while the persistent child transcript remains authoritative, and orchestration owns concurrency and progress.

The model-visible routing contract is closed. Implementation task children inherit the parent provider, model, and thinking policy by default. The only caller-selected down-route is `routing: "cheap"`, resolved before dispatch to an approved model within the same concrete provider; when no approved mapping exists, it inherits. Launch failure never authorizes reactive provider or model rerouting. Descriptor-owned explorer routing and trusted direct-consumer contracts remain separate typed policies.

The unified tool is built in-house on the Runner-Subagent Substrate. Lower-level `RunnerSubagent*`, `dispatchRunnerSubagent`, and `SubagentRuntime.dispatch` contracts remain valid for direct consumers, including terminal-capture users. Third-party implementations remain design references rather than dependencies so ns retains permission enforcement, protocol, prompt, transcript, bounded-preview, and UI control without adopting a larger delegation framework or a forked agent runtime.

## Consequences

- The model sees one stable delegation interface and a typed catalog of behavioral choices.
- New Agent Types extend the startup registry rather than adding visible tools; schema identity changes require restart.
- Behavioral policy and execution architecture evolve independently, with equivalent descriptor enforcement across runtimes.
- Subprocess provides the automatic isolation default. Explicit in-process execution accepts weaker fault isolation, disables extension recursion and delegated prompt-template expansion, and retains normal skills, context discovery, and persistent session evidence.
- Fleet visibility is session-local and is not a durable job database.
- The package owns Pi integration churn and orchestration code in exchange for precise policy, result, transcript, and presentation contracts.

## Alternatives

- **One model-visible tool per agent:** rejected because it duplicates orchestration and grows the model surface.
- **Runtime-selected permissions or mandatory runtime choice:** rejected because execution mechanics must not determine behavior or burden ordinary callers.
- **Markdown-defined executable policy:** rejected because permissions and bounds require typed validation and immutable registration.
- **Adopt a third-party delegation framework:** rejected because available projects add incompatible Pi coupling or broader frameworks while leaving ns-specific policy and UX fork-owned.
- **Free-form model overrides or failure fallback:** rejected because routing authority must remain closed, provider-local, and decided before launch.
