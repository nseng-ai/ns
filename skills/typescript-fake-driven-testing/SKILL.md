---
name: typescript-fake-driven-testing
description: "TypeScript fake-driven testing architecture. Use when writing or reviewing TS code with external dependencies, gateway interfaces, real adapters, in-memory fakes, or CLI scenario tests."
---

# typescript-fake-driven-testing

Use for TypeScript testing architecture when code touches external systems such as CLIs, filesystems, HTTP APIs, databases, git, package managers, or hosted services.

## Core model

- Define semantic gateway types for external capabilities.
- Keep application logic above gateways and inject a small context object manually.
- Implement real adapters at the edge; they own subprocess, filesystem, HTTP, env parsing, and wire-format parsing.
- Implement in-memory fakes as true alternate implementations of the gateway types.
- Prefer result unions for expected external failures; reserve throws for programmer errors.

Example shape:

```ts
export type AppContext = {
  git: GitGateway;
  deployments: DeploymentGateway;
  projectConfig: ProjectConfigStore;
};
```

## Gateway style

Good gateways are capability-shaped:

- `currentBranch({ cwd })`
- `listReadyPreviewDeployments({ project, branch })`
- `readProjectConfig({ repoRoot })`

Avoid mechanism-shaped gateways:

- `SubprocessGateway`
- `ShellRunner`
- `HttpClientGateway`
- gateway methods that return raw stdout for application logic to parse

Also avoid gateways that are too high-level, such as `getPreviewUrl(...)`, when selection policy belongs in application logic.

## Fake style

Use constructor-state fakes. Model the external system as already having state rather than scripting ordered calls.

```ts
const { context } = inMemoryContext({
  git: { currentBranch: "feature/demo", repoRoot: "/repo" },
  deployments: { records: [deploymentRecord({ branch: "feature/demo" })] },
  projectConfig: { kind: "found", projectName: "my-project" },
});
```

Fakes should:

- implement the same gateway type as the real adapter;
- perform no I/O;
- model non-ideal states semantically in constructor state;
- expose read-only operation logs only when behavior has no durable state to inspect;
- copy mutable input/output collections to avoid test coupling.

Do not use setup mutators like `fake.addDeployment(...)` as the primary fake API for scenario tests.

## Test layers

- `test/unit/`: pure helpers and policy with no gateways or I/O.
- `test/gateways/`: fake-check tests plus real-adapter sanity tests. Real-adapter tests may use a scripted low-level runner to verify protocol details.
- `test/scenario/`: user-facing entry points over in-memory gateway fakes. Assert exit codes, stdout/stderr, result payloads, and narrow fake logs only for invisible behavior.

Scenario tests should act once through the public entry point, such as `runCli(...)`, rather than calling internals or asserting exact subprocess calls.

## Result unions

For expected boundary failures, return discriminated unions:

```ts
export type ErrorInfo = { code: string; message: string; details?: Record<string, unknown> };
export type GatewayResult<T> = { ok: true; value: T } | { ok: false; error: ErrorInfo };
```

Application logic decides whether a gateway failure is fatal, recoverable, or a warning.

## Anti-patterns

- Scripted mocks as the primary scenario fake.
- Module mocks or spies for application behavior when explicit gateway injection is practical.
- Subprocess-shaped gateway interfaces in core logic.
- Parsing raw external wire formats outside real adapters.
- Overbroad context objects containing `cwd`, `env`, stdout/stderr, clocks, or unrelated utilities by default.
- DI containers, decorators, or framework-level provider overrides before simple structural typing and manual context injection prove insufficient.
- Full call-history assertions in scenario tests; protocol details belong in gateway tests.
