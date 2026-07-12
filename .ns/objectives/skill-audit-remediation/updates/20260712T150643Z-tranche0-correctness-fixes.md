# Tranche 0 correctness fixes landed

## Summary

All 13 verified correctness bugs from the 2026-07-12 fleet audit
(`references/audit-findings.md`, PR #3467) are fixed on branch
`skill-audit-tranche0-correctness-fixes`, behavior-preserving, in four commits
(mechanical string fixes; contract/doctrine alignment; body rewrites;
trigger-surface text):

1. objective-retro digest/basis writes now use the `objective-retro` brmem
   namespace; the retired `objective-review` namespace remains read-only history.
2. branch-context-impl step 2 reads `data.implementationPromptFile`, the field
   the CLI actually emits.
3. enriched-plan-save step 5 reports the camelCase envelope fields
   (`filePath`/`repoKey`/`sourceBranch`/`branchKey`).
4. code-just-fix categorizes by failing `just` recipe generically instead of the
   stale ruff/ruff-format/ty/pytest taxonomy (allowed-tools untouched — later
   tranche).
5. setup-pypi-publish justfile templates define the `clean` recipe that
   `build: clean` depends on, with a keep-existing-`clean` conditional.
6. dignified-python drops the never-firing Auto-invoke/vs-Others sections and
   replaces the "ALWAYS Loaded" `@`-include fiction with an imperative
   read-first pointer (frontmatter `references:` untouched — later tranche).
7. The objective umbrella's Tracking Gate section now points at objective-next's
   CLI-backed gate (`ns objective exec tracking-gate`) instead of claiming
   evidence collection remains a skill/agent responsibility.
8. python-fake-driven-testing's `references/python-specific.md` drops the pytest
   mechanics the pytest skill owns (839 → 385 lines), keeps fake-driven and
   framework-specific patterns, and delegates pytest mechanics explicitly.
9. cli-push-down's CLI contract defers to the project framework envelope (Clinkr
   here) with `success`/`error` as a labeled no-framework fallback, and its test
   step routes through gateway fakes; skill-audit's push-down one-liner matches.
10. The phantom "publish" workflow is gone from skill-management's
    description/intro and skill-conventions' routing paragraph.
11. architecture-topology-report names the real sibling
    `review-improve-codebase-architecture`.
12. project-setup's intro describes a user-invoked router summoned by name;
    ambient-router claims removed.
13. code-gt-linearize-descendants uses an informed single confirmation: the
    step-4 proposal discloses the submit/force-push consequences and affected
    PRs, step 5's one confirmation covers rewrite + submit, and the mutation
    bullet misfiled in the safety contract is deleted.

User decisions taken during planning:

- **project-setup stays invoke-only** — the ambient-router claims were dropped
  from the body rather than promoting the skill to `normal`. This diverges from
  skill-conventions bucket 6's one-ambient-router mandate by explicit user
  decision; the conventions doc was deliberately not edited.
- **code-gt-linearize-descendants uses an informed single confirmation** — no
  second gate before `gt submit`.

## Objective Impact

Tranche 0 roadmap row is complete: every skill-text-vs-reality bug the audit
verified is repaired against its ground truth (emitting CLI, justfile, install
state, or sibling-skill doctrine). Evidence: full `just` green (507 test files,
5105 tests), `just dprint-check` clean, `areg check` clean, per-item spot greps
clean, `dignified-python`/`project-setup` mirrors still symlinks, project-setup
still `invoke-only` per `areg skill show`.

## Follow-Ups

- Bucket-6 divergence (project-setup invoke-only with no ambient family router)
  stands by user decision; revisit if the family's discoverability suffers.
- code-just-fix frontmatter `allowed-tools` still lists Python-era permissions;
  lands in a later tranche (permission surface).
- dignified-python frontmatter leftovers (`references:` list, empty frontmatter
  block in `dignified-python-core.md`) land in later tranches.
