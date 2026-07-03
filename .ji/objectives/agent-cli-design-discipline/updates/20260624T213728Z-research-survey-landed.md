# Research Survey Landed

## Summary

Added `docs/research/agent-era-cli-design-survey.md`, a checked-in survey mapping human-first CLI guidance from clig.dev against agent-era tool guidance from Anthropic, Speakeasy, and Agent Layer. The survey preserves contested positions instead of resolving them inline.

## Objective Impact

This completes the first roadmap slice. The Objective now has a durable evidence map to ground the Clinkr audit, ADR backlog, and eventual `sdl-cli-design` skill. The survey identifies concrete ADR candidates for exit-code semantics, JSON compaction/parity, pagination/truncation, usage-error enveloping, danger tiers, and public-vs-internal skill placement.

## Follow-Ups

- Audit Clinkr against the survey and produce the classified gap list with file:line evidence.
- Use the survey's ADR backlog as the starting point for contested decision records.
