# Output-Volume ADR Recorded

## Summary

Added `docs/adr/0012-clinkr-output-volume-discipline.md`, accepting a YAGNI posture for Clinkr output-volume framework features. The ADR keeps pretty JSON as the current Clinkr serialization behavior and explicitly declines `--compact`, generic pagination/truncation/range primitives, generic bounded-result wrappers, and JSONL/streaming output for now.

Instead, the ADR records output volume as command-local authoring discipline: commands whose machine results can grow large should choose domain-appropriate bounds and, when truncation or bounded results are possible, expose completion state, applied bounds, and continuation or narrowing guidance in machine-readable result schemas.

## Objective Impact

This resolves the output-volume contested decision without requiring immediate Clinkr code changes. `sdl-cli-design` can now teach bounded-output guidance honestly as command-design policy rather than claiming Clinkr has compact or pagination primitives. The remaining ADR queue is narrower: negative process-exit defaults and confirmation/danger tiers.

The roadmap now parks compact JSON, generic pagination/truncation/range primitives, generic bounded-result wrappers, and JSONL/streaming until repeated command pressure or one severe agent-context failure justifies framework extraction.

## Follow-Ups

- Reflect ADR 0012 in `sdl-cli-design`: bounded machine output is command-local guidance, not a Clinkr framework API.
- Continue the ADR queue with the negative process-exit default decision and the confirmation/danger-tier decision.
- Reopen output-volume framework extraction only if the ADR's evidence threshold is met.
