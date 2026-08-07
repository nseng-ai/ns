# Handoff: Refine Clinkr command-definition type composition

Continuation focus: Address review feedback that the new command-definition types around `ts/packages/public/infra/clinkr/src/app/command-definition.ts:180` encode a combinatorial explosion; investigate and propose or implement a more elegant composition while preserving the renderer-enforcement contract.

## Context

Branch `clinkr-app-require-renderer-enforcement` implements the attached plan to require `renderHuman` whenever modern Clinkr `/app` commands declare `resultSchema`, forbid renderers on bodyless commands, reject invalid filesystem-loaded modules, and remove the `/app` pretty-JSON fallback. The working tree is uncommitted.

## Current State

The implementation and synchronized tests/docs are complete and passing. The main type change currently models data-bearing vs bodyless definitions, context-free vs contextful axes, separate input helper unions for `defineCommand` inference, and an explicit four-arm `ClinkrCommandDefinition` union. Review feedback specifically questions this composition as a combinatorial type explosion.

Validation already passed after the current edits:

- `just`: 587 test files and 6,327 tests passed, plus format, lint, typecheck, dependency, sanity, dprint, and Objective checks.
- `just ts-test-typescript-style-guard`: 184 tests passed.
- Focused Clinkr, Gitplane, and SDK suites passed.

No commit, push, submit, or publish occurred.

## Decisions / Findings

- Required contract: data-bearing arm has required `resultSchema` and `renderHuman`, optional `renderMarkdown`; bodyless arm has `resultSchema?: never`, `renderHuman?: never`, and `renderMarkdown?: never`.
- Keep exactly two public `defineCommand` overloads: context-free and contextful. Do not replace them with four overloads or conditional mapped types with poor diagnostics.
- Bodyless `defineCommand({ schema, handler: async () => ok() })` inference must remain intact.
- Renderer input must narrow to the declared result schema output.
- Dynamically loaded filesystem modules need the runtime coupling gate regardless of the static type design.
- The current SDK adapter returns its already-typed definition directly rather than re-running it through `defineCommand`; this was needed to avoid ambiguous inference with the broader union overload and is relevant evidence when simplifying the model.
- `/legacy` and old `src/group.ts` fallback behavior remain out of scope.

## Next Steps

1. Inspect the current type block and the review anchor near line 180; characterize which duplicate aliases/unions exist only for inference versus public representation.
2. Explore a smaller composition that separates shared command fields, result/rendering policy, and context axis without enumerating all combinations. Preserve the two overloads and readable diagnostics.
3. Use existing compile-only cases in `test/type/command-definition-types.ts` as acceptance tests before changing runtime code.
4. Re-run `pnpm --dir ts exec tsc --noEmit --pretty false`, focused Clinkr/SDK tests, `just ts-test-typescript-style-guard`, and `just`.
5. Compare changed files against the attached plan scope and keep the tree uncommitted unless explicitly directed otherwise.

## Investigation Sources

- Source session ID: 019fd991-9f39-7bb6-a676-720413b24fcf
- Source session log: /Users/schrockn/.pi/agent/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-04--/2026-08-07T00-13-47-193Z_019fd991-9f39-7bb6-a676-720413b24fcf.jsonl
- Related files:
  - `/var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-yC4Bh7/9b5509f6-cdcf-4c5a-aaf6-6de49a943531.jsonl` — child session that migrated Clinkr tests and fixtures to explicit renderers.
  - `ts/packages/public/infra/clinkr/src/app/command-definition.ts` — review target and current type composition.
  - `ts/packages/public/infra/clinkr/test/type/command-definition-types.ts` — compile-time acceptance coverage for renderer coupling and bodyless inference.
  - `ts/packages/public/infra/clinkr/src/app/selected-command.ts` — runtime filesystem coupling enforcement that must remain aligned with the types.
  - `ts/packages/public/sdk/src/sdk/clinkr-command-adapter.ts` — downstream generic adapter affected by overload inference.
  - `.ns/objectives/clinkr-readme-driven-development/references/README-draft.md` — synchronized public contract prose and examples.

## Useful Commands / Files

- Inspect changes: `git diff -- ts/packages/public/infra/clinkr/src/app/command-definition.ts ts/packages/public/infra/clinkr/test/type/command-definition-types.ts ts/packages/public/sdk/src/sdk/clinkr-command-adapter.ts`
- Check current tree: `git status --short`
- Typecheck: `pnpm --dir ts exec tsc --noEmit --pretty false`
- Focused Clinkr suite: `pnpm --dir ts --filter @nseng-ai/clinkr test`
- Style guard: `just ts-test-typescript-style-guard`
- Full validation: `just`
- Attached implementation plan key: `clinkr-app-require-renderer-enforcement.md` in Branch Memory namespace `branch-context` on this branch.
