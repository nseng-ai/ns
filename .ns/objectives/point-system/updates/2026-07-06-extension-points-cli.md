# Extension Points CLI

## Summary

Local branch `point-system/extension-points-cli` commit `7fd234cec` added read-only kernel-owned Clinkr commands under the `ns extension` group: `ns extension points` for the catalog and `ns extension point <id>` for detail. The commands expose typed result schemas, human rendering, JSON envelopes/schema support, active source and diagnostics reporting, and point detail lookup.

A smoke run against this repo's current config (`node ts/packages/kernel/src/cli/index.ts extension points --format json`) returned catalog entries including `branch-context.plans-write` and `flow.submit.pr-description` with active sources.

## Objective Impact

This completes the CLI introspection roadmap row. The remaining Objective work is the graduation slice: author the ADR, add CONTEXT.md vocabulary, and re-derive or retire `orientation.md`. That row is decision-bearing and should be steered with the user before implementation.

Validation evidence from the runner step: targeted extension-points CLI scenario tests passed; impacted kernel scenario/unit tests passed; `pnpm --dir ts run fmt:check`, `pnpm --dir ts run check`, `pnpm --dir ts run lint`, and the smoke run passed. Full `just` passed dprint, deps, fmt, lint, check, full Vitest, and objective check, then failed only on the known unrelated `@nseng-ai/objectives` topology-circle style-guard failure recorded in earlier updates.

## Follow-Ups

- Pause before ADR/CONTEXT graduation and confirm wording/scope with the user, per the roadmap policy.
