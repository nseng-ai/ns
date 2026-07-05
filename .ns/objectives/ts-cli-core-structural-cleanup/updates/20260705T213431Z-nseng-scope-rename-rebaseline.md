# Rebaseline After @nseng-ai Scope Rename

## Summary

Trunk-mode refresh at HEAD `141ac24d`. Since the prior refresh (basis `5668ac5`, `@ji`-era), commit `423bcdce4` ("Rename internal package imports to public @nseng-ai names") renamed the live package scope `@ns/*` → `@nseng-ai/*` in code but left this Objective's records still written in the retired `@ns/*` scope. Every structural claim was re-verified forensically against HEAD plus the worktree, and all held at the directory-path level:

- Completed rows verified: `defineCli` at `ts/packages/infra/foundation/src/cli-runtime/index.ts` (consumed by the 10 clinkr `cli.ts` entrypoints); `branch-context/src/brmem-gateway.ts` absent and `BrmemGateway` in use; `runBrmem` sole runner at `capability-kit/src/kit/brmem-cli.ts` with the three candidate names + `readOptionalBrmemBooleanField` + `graphqlErrorsFromJson` grepping to zero; `RealGitBrmemGateway` composing `GitGateway` from `@nseng-ai/capability-kit/git`; `resolveBranchOrCurrent` absent; GitHub PR-feedback leaf helpers shared from `capability-kit/src/github/pr-feedback` with `reviews` importing and no local copies; foundation `package.json` carrying no `"."` export and `src/index.ts` absent (`harness-session.ts` imports from `@nseng-ai/foundation/primitives`); `areg/src/real-gateways.ts` at 6 lines with `src/gateways/` split; Flow `landing-operations.ts` at 308 lines with `graphite-maintenance.ts` and ccc `src/ns/land.ts` re-exporting `@nseng-ai/flow/api`; `nscc` Zod loader with `json-fields.ts` deleted; kernel `extensions/discovery.ts` with `MANIFEST_COMMAND_FIELDS` gone; packagechk `ClaimPolicy`/`ClaimPlan` gone; vibechk `writeDiffArtifact` helpers with `normalizeRunsFormatArgs` deliberately kept.
- Open rows verified still open: retros `sessions/pi-jsonl-source.ts` (multiple `bashExecution` paths), Flow submit (19 modules under `capabilities/flow/src/submit/`), ccc/flow small dedup (`firstNonEmptyLine` canonical at `foundation/src/terminal/text-normalization.ts` with variants persisting), Graphite topology split, ccc cmux slot-dispatch, objectives validator, plan-attachment.

## Objective Impact

`objective.md`, `roadmap.md`, and `orientation.md` were rewritten from scratch to carry the current `@nseng-ai/*` scope (`@ns/core` → `@nseng-ai/foundation`, `@ns/roaster` → `@nseng-ai/reviews`, `@ns/aretro` → `@nseng-ai/retros`, `@ns/slot` → `@nseng-ai/slots`, `@ns/objective` → `@nseng-ai/objectives`, `@ns/handoff` → `@nseng-ai/handoffs`, and the uniform-suffix scope tokens), extend the rename chain to `@sdl/*` → `@ji/*` → `@ns/*` → `@nseng-ai/*`, correct `@internal/pi-tools` to `ts/packages/internal/pi-tools/`, and re-pin the layout note to HEAD `141ac24d`. No scope, boundary, completion criterion, classification, or roadmap-checkbox state changed — this rebaseline is a naming correction; the verified substance was already accurate. The Objective remains open with every neutral structural-cleanup row complete and all open rows capability-owned or design-sensitive.

The standing Open Question is unchanged: whether to formally route/dispose the capability-owned rows and close, or keep this record as the standing home for tactical TypeScript structural-cleanup findings. That is a user decision, so this refresh did not close.

Provenance: objective-refresh basis target=8fdc6f50661d8df81024bbcce3c722fb7411441d from=trunk-HEAD

## Follow-Ups

- Decide (via objective-update/objective-close) whether to route the remaining capability-owned rows to their owning contexts and close this Objective, or keep it open as the standing tactical-cleanup home.
- `references/` and all pre-`@nseng-ai` Semantic Updates use retired `@sdl/*`/`@ji/*`/`@ns/*`/`sdlcc` names — map to current `@nseng-ai/*` homes before acting on them.
- Ten pre-existing missing-heading violations remain in immutable historical `updates/*.md` files (flagged by `ns objective check <slug>`); they are out of scope for this refresh and were not modified.
