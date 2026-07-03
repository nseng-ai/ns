# CLI surface rollout audit

## Summary

The CLI UX Objective is no longer just the representative `objective list` / `flow submit` rebuild. The rollout has been rebaselined with a full first-party TypeScript CLI surface audit in `cli-surface-audit.md`.

Key decisions:

- Feature-building migrations move to the front of the roadmap before broad mechanical conversion.
- Hidden `exec`/skill primitives, LM-ready JSON/Markdown payload readers, and full-screen TUI surfaces are exempt by default unless they grow durable human-facing modes.
- The feature gaps to stabilize first are side-effect workflow/progress, destructive preview/confirmation, actionable shell/navigation output, registry/agent-run reporting, and generalized buffered list/detail/report primitives.
- After those primitives settle, remaining list/status/detail/mutation surfaces should be transformed mechanically by shape.

## Objective Impact

- Added `cli-surface-audit.md` as the per-surface source of truth for migration status and ordering.
- Updated `objective.md` so the active phase is the audited rollout rather than a parked follow-on.
- Updated `roadmap.md` so the next work is feature-set stabilization first, then mechanical migration batches.

## Follow-Ups

- Keep `cli-surface-audit.md` current as surfaces migrate or exemptions change.
- Start with one P0 feature-building slice; do not batch broad mechanical table rewrites until the shared primitives are stable.
