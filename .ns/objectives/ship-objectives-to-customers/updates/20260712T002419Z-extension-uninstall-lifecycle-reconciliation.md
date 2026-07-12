# Identity-matched extension uninstall lifecycle implemented

## Summary

Implemented `ns extension uninstall <source>` as the second customer-facing extension lifecycle verb. Uninstall matches npm declarations by canonical package name regardless of version text and local declarations by normalized absolute path. The formatting-preserving project-config planner removes exactly one matching string token, rejects ambiguous duplicate identities, retains a valid `extensions = []`, and leaves unrelated TOML bytes, comments, quoting, and line endings intact.

The lifecycle fully preflights the prospective declaration set, then applies descriptor-driven activation before package cleanup. This regenerates instructions, preserves consumer directories, and lets the existing manifest authority remove only unchanged extension-owned harness artifacts with `removed-source`; edited and untracked files are preserved. Local extension source directories are never removed. An absent declaration remains a successful recovery invocation that reruns activation and, for npm targets, cleans matching orphaned managed bytes.

Managed npm cleanup is a semantic kernel gateway operation over internally derived package identity. It refuses symlink/non-directory traversal, removes only the package-specific managed project, preserves sibling packages and the shared npm root, and prunes only empty scoped-package ancestors below that root. Cleanup occurs after successful activation; a cleanup failure reports completed activation evidence so the exact command can be rerun to converge.

The command is lazily contributed by `@nseng-ai/ns-init` beside `install`, with a typed Clinkr result/schema and no top-level command, `remove` alias, confirmation prompt, `--yes`, `--force`, or `--harness`. One implementation-time contract correction made explicit empty extension arrays valid in the shared `ns.toml` extension setting while continuing to reject empty source strings.

## Objective Impact

- The activation lifecycle roadmap row remains `[~]`, but install and uninstall reconciliation are now delivered. Single-target update reconciliation remains before that row can complete.
- The broad `ns extension` acquisition-verbs row remains `[~]`. Its remaining verbs are single-target `update` and `list`, plus migration of the old top-level update extension mode.
- The Objective-owned README draft now records absent-target orphan cleanup, activation-before-deletion ordering, exact-rerun recovery, bounded npm pruning, and preservation of local sources, edited/untracked artifacts, and consumer data.
- No Objective completion criterion is newly complete. Bare-core republish, remaining verbs, docs-site finalization, and customer onboarding verification remain open.

Validation passed focused kernel, harness-artifacts, ns-init, and published-host checks/tests; real filesystem and host integration coverage; TypeScript format/lint/tsgo checks; the TypeScript style guard; dprint; dependency checks; the full default test suite; and the repository-wide Objective edge sweep through `just`.

## Follow-Ups

- Implement single-target `ns extension update` with the same prepare/apply/reconcile discipline, then implement `ns extension list` and migrate the old top-level update extension mode.
- Unbundle first-party extensions, republish the bare core, and run the registry-backed foreign-repository smoke through `ns extension install npm:@nseng-ai/objectives`.
- Reconcile the public docs-site happy path and perform the zero-improvisation Claude Code onboarding verification after republish.
