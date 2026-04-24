---
name: dev-vibechk-branch-eval
description: "Operate the vibechk A/B branch eval workflow: spawn ImprovedContextBranch off the parent of the current Impl branch, copy notes forward via brmem, and apply impl-session-notes suggestions as commits. Pairs with the post-hooks on brmem-branch-create and brmem-branch-impl. UNDER CONSTRUCTION — see parent plan."
allowed-tools: []
metadata:
  internal: true
---

# dev-vibechk-branch-eval

`vibechk` is an opt-in plugin that captures per-session learning into `brmem` and turns git branching into the eval substrate. Two post-hooks on `brmem-branch-create` and `brmem-branch-impl` stash plan-session and impl-session notes alongside lightweight telemetry; this skill drives the A/B "ImprovedContextBranch" workflow that consumes those notes and applies session-driven suggestions as commits.

## Status

**Under construction.** This skill ships in three slices (see `docs/plans/2026-04-24-002-feat-vibechk-plugin-plan.md` and the slice plan at `plan-add-vibechk-create-side-hook.md`):

- Slice 1 (this commit): scaffold + create-side default-prompt.
- Slice 2: impl-side default-prompt + `extract_session_metrics.py` helper.
- Slice 3: full A/B eval workflow lands here.

Until Slice 3 lands, do not invoke this skill directly — it has no workflow. The skill directory exists so the post-hooks have a registered home, and so the create-side default-prompt has a canonical source path next to its eventual sibling files.
