# @nseng-ai/pi-ns-flow

This context names the Pi host-adapter boundary for Flow. Harness-independent Flow vocabulary and
behavior remain in the [`@nseng-ai/flow` context](../../../../extensions/flow/CONTEXT.md). This
package cites those terms rather than redefining them.

## Language

**Flow Pi host adapter**:
The incubating `@nseng-ai/pi-ns-flow` package under
`ts/packages/incubating/hosts/pi/extensions/pi-ns-flow/`. It consumes only the curated
`@nseng-ai/flow/api` extension package API and neutral `@nseng-ai/pi-runtime/...` helpers to
present Flow workflows through Pi while keeping `@nseng-ai/flow` harness-independent. It owns Pi
registration, interaction, notification/presentation, and parity metadata.
*Avoid*: Flow domain owner, Flow Pi subpackage, `@nseng-ai/flow/pi`, private Flow source consumer

**Flow Pi lifecycle surface**:
The fourteen `/ns:flow:*` slash-command mirrors registered by the **Flow Pi host adapter**. The six
Graphite-dependent workflows use `/ns:flow:gt:*`; three official github/gh-stack workflows use
`/ns:flow:gs:*`; the other five remain directly under `/ns:flow:*`. The package is loaded directly through its `pi.extensions` manifest and
`.pi/settings.json`, without a project-local `.pi/extensions/ns.ts` adapter, and loads a fresh
`@nseng-ai/ns/cli` module for every command invocation. Flow command metadata and submit-check
recovery policy come from `@nseng-ai/flow/api`.
*Avoid*: dynamic mirror discovery, static captured CLI module, flat lifecycle alias, provider-obscuring Graphite workflow name, project-local ns discovery adapter

**Flow stack-squash composition export**:
The explicit `@nseng-ai/pi-ns-flow/stack-squash` Pi presentation export for
`/gt:squash-stack`. It is not directly discovered by the package manifest. The repository-local
`.pi/extensions/code.ts` adapter composes it after
`@internal/pi-tools/code-workflows/smart-restack`, preserving the cross-owner seam without either
package depending on the other.
*Avoid*: second direct discovery, smart-restack ownership, Flow-to-Internal dependency, package-local cross-owner aggregate
