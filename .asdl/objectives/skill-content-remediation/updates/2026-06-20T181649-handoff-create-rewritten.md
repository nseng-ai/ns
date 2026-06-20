# handoff-create rewrite completed

## Summary

Rewrote `skills/handoff-create/SKILL.md` as the next cheap high-value per-skill remediation target. The rewrite preserves the create-flow behavior while collapsing the central duplication: the full handoff artifact template is now stated once, and the storage section keeps one canonical `brmem put <semantic-slug>.md --namespace handoff --branch <branch> --file /dev/stdin` command with a placeholder for final artifact content instead of reprinting the whole template.

Frontmatter audit result: no change. `name`, `description`, and `allowed-tools` still match the installed first-party skill, normal invocation kind, create/write/stash trigger boundary, and actual `git branch` / `git status` / `brmem` command needs. `areg skill show handoff-create` remained `normal`, with model invocation and native direct invocation enabled.

Verification evidence: contract-diff review preserved the continuation-focus ask, non-goals, namespace/key shape, branch and detached-HEAD handling, semantic slug rules, collision check exit-code behavior, storage command, hidden-temp/draft rule, success copy, technical locator guidance, and pickup/admin routing. `skills/handoff-create/SKILL.md` dropped from 173 to 131 lines. `git diff --check`, `areg check`, and `just dprint-check` passed.

## Objective Impact

The per-skill remediation roadmap row now marks `handoff-create` as DONE with evidence. This exercises the high-lift/low-risk rewrite path again, now on the handoff skill family, without changing handoff storage semantics or user-visible lifecycle behavior.

The standalone per-skill remediation row remains `[~]` because many targets remain active, including the objective-family rewrites and other rewrite/surgical/prune/move targets.

## Follow-Ups

Continue the value-adjusted sequence with the objective-family rewrites (`objective-refresh`, `objective-update`, `objective-create`) before lower-reach ccc/niche targets, unless a new higher-value remediation slice is explicitly selected.
