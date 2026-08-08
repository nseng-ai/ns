# @nseng-ai/pi-ns-flow

Pi host adapter for the [`@nseng-ai/flow`](../../../../extensions/flow/README.md) ns extension.

This incubating package owns Pi registration, interaction, notification and presentation behavior,
parity metadata, and direct discovery for the eleven `/ns:flow:*` lifecycle mirrors. Flow domain
behavior, stable command metadata, submit-check recovery policy, and stack-squash execution remain
behind the curated `@nseng-ai/flow/api` extension package API; the adapter never imports Flow's
private source.

The package's `pi.extensions` manifest directly discovers only the lifecycle entrypoint. That
entrypoint loads a fresh `@nseng-ai/ns/cli` module for every command invocation. The separately
exported `@nseng-ai/pi-ns-flow/stack-squash` adapter is not directly discovered: the repository's
`.pi/extensions/code.ts` composes it with Internal smart-restack presentation so neither owning
package imports the other.

Pi is an optional host for Flow. The portable command face remains `ns flow ...`.
