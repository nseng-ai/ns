# @nseng-ai/pi-ns-handoffs

Pi host adapter for the [`@nseng-ai/handoffs`](../../../../extensions/handoffs/README.md) ns extension.

The package owns Handoff Pi command registration, presentation, content-derived slug tooling, session launch orchestration, interactive Claude launch, and Pi parity metadata. It consumes Handoff domain behavior only through the curated `@nseng-ai/handoffs/api` surface.

The package root is the default Handoff Pi extension. `./claude-extension` exposes the Claude extension entry, and `./handoff-launch` is the declared adapter-composition surface consumed by Herdr.
