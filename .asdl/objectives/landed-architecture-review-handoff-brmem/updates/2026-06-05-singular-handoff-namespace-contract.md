# Singular Handoff Namespace Contract

## Summary

The handoff artifact contract is now singular and flat: Handoff Artifacts live in Branch Memory namespace `handoff`, and Handoff Keys remain `<semantic-slug>.md`.

Normal handoff flows do not read the legacy `handoffs` namespace as fallback storage, and Pi worktree status no longer normalizes `session-artifacts/handoffs/...` into handoff display. Legacy local entries are a one-off operational concern, not an official compatibility surface or reusable migration command.

Implementation and documentation were aligned across the Python `asdl-handoff` CLI, Pi handoff extension, handoff-tab verification prompts, worktree-status display, handoff skills, `docs/pi/handoff-artifacts.md`, `CONTEXT-MAP.md`, and ADR 0002.

Verification: focused Python handoff CLI scenarios passed; focused Pi extension handoff/handoff-tab/worktree-status tests passed; TypeScript workspace check passed; full `just` passed.

## Objective Impact

The handoff artifact contract row is complete. The Objective now has a durable v1 answer for namespace and key shape: namespace `handoff`, flat key `<semantic-slug>.md`, branch-scoped Branch Memory entry, no hidden fallback reads.

The implementation-alignment row is complete because normal Python and Pi handoff paths now target the singular namespace, plugin smoke tests seed/assert the singular namespace, and worktree status treats legacy/session-artifact shapes as ordinary Branch Memory entries instead of handoff aliases.

The normal and failure-oriented evidence row is complete: Pi pickup tests cover the normal list/read/prompt path, while Python and TypeScript tests cover legacy-only entries being invisible to normal handoff list behavior and not normalized in worktree status.

## Follow-Ups

- If old local `handoffs` entries need to be preserved, move them as one-off operational work outside the normal handoff command surface.
- Consider closing this Objective after review, since the inventory, contract, implementation alignment, and normal/failure evidence rows are now complete.
