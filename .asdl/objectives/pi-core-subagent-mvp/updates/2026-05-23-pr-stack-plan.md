# PR Stack Plan Recorded

## Summary

The Objective now carries a concrete implementation split for the Pi core subagent MVP. The planned stack is four review slices:

1. Spec and public API contract.
2. Fresh child runtime/session MVP.
3. Terminal capture and deterministic protocol semantics.
4. Parent UI, regression coverage, and extension docs.

A fifth slice is parked as a contingency only if parent-session progress rendering requires substantial TUI plumbing. The plan records branch names, parent relationships, implementation scope, expected Objective updates, likely file areas, validation expectations, and Branch Memory handoff keys for each slice.

## Objective Impact

This is a planning update, not implementation completion. No roadmap implementation checkbox is complete yet. The roadmap is now detailed enough for a future stack implementation run to start at PR 1 without re-deriving the split.

Durable planning decisions added to the Objective:

- Keep the default implementation plan at four PRs.
- Split to five PRs only if UI complexity would blur the final polish slice.
- Treat `asdl-tools` Objective/spec files and Pi monorepo implementation files as a repository-boundary risk; the semantic first slice may need separate repo-specific reviews.
- Expect terminal sibling-tool protocol semantics may require low-level `packages/agent` changes, not only `packages/coding-agent` changes.
- Preserve landed-state Objective updates per slice, including one Semantic Update and branch handoff per implemented PR.

Evidence considered: local `asdl-tools` branch diff against Graphite parent `master` currently contains only the Objective scaffold files, with no implementation progress. The update therefore records the plan and risk knowledge rather than marking work complete.

## Follow-Ups

- Start with PR 1: reconcile `docs/pi/core-subagent-mvp-spec.md` with command-context-only `runChildSession()`, child-local capture-only terminal tools, canonical validated input, fresh-context-only MVP, sibling-tool protocol error, and awaited non-interactive semantics.
- When implementation moves to the Pi monorepo, verify the local repo workflow and whether public API type changes should land with the spec slice or as the first Pi-only implementation slice.
- Revisit the four-vs-five PR decision after the runtime and terminal capture slices reveal the actual parent UI surface area.
