# Raw-exit candidate remediation slice

## Summary

Continued Area (d) / ADR 0015 raw-exit reconciliation for the remaining current-source `rawCommand(...)` candidates.

Implemented in this slice:

- `ccc exec autobranch` moved from `rawCommand(...)` to a normal Clinkr command with `resultSchema`, `handler`, and `renderHuman`.
  - Success returns an enveloped result with `summary` and `warnings`; warnings still go to stderr for human visibility.
  - `outcome: "failure"` now returns `failure("autobranch_failed", ...)` with exit 2 and structured outcome data instead of raw exit 1.
  - `outcome: "refusal"` is modeled as `negative(...)` with exit 1, though the currently exercised detached-head and Graphite-failure cases are operational failures and now exit 2.
- `roaster exec publish-findings` moved from `rawCommand(...)` to a normal Clinkr command with `resultSchema`, `handler`, and `renderHuman`.
  - Success returns an enveloped publication result (`inlineStatus`, `summaryStatus`) and human diagnostics render on stdout.
  - Payload parse errors, missing fallback identity for failed envelopes, GitHub lookup/write errors, and comment-body parse errors now return `failure(...)` exit 2 with stable publication reason data instead of raw exit 1.

Current remaining `rawCommand(...)` hits after this slice:

- `ts/packages/tools/packagechk/src/cli.ts`
  - default package check still uses `isRawExit: true` and is a finite-result check surface; it remains a likely migration target.
  - `claim-pypi` and `claim-npm` still use raw mode. They execute external publishing commands and mutate third-party registries, but they are not pure passthrough surfaces; keep them on the explicit follow-up list for either enveloped migration or a narrower ADR 0015 parking rationale.
- `ts/packages/tools/vibechk/src/cli.ts`
  - `run` remains a likely ADR 0015 raw-exempt process-control/runner surface because it drives an external runner, streams runner output through the workflow, and returns the runner's exit code. No code change in this slice; keep as parked/reclassified evidence unless future review finds it has become finite-result.

## Validation

```bash
pnpm --dir ts exec vitest run \
  packages/tools/vibechk/test/scenario/read-only-operations.test.ts \
  packages/hosts/sdlcc/test/unit/cli.test.ts \
  packages/tools/areg/test/scenario/init-cli.test.ts \
  packages/tools/areg/test/scenario/skill-apply-cli.test.ts \
  packages/infra/brmem/test/scenario/read-only-operations.test.ts \
  packages/infra/brmem/test/scenario/delete-operation.test.ts \
  packages/infra/brmem/test/scenario/copy-operation.test.ts \
  packages/objective/test/unit/runner-subagent-usage.test.ts \
  packages/plans/test/scenario/cli.test.ts \
  packages/aretro/test/scenario/collect-evidence.test.ts \
  packages/ccc/test/scenario/autobranch-cli.test.ts \
  packages/roaster/test/scenario/exec-cli.test.ts
# 12 files, 158 tests passed

pnpm --dir ts exec vitest run \
  packages/ccc/test/scenario/autobranch-cli.test.ts \
  packages/roaster/test/scenario/exec-cli.test.ts
# 2 files, 19 tests passed after final type/format edits

just ts-format-check
# passed after just ts-format-fix

just ts-lint
# passed with pre-existing warnings only in kernel tests

just ts-check
# passed
```

## Objective Impact

Area (d) remains open but narrower. Two finite-result raw command leaves (`ccc exec autobranch`, `roaster exec publish-findings`) are now Clinkr-enveloped and use ADR 0010/0013 exit semantics. The remaining raw-exit decisions are concentrated in `packagechk` and `vibechk run`.
