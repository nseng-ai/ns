# Batch 1/2 Executable Stack Complete

## Summary

The first executable stack for `areg-ts-cli-cleanup` completed the remaining Batch 1 mechanical cleanup and the Batch 2 skill-kind/replacement model changes.

Batch 1 changes removed the ignored `cwd`/`env` fields from `AregSkillxWorkspaceCleanupRequest`, updated real/fake gateway implementations and skillx callers, and made fake cleanup operation logs record only the real cleanup invariant (`workspaceRoot`). The same stack removed the identity-only check/init/update/skill-kind path/text state aliases and routed touched imports/exports to the canonical `AregPathState` / `AregTextFileState` pair.

Batch 2 changes replaced global replacement verification with an explicit per-surface replacement contract: areg project inspection now carries `verifiedSurfaces`, tests can configure exact surfaces, specialized replacements are no longer accepted unconditionally, and derived replacements verify only when their expected surface is present. The real gateway populates an areg-visible surface inventory from the backing-skill command file presence without mutating Pi extension runtime behavior.

The stack also unified `areg check` with the typed skill-kind classifier used by `areg skill list/show/apply`. `checkInvokeOnly` and the old check-local replacement wrapper are gone; `areg check` now builds invoke-only/command-backed diagnostics from `inferSkillKindRecord` artifact facts. This intentionally aligns diagnostics with canonical semantics: invoke-only skills are valid without Pi exclusion, command-backed facts require Pi exclusion, and excluded skills require a verified replacement.

## Objective Impact

Batch 1 finding I and the A alias slice are complete. Batch 2 findings C and D are complete. The Objective now has Batch 1 and Batch 2 complete, with Batch 3 mutation robustness, Batch 4 gateway/skill-kind decomposition, and Batch 5 shim/version cleanup still open.

One design note from implementation review is durable: `objective:current` remains absent from the real replacement surface inventory because live Pi extension evidence asserts that command is not registered; `sdl:code:submit` was added because `ts/packages/pi-extensions/src/sdl-extension.ts` registers that surface.

Validation evidence:

- `rg -n "Areg(Check|Init|Update|SkillKind)(PathState|TextFileState)" ts/packages/areg/src ts/packages/areg/test` returned no matches.
- `rg -n "cleanupWorkspace\\(" ts/packages/areg/src ts/packages/areg/test` showed cleanup calls only with `workspaceRoot`, with no `cwd`/`env` cleanup arguments.
- `rg -n "checkInvokeOnly|function verifyPiReplacement\\(skillName: string, inspection: CheckProjectInspection" ts/packages/areg/src/operations/check.ts` returned no matches.
- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run test` passed.
- `pnpm --dir ts exec areg check --path ..` passed. (`--path .` from `pnpm --dir ts` failed as expected because `ts/` is not the areg project root.)
- One TypeScript style review subagent ran after validation; its blocker was fixed by restoring the missing-exclusion diagnostic for command-backed facts, and its inventory concern was resolved by adding `sdl:code:submit` while intentionally leaving absent `objective:current` unverified.

## Follow-Ups

- Continue with Batch 3: decide the rollback-vs-preflight shape for mutation robustness before editing `runInit` or `runSkillKindApply`.
- Batch 4 remains open for project-inspection gateway decomposition and `skill-kind.ts` decomposition.
- Batch 5 remains open for shim rendering safety and version source-of-truth cleanup.
