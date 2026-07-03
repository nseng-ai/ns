# Plan Branch Skills Renamed

## Summary

The skill/prompt migration slice renamed the Branch Memory plan-branch helper
skills and prompt assets to the public canonical names:

- `brmem-create-plan-branch-from-file`
- `brmem-plan-impl`
- `.brmem/prompts/create-brmem-plan-branch.md`

The create skill now describes the canonical temp-file review flow that invokes
`create_brmem_plan_branch_from_file`, and the impl skill now discovers plans only
from Branch Memory namespace `brmem-plans` with key `<slug>.md` on the current
implementation branch.

Verification passed:

- stale old-name search over first-party skill, prompt, config, lockfile, and
  README paths returned no hits
- symlink and prompt layout checks passed
- `brmem exec resolve-prompt create-brmem-plan-branch --format json` resolved the
  repo-local prompt
- `just dprint-check`
- `git diff --check`

Full `just` was intentionally not run for this Markdown, lockfile, prompt, and
symlink-focused slice.

## Objective Impact

This completes the roadmap rows for renaming the plan-branch skills and prompt
policy assets. The renamed skills are public-facing rather than internal-only:
the `metadata.internal: true` frontmatter was removed, descriptions were made
user-facing, and the old helper names are no longer installed through the repo's
skill symlink layout.

The broader legacy cleanup row remains open for any remaining command/tool/docs
cleanup outside this focused skill and prompt migration.

## Follow-Ups

- Complete the broader legacy cleanup/docs slice for remaining old command/tool
  names outside the skill and prompt paths.
- Prepare the stack for review after the cleanup slice and final validation.
