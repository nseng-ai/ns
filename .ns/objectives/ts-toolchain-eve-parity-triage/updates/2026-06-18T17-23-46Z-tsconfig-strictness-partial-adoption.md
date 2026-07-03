# TSConfig Strictness Partial Adoption

## Summary

Current `master` already contains a partial adoption of the Eve `tsconfig` strictness delta. Evidence: `ts/tsconfig.json` now includes `moduleDetection: "force"`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, and `noUncheckedSideEffectImports`; commit `3756a8ccb` added the six strictness options after this Objective was created.

## Objective Impact

The `tsconfig` strictness row is now in progress rather than wholly unstarted. The Objective still needs its intended triage decision record: the landed flags need explicit adopt-now rationale, and `useUnknownInCatchVariables`, `forceConsistentCasingInFileNames`, and `resolveJsonModule` still need explicit verdicts.

This update records implementation-before-decision drift as a risk so future work does not mistake landed compiler settings for completion of the triage deliverable.

## Follow-Ups

- Record adopt/defer/reject verdicts for all nine `tsconfig` strictness flags, including rationale for the six already landed.
- Decide whether the remaining flags should be explicit compiler options, left to TypeScript defaults, deferred, or rejected for `ts/`.
- If the final verdict leaves the current `tsconfig.json` unchanged, record that as completion evidence rather than creating implementation work.
