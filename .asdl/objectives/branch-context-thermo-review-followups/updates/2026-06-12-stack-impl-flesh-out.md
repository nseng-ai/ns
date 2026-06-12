# Fleshed Out for One-Stack Implementation via objective-stack-impl

## Summary

Restructured the roadmap from twelve finding-ordered rows into four branch-aligned slices (`thermo-followups/vocabulary-and-docs`, `package-cleanup`, `canonical-contracts`, `extension-decomposition`), each with one reviewable thesis, exact file/line targets, constraints, and per-slice validation commands — detailed enough for self-contained runner-subagent prompts. Resolved both creation-time open questions with code evidence:

- **Impl-command home**: a new `ts/packages/branch-context/src/impl-command.ts` (not `constants.ts`, which stays a pure constants file). The formatter imports `BRANCH_CONTEXT_PLAN_KEY` for the elision rule; ccc and pi-extensions both consume it, collapsing the duplicate `/branch-context:impl` literal.
- **Dry-run details fields**: unconsumed programmatically. `extractBranchContextEvidence` (`session-artifact.ts:43`) parses only the `status: "success"` + `evidence` variant via `successfulBranchContextOutputDetailsSchema`; no other consumer of `BRANCH_CONTEXT_OUTPUT_MESSAGE_TYPE` details exists outside tests. The typed contract keeps a dry-run variant only where fields add information beyond the content string.

Also pinned the barrel-trim target with a verified import inventory: ~26 symbols imported from `@asdl/branch-context` across ccc/pi-extensions (multi-line-aware extraction), and `runCli` needs no export since the package bin points directly at `src/cli.ts`.

## Objective Impact

- Roadmap is now executable as one Graphite stack of four branches on top of `branch-context-key-plumbing/structural-cleanups`; row order is the dependency order.
- `## Open Questions` reduced to none blocking; the one remaining judgment call (splitting `package-cleanup` into src/test halves if pinned-message churn is heavy) is recorded as execution detail, not a blocker.
- New assumption recorded: the enumerated barrel surface must be re-verified by re-running the import inventory immediately before trimming.

## Follow-Ups

- Run `objective-stack-impl` with slug `branch-context-thermo-review-followups` to execute the four slices.
- During slice 1, confirm whether SKILL.md content edits require a `skills-lock.json` refresh through the skill-management flow.
