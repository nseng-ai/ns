# Mutation Safety Fake Gateways

## Summary

The mutation-safety branch ported reply formatting and fake-backed mutation executor paths into `ts/packages/pr-address` while preserving validation-before-action behavior.

TypeScript now directly handles these mutation/reply operations through gateway seams:

- `add-issue-comment`
- `add-reaction`
- `add-review-thread-reply`
- `reply-to-review`
- `reply-to-discussion`
- `resolve-thread`
- `unresolve-thread`
- `resolve-thread-with-reply`
- `resolve-thread-batch`

The implementation adds reply formatting/builders with existing golden parity, extends the GitHub gateway with mutation methods, extends the git gateway for local-branch planned provenance validation, and tests the executor paths with in-memory fakes only. Tests assert invalid payloads and invalid planned provenance fail before any fake mutation call is recorded.

Validation evidence:

- `pnpm --dir ts/packages/pr-address run test` passed with mutation-operation and reply-formatting coverage included.
- `pnpm --dir ts/packages/pr-address run check` passed.
- No live GitHub write probes were run, by design.

## Objective Impact

This completes the mutation/reply helper roadmap row for fake-backed TypeScript behavior. The port preserves the no-live-write safety boundary during validation and keeps mutation `--json-schema` output fallback-backed to avoid schema-contract drift.

Broad Python fallback deletion is still not justified by this row alone; fallback retirement remains per-operation and evidence-backed.

## Follow-Ups

- Keep live GitHub write validation as an explicit user-approved operation if it is ever needed.
- Preserve mutation `--json-schema` fallback until schema parity is explicitly implemented or classified as a safe structured contract.
- Continue to avoid broad fallback deletion until public wrapper/distribution and operation coverage are settled.
