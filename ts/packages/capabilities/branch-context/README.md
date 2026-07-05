# @nseng-ai/branch-context

`@nseng-ai/branch-context` owns the ns `branch-context` command group and prompt-loading behavior for attaching and implementing branch-scoped plans. It does not expose a standalone `branch-context` package binary; use `ns branch-context ...`.

## Plan contract trial rollback

The branch-context plan contract protocol is currently a trial-shaped prompt-policy change, not a persisted data-format migration. Its rollback path is intentionally a single revert of PR #1477, or of the final merged commit(s) for `branch-context-plan-contract-prototype`; do not rely on local checkpoint hashes because submit flows may rewrite them.

No data migration, compatibility shim, Branch Memory mutation, runtime feature flag, or long-lived configuration switch is required to roll back the trial. Until the trial is accepted, avoid landing dependent work that assumes the contract sections are permanent.

If manually reverting instead of using a PR/commit revert, remove the prototype-owned prompt sections and test assertions from:

- `.ns/prompts/plans-write.md`
- `skills/enriched-plan-save/SKILL.md`
- `skills/branch-context-impl/SKILL.md`
- `skills/branch-context/SKILL.md`
- `ts/packages/capabilities/branch-context/src/core/prompts/branch-context-impl.md`
- `ts/packages/capabilities/branch-context/test/attached-plan.test.ts`

After rollback, rerun the same prompt and branch-context checks that covered the prototype.
