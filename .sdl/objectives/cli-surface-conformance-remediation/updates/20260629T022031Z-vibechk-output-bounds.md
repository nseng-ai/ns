# Vibechk Output Bounds Remediation

## Summary

Rebaselined and remediated the current `vibechk` Area (b) output-volume rows for `runs`, `show`, and `diff`.

Implemented command-local ADR 0012 bounds:

- `vibechk runs` now accepts `--max-runs` (default 50), returns only the bounded newest-first run list, and exposes `outputBounds` with applied limit, returned count, total count, completion state, and continuation guidance. The legacy domain `runs --format json` output is now `{ entries, outputBounds }` rather than a bare array so agents can tell whether the list is complete.
- `vibechk show` and `vibechk diff` now accept `--max-artifact-bytes` (default 200000) and bound the large text artifacts embedded in their result payloads: plan, transcript, and diff. Each bounded run payload includes per-artifact metadata: applied byte limit, original bytes, returned bytes, completion state, and continuation guidance. Human Markdown output includes an `Output Bounds` section when truncation occurs.
- No generic Clinkr pagination, JSONL, compact-mode framework, or shared output-bound wrapper was added; the implementation stays package-local as ADR 0012 expects.

Validation evidence:

```bash
pnpm --dir ts exec vitest run packages/tools/vibechk/test/scenario/read-only-operations.test.ts packages/tools/vibechk/test/scenario/run-command.test.ts
just ts-format-check
just ts-lint
just ts-check
```

All commands passed. `just ts-format-check` passed after `just ts-format-fix` was applied to formatter output.

## Objective Impact

This completes the `vibechk runs/show/diff` portion of Area (b) output bounding with current-source evidence. The roadmap Area (b) row remains `[~]` because `roaster review log` still needs current-schema rebaseline and either remediation or a parking rationale.

## Follow-Ups

- Rebaseline `roaster review log` against current schemas and decide whether ADR 0012 metadata is needed.
- Keep the `vibechk run` raw-exit exception parked under ADR 0015; this slice did not change the process-control runner surface.
- Do not extract shared output-bounds framework helpers unless later command-local remediations independently converge on the same shape and meet ADR 0012's evidence threshold.
