# Runner child-session progress is live-readable

## Summary

Improved the real Pi child-session adapter's live stderr progress for `sdl objective exec runner-step <slug>`. Activity events now include elapsed prefixes, begin with the live `child-session.jsonl` path, summarize tool starts with commands/paths where possible, preview failed tool results, and surface completed assistant text plus Pi `thinking` block previews without per-token spam.

The Runner Checkpoint contract is unchanged: stdout remains checkpoint-only, raw child stderr still passes through as `stderr` events, and final assistant text / stop reason capture remains the source for report parsing.

## Objective Impact

This materially improves dogfooding visibility for long Objective Runner steps. A parent can now see what the child is doing mid-flight and jump directly to the live session JSONL when the compact progress stream is insufficient, without adding runner state or a public command surface.

## Follow-Ups

- Dogfood the enriched progress stream during a real `runner-step` / `objective-autorun` slice and record whether the compact previews are enough to make parent intervention decisions.
- If tool payloads prove noisy in real runs, tune the adapter-local summarizer rather than changing `ChildSessionEvent` or checkpoint Markdown.
