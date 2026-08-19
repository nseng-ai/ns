# ADR 0060: Safe Computed-Target Local Maintenance

## Status

Accepted

Refines ADR 0014 only where that decision classified every bulk or computed-target operation as Tier 3. ADR 0014's other danger-tier, authorization, interaction, and output rules remain accepted.

## Context

ADR 0014 used a computed target set as a Tier 3 signal because users cannot review each target directly at invocation time. That rule is too broad for bounded local maintenance where the command derives only owned targets and independently enforces a non-destructive transition for each target.

`ns slot ff-detached` is the motivating case. It derives managed Slot worktrees from the repository's Slot Pool and fast-forwards only clean detached worktrees to the configured local trunk. It does not fetch, update branches, attach worktrees, create merge commits, reset, rebase, force checkout, or discard changes. Attached, dirty, divergent, and operation-bearing Slots remain unchanged. The command reports its complete plan before mutation and supports `--dry-run`.

Requiring `--force` for this routine maintenance would conflate authorization with its existing safety-precondition meaning. In this command, `--force` relaxes the block-all precondition for a Git operation in progress: the command skips operation-bearing Slots and processes the remaining safe Slots.

## Decision

A computed target set alone does not make a command Tier 3. A human-facing command may run without confirmation as **Tier 1 safe computed-target local maintenance** only when all of these conditions hold:

- The command mutates only repository-local state that the current project owns.
- The command derives a bounded target set from a canonical owned inventory.
- Each target transition is independently guarded and non-destructive.
- The command does not discard user work, rewrite branches, mutate remote state, or mutate user-environment state.
- A blocked or ineligible target remains unchanged.
- The command presents the computed plan before mutation in human mode.
- The command provides a successful `--dry-run` that returns the same planned target outcomes without mutation.
- The command reports the final outcome for each target and returns non-success for unexpected mutation failures.

If any condition does not hold, classify the command through ADR 0014 without this exception. Bulk size, irreversibility, destructive behavior, external effects, or hard-to-review transitions remain Tier 3 signals.

`ns slot ff-detached` satisfies this exception and does not require `--yes` or `--force` for its normal fast-forward operation. Its `--force` flag remains a safety-precondition override that skips operation-bearing Slots; it is not confirmation for the computed target set.

## Consequences

- Safe local maintenance stays suitable for routine human and agent workflows.
- Command authors must prove every exception condition; “idempotent,” “local,” or “fast-forward” alone is not sufficient.
- The canonical owned inventory is part of the safety boundary.
- The exception does not authorize destructive bulk cleanup, branch rewrites, remote writes, or user-environment changes.
- Danger tiers remain authoring discipline rather than Clinkr framework metadata.

## Alternatives

- **Require `--force` for every computed target set:** rejected because it conflates target computation with high risk and weakens the meaning of a precondition override.
- **Use `--yes` for routine safe maintenance:** rejected because the operation is neither destructive nor an external write.
- **Create a general idempotent-operation exception:** rejected because idempotence does not prevent destructive, external, or wrongly targeted mutation.
