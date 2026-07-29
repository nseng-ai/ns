# @nseng-ai/pi-ns-herdr

Pi host adapter for `@nseng-ai/herdr`. It owns Pi command registration, interaction adaptation, launch-profile resolution, and Pi process-command construction for the Herdr resource and implementation catalog. Pi discovers it directly from the package `pi.extensions` manifest.

The optional `/ns:herdr:tab:handoff` command composes `@nseng-ai/pi-ns-handoffs/create-flow`. Exact absence of that optional adapter omits only this command; evaluation and transitive dependency failures remain fatal. Herdr destination mechanics and durable Handoff verification remain in `@nseng-ai/herdr`.
