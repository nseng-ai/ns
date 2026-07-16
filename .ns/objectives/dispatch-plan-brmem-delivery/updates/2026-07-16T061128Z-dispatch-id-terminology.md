# Dispatch ID terminology adopted

## Summary

The cross-system correlation identity is named **Dispatch ID**, not Anchor ID. The anchor branch and anchor PR are consumers of the identity; they do not define it.

The settled Workflow attribute is `dispatch.id`, matching the existing `dispatch.*` attribute namespace without repeating the word “dispatch.” The Branch Memory context convention is correspondingly `<dispatch-id>/plan/<plan-slug>.md` under the `dispatch-input` namespace.

This update supersedes only the terminology in `2026-07-16T060216Z-local-autorun-and-anchor-context-contract.md`. That earlier Semantic Update remains immutable historical evidence; its underlying autorun, context-envelope, provenance, and no-manifest decisions are unchanged.

## Objective Impact

- Durable Objective, roadmap, and README prose now use Dispatch ID consistently.
- Implementation should introduce a first-class Dispatch ID rather than promote an anchor-branch suffix as the owning concept.
- Human and machine output expose Dispatch ID; Vercel retains its separate generated `wrun_...` execution ID.

## Follow-Ups

- Use `dispatch.id` in Workflow start attributes and attribute-recovery tests.
- Keep anchor-specific naming only for anchor branch and pull-request concepts.
