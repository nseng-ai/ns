# @nseng-ai/pi-ns-handoffs

Pi host adapter for the [`@nseng-ai/handoffs`](../../../../extensions/handoffs/README.md) ns extension.

The package owns Handoff Pi command registration, presentation, session launch orchestration, and Pi parity metadata. Portable content-derived slugging and atomic creation belong to `@nseng-ai/handoffs`; this adapter consumes Handoff domain behavior through the curated `@nseng-ai/handoffs/api` and `ns handoff` command surfaces.

Skill-backed create commands use the exact `handoff-create` source selected in Pi's effective skill
inventory. They capture that source from the invocation command context before focus, Git,
destination, or launch work and defer reading its content until the model prompt is needed.

The package root is the default Handoff Pi extension. `./handoff-launch` is the declared adapter-composition surface consumed by Herdr.
