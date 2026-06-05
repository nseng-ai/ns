# Public Skills and Docs Accuracy Pass Completed

## Summary

The public planned-branch skills and docs accuracy pass is complete. The portable CLI contract now stays explicit: omitting `--branch-creation` means the `planned-branch` CLI default, `plain-git`; Graphite creation requires `--branch-creation graphite` unless a wrapper such as this repo's Pi adapter explicitly owns a different default.

## Objective Impact

This completes the final roadmap row, "Public skills and docs accuracy pass." The pass preserves user-visible planned-branch behavior while correcting stale or over-specific public wording:

- `planned-branch-create` now distinguishes the portable CLI default from wrapper/project defaults and tells agents to pass `--branch-creation graphite` only when Graphite stack tracking is explicitly required;
- `planned-branch-write-plan`, `planned-branch-create`, and `planned-branch-impl` frontmatter now uses harness-neutral agent wording instead of Claude Code-specific triggers;
- `docs/pi/planned-branch-workflow.md` now names Pi commands and installed agent skills as workflow surfaces over the same CLI contract, states the portable CLI default directly, and records the repo-local Pi Graphite default as wrapper-owned behavior;
- user-facing planned-branch docs now emphasize observable commands, storage contracts, recovery paths, and related public surfaces instead of detailed TypeScript implementation file maps;
- `docs/pi/README.md` and `docs/agent-resource-catalog.md` now refer to installed agent skills where the planned-branch surface is portable beyond one harness.

Evidence considered: local working-tree diff on `graphite-gateway-planned-branch-create` after PR #898 was submitted, with Graphite parent `planned-branch-brmem-semantic-gateway`. The current uncommitted diff is limited to public planned-branch skills/docs plus this Objective update, with no Objective slug-directory moves. PR evidence was not required for this docs/skills slice before branch creation; PR #898 remains relevant only as the downstack Graphite gateway slice evidence.

Verification: `just dprint-check`, `git diff --check`, `just`, and `just ts-test` passed.

## Follow-Ups

No active non-parked roadmap work remains. Consider Objective closure after this docs/skills slice is committed/submitted or when the team is ready to record the completed outcome. Parked preview-command and file-splitting ideas remain optional future work, not blockers for this Objective.
