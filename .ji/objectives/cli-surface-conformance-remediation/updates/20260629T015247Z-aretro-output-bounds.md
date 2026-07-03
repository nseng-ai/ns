# Aretro Output Bounds Remediation

## Summary

Aretro's Area (b) output-volume row was rebaseline-and-remediated against current source. `sdl aretro exec collect-evidence` now exposes command-local `outputBounds` metadata: applied session limit, returned count, completion/truncation state, and continuation guidance. It detects more available sessions through one-session over-fetch, trims the sentinel from public summaries/evidence/payload detail, and keeps payload detail access selector-based with narrower locator hints.

`read-evidence-detail` keeps the existing `--payload-path` + `--json-pointer` surface and now returns `valueBounds` metadata for the selected value: value kind, child count, estimated JSON bytes, broad-pointer flag, completion state, and narrowing guidance for broad containers. No generic Clinkr pagination, JSONL, range, or compact framework API was added.

Validation evidence in this slice:

```bash
pnpm --dir ts exec vitest run packages/aretro/test/scenario/collect-evidence.test.ts packages/aretro/test/scenario/cli-shape.test.ts
just ts-check
```

Both commands passed.

## Objective Impact

This completes the Aretro portion of Area (b) output bounding with current-source evidence. The remaining Area (b) work is to re-check and either remediate or park the current `vibechk runs/show/diff` and `roaster review log` surfaces. The Objective remains open.

## Follow-Ups

- Rebaseline `vibechk runs/show/diff` against current schemas and decide whether ADR 0012 metadata is needed.
- Rebaseline `roaster review log` against current schemas and decide whether ADR 0012 metadata is needed.
- Do not extract shared output-bounds framework helpers unless later commands independently converge on the same shape and meet ADR 0012 revisit criteria.
