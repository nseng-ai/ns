# Clinkr Markdown Renderer Support

## Summary

Implemented the Clinkr framework seam needed before TypeScript `handoff list` can preserve a distinct markdown renderer. Rendered Clinkr commands now support an optional `renderMarkdown` hook for successful ok exits, normalize `--format md` to markdown internally, and keep markdown fallback behavior aligned with human rendering when no markdown renderer exists.

Evidence: local branch diff against `add-handoff-typescript-port-objective` contains only Clinkr source/test changes for this slice, and PR #1504 corroborates the same file set. Validation passed for focused Clinkr check/test, full TypeScript workspace check/test, and `git diff --check`.

## Objective Impact

The roadmap item “Add `@asdl/clinkr` markdown renderer support if still needed” is complete. The main framework blocker for a future TypeScript `handoff list --format markdown` implementation is removed without changing JSON envelopes, legacy machine output, raw command behavior, or non-ok exit rendering.

The next Objective slice should scaffold `ts/packages/handoff` and port `handoff list`, using the new Clinkr markdown renderer hook to preserve the durable Python markdown table contract.

## Follow-Ups

- Consume `renderMarkdown` in the future `@asdl/handoff` `list` command.
- Preserve exact `handoff list --format markdown` / `--format md` table contract in Handoff package scenario tests.
- Keep `legacyMachine` JSON-only and non-ok exits unchanged as further migrated commands adopt markdown rendering.
