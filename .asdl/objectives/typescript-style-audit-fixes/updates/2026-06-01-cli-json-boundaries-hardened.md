# CLI JSON Boundaries Hardened

## Summary

The current branch hardens the CLI/process JSON boundaries in `ts/packages/pi-extensions` so parsed external command output enters as `unknown` and is narrowed by local guards before any property use. Three broad casts were removed:

- `land.ts`: `JSON.parse(result.stdout) as PullRequestView` is gone. `loadPullRequest` now parses into `unknown` and `parsePullRequestView(value: unknown)` rejects non-object top-level values, validates required fields (with `Number.isFinite` on `number`), and only then narrows `body`. The private `PullRequestView` input interface was deleted; the validated `ValidPullRequestView` output interface stays.
- `land-stack/pr-facts.ts`: `JSON.parse(result.stdout) as Partial<PullRequestSnapshot>` is gone. A new private `parsePullRequestSnapshot(value: unknown)` narrows every required field and normalizes the optional `mergeStateStatus`/`url`/`mergedAt` fields. `Boolean(raw.isDraft)` was replaced with a real `typeof === "boolean"` check.
- `worktree-status.ts`: `data.entries as BrmemEntry[]` is gone. `parseBrmemEntries`/`brmemEntryFromValue` skip malformed elements (non-objects, non-string `namespace`/`key`) and keep valid ones, so a single bad entry no longer forces the footer to `unavailable`.

Each file uses a small local `isRecord` guard; no shared helper module and no schema dependency (Zod) was introduced, consistent with the Objective's local-guards assumption.

Evidence came from the working-tree diff on branch `harden-json-boundaries` over the six touched files (three `src`, three `test`). A focused scan (`JSON\.parse\(...\) as`, `as Partial<`, `as BrmemEntry\[\]`) across the three target source files returns no matches.

## Objective Impact

This advances, but does not complete, the roadmap row "Harden untyped JSON, tool, and runtime boundaries with `unknown` plus guards or decoders," which is now `[~]`. The CLI/process JSON parse sites in land / land-stack / worktree status are done; the runner/grill runtime inputs named in the same row (`runner-subagent/json-events.ts`, `runner-subagent/subagent-runtime.ts`, and the `grill-ui/inline-ui.ts` dynamic import) still rely on broad runtime casts and are deferred to a later slice.

Two intentional malformed-output behavior changes are recorded as accepted under the Objective's "tightening validation may reveal malformed output" risk: a present non-string/non-null `body` is now rejected rather than coerced to `""`, and a non-boolean `isDraft` is rejected rather than passed through `Boolean(...)`. `null`/missing `body` still becomes an empty merge body, and valid command output is unchanged.

Added focused tests cover the new behavior: direct `parsePullRequestView` tests for non-object top-level values, missing/non-finite required fields, and malformed body; direct `loadPr` tests for a normalized snapshot, dropped malformed optional fields, non-object top-level JSON, non-boolean `isDraft`, and invalid JSON; and brmem tests for mixed valid/invalid entries and a non-array `entries` field.

Validation passed with `bun run --cwd ts/packages/pi-extensions check` (tsc), `bun run --cwd ts/packages/pi-extensions test` (547 pass), `just ts-check`, and `just ts-test`.

## Follow-Ups

- Harden the deferred runner/grill runtime inputs (`runner-subagent/json-events.ts`, `runner-subagent/subagent-runtime.ts`, `grill-ui/inline-ui.ts` dynamic import) to close out the remaining `[~]` portion of this row.
- Keep the open question of whether machine-envelope and CLI JSON parsing should converge on shared decoder helpers; this slice kept local guards rather than over-abstracting.
- The next semantic row — reworking expected failure APIs toward returned discriminated data — remains separate; this slice deliberately preserved the existing throw/return failure shapes.
