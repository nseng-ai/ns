# @nseng-ai/pi-ns-objectives

Pi host adapter for the [`@nseng-ai/objectives`](../../../../extensions/objectives/README.md)
ns extension.

This incubating package preserves the `/ns:objective:*` Pi command family while keeping
Pi registration and presentation out of the harness-independent Objectives package. It
consumes Objective behavior only through the curated `@nseng-ai/objectives/api` extension
package API and uses neutral `@nseng-ai/pi-runtime/...` host helpers for Pi integration.

The adapter owns Pi command registration, completion, selection presentation, skill
expansion, and Pi parity metadata. It does not redefine Objective records, lifecycle,
storage, selection policy, or runner semantics; those remain owned by the Objectives
extension and the repository's canonical Objective-system context.

## Current status

The package is implemented on the current feature branch but has not landed or been
published. Its `pi.extensions` manifest makes the package itself the Pi entry point; this
repository loads the local workspace package directly from `.pi/settings.json`, without a
`.pi/extensions/objective.ts` discovery adapter. The separate local
`.pi/extensions/objective-autorun.ts` artifact continues to own only the
`objective_runner_step` tool; it is not part of this package's slash-command adapter.
