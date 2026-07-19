# Semantic Update: Reference-based Herdr Handoff launch

The completed Herdr-native handoff-tab row now uses two deterministic operations instead of a model-facing launch tool:

1. The optional Handoffs Pi create flow composes the final Markdown, derives its content-backed slug, and persists it once through `ns handoff create`.
2. `ns herdr exec handoff-tab launch` accepts only branch, slug, exact `HERDR_WORKSPACE_ID`, and explicit provider/model/thinking values. It verifies the durable artifact through the Handoffs Capability API before creating a focused `handoff: <slug>` tab and launching pickup in the returned root pane.

The removed launch-tool architecture is superseded. The shared content-slug tool and collision refusal remain unchanged. A failed tab creation leaves the durable branch/slug reference available for retry; a failed pane run returns workspace, tab, pane, attempted command, and a copyable `herdr pane run` recovery command.

Validation evidence:

- `@nseng-ai/herdr` check and focused tests passed (105 tests).
- `@nseng-ai/handoffs` check and focused tests passed (142 tests).
- The final dependency, formatting, lint, integration-startup, stale-name, and repository validation evidence is recorded with the implementing change.

No later Objective row is advanced by this update.
