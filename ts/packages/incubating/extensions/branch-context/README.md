# @nseng-ai/branch-context

`@nseng-ai/branch-context` owns the harness-independent ns `branch-context` command group and prompt-loading behavior for attaching and implementing branch-scoped plans. It does not expose a standalone `branch-context` package binary; use `ns branch-context ...`.

Pi registration and presentation live in the separate `@nseng-ai/pi-ns-branch-context` host adapter, which consumes portable behavior through `@nseng-ai/branch-context/api` and `@nseng-ai/plans/api`. This package contains no Pi subpackage or Pi Runtime dependency.

## Plan contract trial rollback

The branch-context plan contract protocol is currently a trial-shaped prompt-policy change, not a persisted data-format migration. Its rollback path is intentionally a single revert of PR #1477, or of the final merged commit(s) for `branch-context-plan-contract-prototype`; do not rely on local checkpoint hashes because submit flows may rewrite them.

No data migration, compatibility shim, Branch Memory mutation, runtime feature flag, or long-lived configuration switch is required to roll back the trial. Until the trial is accepted, avoid landing dependent work that assumes the contract sections are permanent.

If manually reverting instead of using a PR/commit revert, remove the prototype-owned prompt sections and test assertions from:

- `.ns/prompts/branch-context.plans-write.md`
- `skills/incubating/branch-context/enriched-plan-save/SKILL.md`
- `skills/incubating/branch-context/branch-context-impl/SKILL.md`
- `skills/incubating/branch-context/branch-context/SKILL.md`
- `ts/packages/incubating/extensions/branch-context/src/core/prompts/branch-context-impl.md`
- `ts/packages/incubating/extensions/branch-context/test/attached-plan.test.ts`

After rollback, rerun the same prompt and branch-context checks that covered the prototype.
