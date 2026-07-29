# @nseng-ai/pi-ns-handoffs

Pi host adapter for `@nseng-ai/handoffs`. It owns `/ns:handoff:*` registration and presentation, self-handoff lifecycle behavior, content-derived slug tooling, and the separate `/claude:handoff` entrypoint. Pi discovers both entrypoints directly from the package `pi.extensions` manifest.

The curated `@nseng-ai/pi-ns-handoffs/create-flow` subpath exposes only the Handoff create protocol needed for genuine host composition. `@nseng-ai/pi-ns-herdr` may consume that subpath optionally; Handoff Artifact identity, storage, and verification remain owned by `@nseng-ai/handoffs/api`.
