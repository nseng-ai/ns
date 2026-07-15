# Workflow v5 and production deployment hardening

## Summary

Committed branch work after the first live prompt dispatch materially hardened the deployable without changing the Vercel-native execution architecture:

- commit `200495b89` migrated dispatch packaging to Workflow v5 unified artifacts, added low-cardinality phase attributes and sanitized lifecycle events, and made terminal workflow failures non-retryable;
- commit `1cce1ca14` introduced the explicit `just dispatch-deploy-prod` path with final-inventory verification, transactional Build Output promotion, immutable deployment/alias identity checks, and a separate read-only production health check;
- commit `9e9016937` moved production builds into exact-SHA detached worktrees, made the final verifier authoritative across build and promotion, hardened deployment URL parsing, and required successful cleanup before upload.

The living deployment contract records the resulting mechanics. The new production command is implemented and locally covered, but it has not produced newer live deployment evidence.

## Objective Impact

This reduces the deployable-packaging risk and makes future live interludes more reproducible: the bytes promoted to production are tied to a clean captured commit, the complete API and Workflow inventory is verified through one boundary, and deployment success requires immutable deployment/alias identity rather than readiness alone. Workflow v5 observability also gives the later jobs-status surface safe phase-level signals.

The active steel-thread status does not change. The first prompt dispatch still used fallback recovery after exposing the Pi extension-binding and child-PATH defects; one controlled rerun must still prove first-call Bash, an agent-created commit, subagent spawn, and normal landing before the row closes. The deployment hardening is preparation for that rerun, not live evidence for it.

## Follow-Ups

- Use the explicit production deployment path for the next controlled deployment and append only witnessed facts to `references/dispatch-live-evidence.md`.
- Run the controlled Pi steel-thread rerun after deployment; do not author the setup skill until normal landing is live-proven.
- Preserve Workflow v5 phase attributes and sanitized events as input to the future dispatch-jobs TUI without treating local coverage as proof of deployed behavior.
