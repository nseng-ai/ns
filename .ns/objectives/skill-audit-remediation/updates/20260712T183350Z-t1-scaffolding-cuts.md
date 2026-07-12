# T1 scaffolding cuts executed

## Summary

Fifth Tranche 1 family branch executed via an Objective Runner step on
`skill-audit-t1-scaffolding` (commit 4a1698a5, stacked on the flow+ccc slice). The
slice is deliberately small: four of the six batch-8 scaffolding skills moved to
`nseng-ai/ns-python` before this tranche, leaving create-bun-typescript-project
(229 → 221 lines) and project-setup (59 → 49). All batch-8 findings are now
dispositioned: applied where live, out-of-scope for the ns-python-moved skills,
description/trigger portions deferred to T2, and the cross-skill leading-word
"green" completion-bar suggestion **rejected** for T1 — it introduces new family
vocabulary rather than deleting, so it is not a behavior-preserving mechanical cut,
and most of its sites left the repo.

Validation: `just` green, `areg check` OK, `areg skill show` verified for both
touched skills (kinds unchanged: unlisted / invoke-only). project-setup's
`.agents` mirror is a symlink, so it tracks the edit automatically.

## Objective Impact

Tranche 1: five of ~8 family branches done (objective; branch-context/handoff/brmem;
code/Graphite ops; flow+ccc; scaffolding). Batch 8 is fully dispositioned.

## Follow-Ups

- Remaining T1 family branches: TypeScript/CLI; docs/retro/setup (includes
  setup-dprint/setup-dprint-gh-ci from batch 10); review/meta.
- Small drift noted, not a T1 finding: project-setup's Routing bullet 1 still uses
  "scaffold a Python package with CI and publishing" as its multi-route example after
  the Python move; T2 touches this file anyway.
