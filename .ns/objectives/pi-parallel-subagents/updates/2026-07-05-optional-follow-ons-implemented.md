# Optional Follow-Ons Implemented

## Summary

Implemented the two optional follow-ons that were previously considered for parking:

- Fleet/transcript monitoring: `@nseng-ai/ns-pi-subagents` now keeps a session-local recent/current runner-subagent fleet for explore calls, renders a persistent `ns.explore.fleet` widget, and registers `ns:explore:transcript` to inspect child Pi session JSONL transcripts known to the current Pi process.
- Runtime adapter seam: explorer dispatch now routes through an explicit `ExplorerRuntime` seam. The subprocess runtime remains the default. A non-default in-process runtime adapter is available only by explicit injection and is covered by fake-driven tests.

The reusable fleet state is deliberately generic runner-subagent infrastructure under `@internal/pi-tools/runner-subagents`; explore owns only the widget labels and transcript command integration.

## Objective Impact

The fleet/transcript and in-process runtime adapter roadmap rows are complete rather than parked. No durable fleet index was added, and child session JSONL files remain the transcript source of truth. Subprocess dispatch remains the default production behavior for `explore`.

Validation evidence from the implementation slice:

```bash
pnpm --dir ts --filter @nseng-ai/ns-pi-subagents run check
pnpm --dir ts --filter @nseng-ai/ns-pi-subagents run test
```

The package test run covered 8 files / 33 tests, including new fleet, transcript parsing, and in-process runtime fake tests.

## Follow-Ups

- Dogfood the transcript command in a real Pi TUI session to tune overlay ergonomics.
- Decide later whether the in-process runtime adapter should use the real Pi SDK session factory directly or remain a fake-covered adapter seam until a context-forking caller needs it.
- Keep `/investigate` migration as the remaining separate open question.
