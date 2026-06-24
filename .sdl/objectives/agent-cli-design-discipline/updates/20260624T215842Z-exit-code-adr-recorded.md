# Exit-Code ADR Recorded

## Summary

Added `docs/adr/0010-clinkr-exit-code-semantics.md`, accepting a compact Clinkr process exit taxonomy: `0` for success, `1` for semantic or operational command failure, and `2` for usage/invocation/configuration failure.

The ADR makes the structured machine envelope the authoritative surface for detailed failure semantics via disciplined `error_type` / `code` and structured `data` / details. It rejects a global rich numeric exit-code taxonomy as Clinkr's default while preserving dissent for specialized shell-only automation.

## Objective Impact

This resolves one contested ADR candidate from the roadmap. The Objective now has a durable decision for exit-code semantics that can guide `sdl-cli-design` and future Clinkr implementation work: improve envelope richness and error-type discipline before expanding numeric process statuses.

The ADR intentionally leaves Python-parity-sensitive follow-ups open, including usage-error enveloping, JSON compaction/streaming, and current `negative` process-exit behavior.

## Follow-Ups

- Continue the ADR queue with JSON/parity, output-volume, usage-error enveloping, and confirmation/danger-tier decisions.
- Reflect ADR 0010 in `sdl-cli-design` once the skill is authored.
- Prefer structured failure `data` and error-type/code discipline for the first Clinkr implementation slice, rather than numeric exit-code expansion.
