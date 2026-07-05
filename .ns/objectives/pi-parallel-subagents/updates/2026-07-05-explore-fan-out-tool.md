# Explore Fan-Out Tool Implemented (2026-07-05)

Branch: `explore-fan-out-tool`.

## Summary

Roadmap item 3, **Model-invocable fan-out tool**, is implemented as the planned narrow
slice. Pi now has an engineered `explore` extension entry point in
`@internal/pi-tools/explore/extension` plus a repo-local `.pi/extensions/explore.ts`
shim.

Implemented semantics:

- `explore` registers from the existing explorer agent definition when available.
- Tool input requires 2+ tasks and supports `breadth: "quick" | "medium" |
  "very-thorough"`.
- Breadth profiles cap task count, concurrency, and wall-clock budget:
  - quick: 2 tasks / 2 concurrent / 90s
  - medium: 4 tasks / 3 concurrent / 180s
  - very-thorough: 8 tasks / 4 concurrent / 300s
- Explorer children run through `dispatchExplorerSubagent`, preserving the existing
  read-only child allowlist and cheap-model/failover policy.
- Fan-out preserves input order while running bounded workers concurrently.
- Progress updates are compact text summaries only; no fleet widget or per-task live row
  renderer was added.
- Tool results include ordered per-task status/details, session files when available,
  diagnostics/failover metadata, and interim capped final-text excerpts.
- Missing/malformed/wrong-tool `.ns/pi/agents/explorer.md` is a friendly
  `configuration-error` tool result rather than an extension startup crash.

## Boundaries preserved

- Item 4 is still open: no durable preview/pointer files or retrieval handles were
  added. The current final-text excerpt is explicitly interim and model-visible only.
- Item 5 is still open: no live inline fleet widget or placeholder-sentinel renderer was
  added.
- No real explorer dogfood was run; the home-directory-guard bypass decision still gates
  real child-process dogfooding.
- No parity registry entry was added because the typed parity registry still supports
  command surfaces only.

## Validation

Focused fake-driven validation passed:

```bash
pnpm --dir ts exec vitest run packages/internal/pi-tools/test/explore/contract.test.ts packages/internal/pi-tools/test/explore/dispatch.test.ts packages/internal/pi-tools/test/explore/model-policy.test.ts packages/internal/pi-tools/test/explore/extension.test.ts
# 4 files, 24 tests passed

pnpm --dir ts run check
pnpm --dir ts run lint
pnpm --dir ts run fmt:check
```

Formatter was applied once with `just ts-format-fix` before rerunning the checks above.

## Objective Impact

Roadmap item 3 is complete. Items 4 and 5 remained open after this slice, and routine real explorer dogfooding remained gated on the home-directory-guard bypass decision.

## Follow-Ups

- Item 4 should replace the interim cap with durable bounded previews plus full findings
  pointers on disk.
- Item 5 should add the live fleet widget/per-task row rendering.
- The guard-bypass decision remains required before routine real explorer dogfooding.
