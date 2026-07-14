# Consolidation of the cloud workstream and the primitives-first stance

## Summary

Created as the single consolidated cloud workstream (user decision,
2026-07-12), absorbing two prior tracks so contradictory roadmaps stop
accumulating:

- **Subsumed `dispatch-extension`** (closed by subsumption). Its live scope —
  the `ns dispatch plan|prompt` capability package, the execution-target
  seam, the cloud-infrastructure decision, the credentials slice, and the
  git-native landing bar — moved into this record. Its cmux local-target leg
  moved to this roadmap's Parked section (user decision: demo doesn't need
  it; daily-driver regression risk deferred). Its historical `updates/`
  remain in place under the closed record.
- **Absorbed and retired `docs/wayfinding/ns-cloud-capabilities/`** (map,
  ideas, Eve capability map — deleted through source control; recover from
  git history). Its destination — a standalone vision doc — is superseded by
  this objective. Live tickets resolved or carried: "Vercel coupling
  stance" and "Harness stance" are resolved by the decisions below;
  "Cloud identity and secrets model" became this roadmap's credentials row;
  "Multi-repo scope", slots-in-cloud, and review/observability of
  cloud-produced work carried into Open Questions; event-driven triage and
  speculative execution parked.

Decisions recorded:

1. **Primitives-first, Eve as consumer — stance reversal.** The wayfinding
   map's charting preference was "Eve is presumed in as the cloud chassis;
   tickets validate rather than bake off." Reversed (user decision,
   2026-07-12): cloud nativity is built directly on Vercel primitives
   (Sandbox, Workflows, cron) behind two thin ns-owned seams, with backends
   pluggable toward GitHub compute for PLG. Rationale: Eve is beta on a
   beta-line Workflow SDK, does not consume `HarnessAgent`, and its
   channel/durable-session machinery is not what the demo needs; Eve earns
   its place later as a consumer of the seams. This update supersedes the
   map's stance rather than rewriting history.
2. **Harness choice: pi adapter first.** The in-sandbox harness for the
   steel thread is `@ai-sdk/harness-pi` (the user's daily-driver harness),
   with `@ai-sdk/harness-claude-code` second to prove the seam is
   harness-agnostic. This resolves the map's "Harness stance" ticket as
   option (b) — `HarnessAgent` adapters running ns's existing harnesses on a
   thin chassis — for this objective's scope.
3. **First durable job: nightly objective advancement** on Vercel Workflows,
   chosen as the proving use case for the jobs seam.

## Objective Impact

This record starts with its scope, roadmap, and orientation already
reflecting these decisions; no rows are invalidated. The reversal removes
the standing "Eve presumed in" rule from the repo — agents must not treat
Eve as the assumed chassis anymore (orientation.md carries the rule).

## Follow-Ups

- The seam-design roadmap row owns recording the gateway contracts;
  subsequent Semantic Updates own the credentials model and the nightly
  advancement policy.
- If `@ai-sdk/harness-pi` stalls (experimental API), fall back to the Claude
  Code adapter for the steel thread and record the swap.
