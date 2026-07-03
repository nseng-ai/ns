# Graphite Command Channel Slice Completed

## Summary

Flow land Graphite execution now goes through a dedicated internal command channel in `ts/packages/capabilities/flow/src/land-stack/graphite-command-channel.ts`. The channel owns Graphite execution through `runGraphiteCommand`, command-stream start/finish behavior, raw-vs-streamed edge cases, command normalization, checked-out-elsewhere parsing, missing-branch delete normalization, and the final-delete retained-branch success rendering. Land runtime creation is centralized in `land-runtime.ts`, so land entrypoints pass one runtime object instead of threading `extensionApi` / `streamedApi` / `unstreamedPi` variants for Graphite behavior.

Validation evidence for the slice and follow-up runtime cleanup:

- `pnpm --dir ts --filter sdl-flow test -- test/unit/land-stack-command-scenarios.test.ts test/unit/land-stack-helpers.test.ts test/unit/land-stack-snapshot.test.ts test/unit/land-stack-topology-guards.test.ts test/unit/land-stack-pr-facts.test.ts` passed during implementation.
- Combined targeted Flow validation later passed: 36 files / 361 tests covering land-stack, autobranch, and PR-description scenarios.
- Full TS validation later passed: `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`, `just ts-test-integration`, `just ts-test-typescript-style-guard`, and `just ts-deps-check`.

## Objective Impact

Completes the roadmap row "Collapse the Graphite command channel". `execGraphite` / `execRawGraphite` and the old `graphite-command-args.ts` wrapper are gone from the Flow source, Graphite maintenance no longer manually coordinates raw vs streamed Graphite execution, and the optional-descendant / final-delete special cases are named channel behavior instead of caller-owned ad hoc command plumbing.

## Follow-Ups

None for this slice before review. A later review may choose to make the channel interface even more operation-spec-shaped, but the shallow wrapper cluster and pi-variant threading that motivated this Objective slice have been removed.
