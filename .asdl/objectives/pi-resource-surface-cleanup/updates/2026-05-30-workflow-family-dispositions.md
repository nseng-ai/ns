# Workflow Family Dispositions

## Summary

Categorized the remaining repo-owned workflow command families and created follow-up Objective `directed-handoff-artifacts` for the handoff/pickup UX rework.

Dispositions:

- Planned branches: retain `/write-plan`, `/create-planned-branch`, and `/impl-planned-branch` as the public Pi planning-layer sequence. The portable contract is the documented local saved-plan store plus Branch Memory `brmem-plans` attachment contract in `docs/pi/planned-branch-workflow.md`; no dedicated Codex/Claude shortcut is claimed in this slice.
- Handoff/pickup artifacts: carve out the existing `/brmem-handoff` and `/brmem-pickup-handoff` flow to follow-up Objective `directed-handoff-artifacts`. The target UX is a directed saved handoff artifact that users save and load without needing to understand Branch Memory namespaces, keys, refs, or commits. The current `brmem`-named commands remain the factual present-state implementation until that Objective replaces, deprecates, or explicitly retains them.
- Branch retrospectives: retain `/skill:branch-retro` as the human-facing retrospective workflow. `aretro exec collect-evidence` remains the deterministic evidence-collection command behind the skill, not a replacement public name.

Updated `docs/pi/README.md` and `docs/agent-resource-catalog.md` with these dispositions. Updated the Objective assumptions/open questions and roadmap to reflect that the `branch-retro` naming question is resolved and that directed handoff artifact work now has its own Objective.

Fresh Pi RPC `get_commands` evidence after this documentation slice reports 71 visible commands and 17 project extension commands. It includes `/write-plan`, `/create-planned-branch`, `/impl-planned-branch`, `/brmem-handoff`, `/brmem-pickup-handoff`, `/skill:branch-retro`, and the `/dev:*` command family. It reports no duplicate command names and no legacy `/cp`, `/newbr`, `/submit`, `/gh:land`, `/gt:land-stack`, `/land`, `/land-stack`, `/worktree-status`, `/brmem-status`, or `/gt-status` commands.

Fresh skill/instruction evidence confirms `branch-retro`, `brmem-handoff`, and `brmem-pickup-handoff` exist in `skills/` and are installed through `.agents/skills/` and `.claude/skills/`; `AGENTS.md` and `CLAUDE.md` remain present.

## Objective Impact

The remaining workflow-family categorization row is complete. The Objective now has explicit dispositions for planned-branch commands, handoff/pickup artifacts, and branch retrospective / `aretro` surfaces before closure. The handoff disposition is not final retention of the `brmem`-named UX; it is an intentional follow-up boundary captured by `directed-handoff-artifacts`.

The key naming decision is that `branch-retro` remains named for the user-facing retrospective task. The `aretro` CLI remains an evidence boundary that the skill invokes, which avoids renaming a human workflow after its implementation helper.

No TypeScript behavior changed in this slice, so command-surface tests were not rerun. Docs-only validation passed with `just dprint-check` and `git diff --check`.

## Follow-Ups

- Implement the directed save/load handoff artifact workflow under Objective `directed-handoff-artifacts`.
- If no new non-parked work appears in this broader resource-surface Objective, it appears ready for `objective-close` confirmation with the handoff artifact rework carried as a separate active Objective.
