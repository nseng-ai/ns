# TSConfig Strictness Verdicts

## Summary

The `tsconfig` strictness delta is now decision-complete.

Verdicts:

- **Adopt-now, already landed:** keep `moduleDetection: "force"`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, and `noUncheckedSideEffectImports` in `ts/tsconfig.json`. They fit the existing ESM-only, erasable, strict TypeScript baseline; compensate for the absence of a TS linter; and prevent common refactor and import mistakes with low ongoing ceremony.
- **Adopt through default:** rely on `strict: true` for `useUnknownInCatchVariables`. The behavior is desirable because caught values are not guaranteed to be `Error` instances, and `pnpm --dir ts exec tsc --showConfig` confirms it is already effective under the current config. Do not add a duplicate explicit line solely for Eve parity.
- **Adopt-now, follow-up config change:** set `forceConsistentCasingInFileNames: true` in a separate focused follow-up. TypeScript documentation recommends the flag for cross-filesystem safety; it is especially relevant because contributors may develop on case-insensitive macOS while CI or other developers run case-sensitive filesystems.
- **Adopt through default:** rely on NodeNext module resolution's current default for `resolveJsonModule`. `pnpm --dir ts exec tsc --showConfig` confirms it is already effective under the current config, and the workspace has no separate policy reason to foreground JSON imports as a project convention.

## Objective Impact

The `tsconfig` roadmap row moves from in-progress to complete. The Objective now distinguishes three outcomes inside the Eve delta: explicit flags already kept, default-provided behavior intentionally accepted without duplicate config lines, and one explicit flag accepted for a separate implementation follow-up.

No TypeScript tooling was installed or configured under this Objective. The only implementation landing spot created by this decision is a parked follow-up to add `forceConsistentCasingInFileNames: true` outside this decision-only Objective, for example under a focused Objective such as `ts-tsconfig-force-consistent-casing`.

## Follow-Ups

- Continue triage with the linter/formatter decision pair.
- When ready to implement the adopted casing guard, create a focused follow-up Objective or implementation slice for `forceConsistentCasingInFileNames: true` and run the normal TS checks.
- Do not add explicit `useUnknownInCatchVariables` or `resolveJsonModule` lines solely for parity while the current `strict`/NodeNext defaults provide the desired behavior.
