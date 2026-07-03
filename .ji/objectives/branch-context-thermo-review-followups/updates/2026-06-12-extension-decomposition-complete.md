# Extension Decomposition Slice Complete

## Summary

Completed the `thermo-followups/extension-decomposition` slice. The Pi branch-context extension is now a thin registrar over command-family modules: host/runtime types, enriched-plan save commands and tool handling, and branch-context from-plan/impl/upstack command handling. The `.pi/extensions/branch-context.ts` adapter remains default-export compatible.

The status sequencing regression was fixed by separating saved-plan resolution from branch slug derivation so progress labels bracket the work they describe. Preview data no longer carries namespace/key constants as instance fields; formatters read canonical constants, and preview target-branch handling carries explicit-branch intent instead of inferring it from target/slug equality.

Plans-domain saved-plan content slugging and saved-plan file/primitive tests moved into `@asdl/plans`. The former monolithic branch-context extension command test was split by command family, and the helper test was reduced to local helper coverage while duplicate branch-context evidence formatting coverage was dropped.

## Objective Impact

The fourth roadmap branch is complete. This satisfies the Objective criteria for decomposing `branch-context-extension.ts`, splitting the command-family tests, moving stranded `@asdl/plans` primitive coverage to its canonical package, and restoring intended status sequencing behavior.

Validation evidence: `pnpm --dir ts run check && pnpm --dir ts run test` passed. Size evidence: the registrar is 51 lines, new command modules are 128/489/708/29 lines, split command tests are 220/190/596/538 lines, and the helper test is 212 lines.

## Follow-Ups

All planned roadmap branches are now implemented and validated. Next action is parent inspection of the full stack and, if the Objective closure gate is clear after final review, close the Objective or otherwise record any residual follow-ups before PR submission. PR submission remains manual.
