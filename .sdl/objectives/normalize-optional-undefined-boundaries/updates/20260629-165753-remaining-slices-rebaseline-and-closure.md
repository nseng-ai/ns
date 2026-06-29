# Remaining Slices Rebaseline and Closure

## Summary

Completed the remaining named optional-undefined boundary slices and final broad rebaseline for the Objective.

Named slice evidence:

- Areg replacement/result/status models: `ts/packages/tools/areg/src` reduced from the planning inventory of 77 optional-undefined matches to 67. The edited operation/result cluster now uses omission-only optional fields for `PiReplacementVerification.surface`, `SkillKindReplacementInfo.surface/evidence/advice`, `ProjectMutationOperationStatusRecord.error`, `SkillKindApplyOperationResult.reason`, and nearby internally assembled mutation/update helper results. Remaining Areg matches are fixture/fake gateway options, CLI/dependency bags, parser/file-state helper inputs, and external gateway compatibility surfaces.
- Kernel command/extension diagnostics: `ts/packages/kernel/src` reduced from the planning inventory of 35 matches to 26. `SdlCommandPath`, `SdlCommandSourceInfo`, `SdlCommandCandidate`, `ExtensionDiscoveryDiagnostic`, and `ExtensionErrorDiagnostic` now omit absent optional fields. Remaining kernel source matches are CLI/context/options/env bags, extension load catalog options, formatter options, and parser/helper inputs.
- Broad sweep follow-up: a read-only broad classification of the remaining `ts/packages` candidates found no additional large Objective-blocking clusters after the named slices. It identified small leftover internal/presentation helpers in slot diagnostics/free/release and worktree-status footer formatting; those were cleaned so diagnostic events and presentation option/result helpers no longer accept explicit undefined where construction already omits absent keys.

Final broad rebaseline:

- Planning raw grep count across `ts/packages`: 1049 matching lines.
- After all remaining-slice edits: 1012 matching lines.
- The remaining candidates are predominantly option/input/override/deps/config bags, external process/GitHub/JSON/env mirrors, public/CLI compatibility surfaces, and test fixture/fake gateway builders.
- Representative preserved groups include `ExecOptions`/env/cwd/signal forwarding, Zod/CLI request schemas, gateway dependency options, fake gateway setup bags, external GitHub/process payload mirrors, parser intermediate states with required `T | undefined` fields, and cautious `null`/omission compatibility surfaces.

## Objective Impact

This completes the open roadmap rows:

- The remaining named small diagnostics/result-model areas are cleaned or classified: packagechk and PR check-count were already complete; this update finishes Areg and kernel, and cleans the small slot/worktree-status findings discovered during broad rebaseline.
- The final candidate inventory has been rebaselined with before/after counts and preserved/deferred rationale.
- Completion criteria are satisfied: the cleaned result/presentation/status/state clusters no longer accept explicit `undefined` for omission-only fields, and the remaining candidates are compatibility/input/test/external/deferred cases rather than known inappropriate internal-boundary leaks.

## Validation

```bash
pnpm --dir ts --filter @sdl/areg run check
pnpm --dir ts --filter @sdl/areg run test
pnpm --dir ts --filter @sdl/kernel run check
pnpm --dir ts --filter @sdl/kernel run test
pnpm --dir ts --filter @sdl/slot run check
pnpm --dir ts --filter @sdl/slot run test
pnpm --dir ts --filter @sdl/worktree-status run check
pnpm --dir ts --filter @sdl/worktree-status run test
just ts-format-check
just ts-lint
```

All passed.

## Closure

The Objective is ready to close. No checked-in allowlist, hard validation ban, or schema registry was added. Future optional-undefined cleanup should use the advisory guidance and semantic classification rather than reopening this Objective for mechanical count reduction.

## Follow-Ups

No parked Objective-blocking work remains. Future cleanup should happen only when a local semantic leak is found during ordinary implementation or design review.
