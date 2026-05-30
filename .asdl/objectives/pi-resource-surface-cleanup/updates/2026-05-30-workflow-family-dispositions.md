# Workflow Family Dispositions

## Summary

Categorized the remaining repo-owned workflow command families without introducing new command names or legacy aliases.

Dispositions:

- Planned branches: retain `/write-plan`, `/create-planned-branch`, and `/impl-planned-branch` as the public Pi planning-layer sequence. The portable contract is the documented local saved-plan store plus Branch Memory `brmem-plans` attachment contract in `docs/pi/planned-branch-workflow.md`; no dedicated Codex/Claude shortcut is claimed in this slice.
- Branch Memory handoffs: retain `/brmem-handoff` and `/brmem-pickup-handoff` as Pi frontends over the repo-owned `brmem-handoff` and `brmem-pickup-handoff` skills. Codex and Claude use the installed skills directly, and all harness paths share the `session-artifacts` / `handoffs/<slug>.md` Branch Memory contract.
- Branch retrospectives: retain `/skill:branch-retro` as the human-facing retrospective workflow. `aretro exec collect-evidence` remains the deterministic evidence-collection command behind the skill, not a replacement public name.

Updated `docs/pi/README.md` and `docs/agent-resource-catalog.md` with these dispositions. Updated the Objective assumptions/open questions and roadmap to reflect that the `branch-retro` naming question is resolved.

Fresh Pi RPC `get_commands` evidence after this documentation slice reports 71 visible commands and 17 project extension commands. It includes `/write-plan`, `/create-planned-branch`, `/impl-planned-branch`, `/brmem-handoff`, `/brmem-pickup-handoff`, `/skill:branch-retro`, and the `/dev:*` command family. It reports no duplicate command names and no legacy `/cp`, `/newbr`, `/submit`, `/gh:land`, `/gt:land-stack`, `/land`, `/land-stack`, `/worktree-status`, `/brmem-status`, or `/gt-status` commands.

Fresh skill/instruction evidence confirms `branch-retro`, `brmem-handoff`, and `brmem-pickup-handoff` exist in `skills/` and are installed through `.agents/skills/` and `.claude/skills/`; `AGENTS.md` and `CLAUDE.md` remain present.

## Objective Impact

The remaining workflow-family categorization row is complete. The Objective now has explicit dispositions for planned-branch commands, Branch Memory handoff commands, and branch retrospective / `aretro` surfaces before closure.

The key naming decision is that `branch-retro` remains named for the user-facing retrospective task. The `aretro` CLI remains an evidence boundary that the skill invokes, which avoids renaming a human workflow after its implementation helper.

No TypeScript behavior changed in this slice, so command-surface tests were not rerun. Docs-only validation passed with `just dprint-check` and `git diff --check`.

## Follow-Ups

- If no new non-parked work appears, the Objective appears ready for `objective-close` confirmation.
