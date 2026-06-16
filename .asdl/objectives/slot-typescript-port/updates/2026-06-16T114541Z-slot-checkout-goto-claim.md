# Semantic Update: slot checkout/goto/claim TypeScript port

Implemented the allocation/movement slice in `ts/packages/slot`:

- Registered `slot checkout`, alias `slot co`, `slot goto`, and `slot claim` in the TypeScript CLI.
- Ported checkout planning and `checkout --current` redirect planning, including reuse, main-worktree, branch-in-use, assign-to-slot, and pool-full plans.
- Added movement lifecycle support for branch creation, checkout, current-worktree redirects, source-slot detach, and main-worktree claim/trunk behavior.
- Expanded the real and fake slot git gateways with current/previous branch lookup, local branch listing/existence, branch creation, checkout, detach, and structured git command failures.
- Preserved result envelopes for checkout/goto/claim, including `cd_command`, clipboard fields, claim source/replacement fields, and parent-shell cd-directive suppression in machine modes.
- Added selector and navigation helpers shared by the new operations.

Preserved contracts / evidence:

- Command flags and arguments: `checkout [BRANCH_NAME] [BASE] -b/--new --current --no-clipboard`, alias `co`, `goto -n/--num -w/--wt --no-clipboard`, and `claim BRANCH_NAME`.
- Stable error/result coverage in scenario/unit tests includes branch-missing, base-without-new, branch-in-use, dirty source refusal, trunk-in-main refusal, negative unassigned goto, current checkout redirects, source detach ordering, new branch creation, JSON envelopes, and operation-state rows.
- Real git smoke coverage exercises local branch presence/listing, branch creation, current/previous branch lookup, checkout, and detach in a throwaway repository.
- Real worktree occupancy detection now inspects each worktree's git admin directory for `rebase-merge`, `rebase-apply`, and `BISECT_LOG` so rebase/bisect operations surface as operation occupancies instead of plain checked-out rows.

Validation performed:

```bash
pnpm --dir ts/packages/slot run test
pnpm --dir ts/packages/slot run check
pnpm --dir ts run check
pnpm --dir ts run test
just dprint-check
```

Follow-up:

- Dynamic branch-name shell completion remains deferred to the later shell/completion slice because current TypeScript Clinkr does not expose a clean command-argument completion hook without framework work.
