# ts/packages/plans -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 3 confirmed finding(s) (1 high, 2 medium, 0 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/plans/src

1. **Duplicated Code** (high) -- `ts/packages/plans/src/saved-plan-file.ts:182-246`
   - Roast: resolvePlanStoreDirectory is just resolvePlanStoreRepoDirectory's body pasted in again with three extra lines bolted on, so the repo-root/repo-identity/repo-key dance now has two places to go stale together.
   - Evidence: Both functions independently run the identical sequence `const git = options.git ?? new RealGitGateway(pi); ... resolveRequiredGitRepoRoot(...); ... resolveRepoIdentity(...); const repoKey = buildRepoPlanStoreKey(...); const planStoreRoot = resolvePrimaryPlanStoreRoot(options); const repoDirectoryPath = join(planStoreRoot, repoKey);` before resolvePlanStoreDirectory tacks on sourceBranch/branchKey/directoryPath.
   - Smallest fix: Have resolvePlanStoreDirectory call resolvePlanStoreRepoDirectory once and layer sourceBranch/branchKey/directoryPath on top of its result, instead of recomputing repo root and repo identity from scratch (also avoids the redundant extra git calls this causes today).

2. **Duplicated Code** (medium) -- `ts/packages/plans/src/cli.ts:158-168`
   - Roast: Three separate handlers hand-roll the exact same `{cwd, git, planStoreGateway, ...planStoreRoot}` literal from ctx, so every new plan-store option means three synchronized edits in the same file.
   - Evidence: handleList builds `{ cwd: ctx.cwd, git: ctx.git, planStoreGateway: ctx.planStoreGateway, ...(planStoreRoot === undefined ? {} : { planStoreRoot }) }` (158-168), handleSave builds the identical shape for writeSavedPlanFile (214-219), and resolvePlanEvidence builds it again for findLatestSavedPlanFile (284-289).
   - Smallest fix: Add a small `planStoreOptions(ctx, overrideRoot?)` helper on PlansCliContext that returns the PlanStoreOptions object once, and call it from all three handlers.

3. **Shotgun Surgery** (medium) -- `ts/packages/plans/src/content-slug-derivation.ts:6`
   - Roast: The '3-7 words' slug policy is encoded three independent times -- a prompt string, a magic-number slicer, and a separate validator regex in another file -- with nothing forcing them to agree.
   - Evidence: content-slug-derivation.ts has `const MAX_PLAN_SLUG_WORDS = 7;` (used to slice model output at line 103) and the prompt text `"- Use 3–7 words."` (line 67), while plan-persistence.ts independently enforces `if (tokens.length > 7) return "Slug must contain at most 7 words.";` (lines 47-49) and a separate `tokens.length < 3` minimum check.
   - Smallest fix: Export one shared MIN/MAX_PLAN_SLUG_WORDS constant pair from plan-persistence.ts (or a small slug-policy module) and have both the prompt text and validatePlanSlug read from it.
