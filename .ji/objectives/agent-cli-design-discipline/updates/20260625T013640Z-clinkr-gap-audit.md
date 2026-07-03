# Clinkr Gap Audit Completed

## Summary

Added `.sdl/objectives/agent-cli-design-discipline/references/clinkr-agent-era-gap-audit.md`, a post-ADR-0011 evidence map for Clinkr's agent-era CLI design gaps. The audit classifies each seed gap as resolved, land-now, ADR-needed, or large backlog with file:line evidence.

Resolved items include the TS-native camelCase machine envelope, structured failure `data`, JSON-mode usage-error envelopes for the Zod validation path, and published machine-envelope schemas. Remaining ADR-needed items are output-volume strategy, negative process-exit defaults, and confirmation/danger tiers. Error-type discipline is classified as land-now guidance rather than a global enum, and dry-run / force / aliases remain backlog unless the danger-tier ADR pulls them forward.

## Objective Impact

This completes the roadmap's classified Clinkr audit slice and narrows the ADR queue. The Objective can now proceed from evidence instead of hypotheses: the next substantive work is to decide output-volume behavior and danger semantics, then author `sdl-cli-design` against ADR 0010, ADR 0011, and the audit findings.

## Follow-Ups

- Write the output-volume ADR covering compact JSON, pagination/truncation, and streaming/JSONL boundaries.
- Write or decide the negative process-exit default ADR/follow-up.
- Write the confirmation/danger-tier ADR.
- Reflect the resolved Clinkr envelope rules and remaining design-around guidance in `sdl-cli-design`.
