# Standalone Spec Absorbed into Objective

## Summary

The standalone `docs/pi/core-subagent-mvp-spec.md` was retired. Its relevant durable information now lives in the Objective itself: motivation from the Objective stack failure, lessons from prior subagent extension work, fresh child-session defaults, parent-derived session persistence, child boundary instructions, lightweight UI expectations, capture-only terminal semantics, collision handling, sibling-tool protocol errors, implementation preferences, and parked non-goals.

Repository docs that pointed at the deleted spec now point at the Objective record instead.

## Objective Impact

The Objective is now the canonical design/spec record for the Pi core subagent MVP. PR 1 changes from "reconcile a separate spec document" to "keep the Objective as the single durable contract and add/export public API types if that work lands in the same slice."

Roadmap spec-consolidation items are complete. No Pi runtime, public API type, terminal-capture, UI, or Objective stack rewrite implementation has landed yet.

This reduces the repository-boundary risk for the first slice: `asdl-tools` can carry the Objective contract while Pi monorepo changes can focus on exported types and implementation.

Verification: repository Markdown/doc validation was run for the Objective/docs-only change.

## Follow-Ups

- When Pi implementation starts, decide whether exported `runChildSession()` types are a small first Pi-monorepo PR or folded into the child runtime slice.
- Keep future user-facing Pi extension docs linked to or extracted from this Objective rather than recreating a second standalone design spec.
- Continue PR 2 with non-replacing fresh child runtime/session behavior after the API surface is settled.
