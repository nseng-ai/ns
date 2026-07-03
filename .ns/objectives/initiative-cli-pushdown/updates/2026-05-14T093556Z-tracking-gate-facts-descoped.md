# Tracking-Gate-Facts Descoped

## Summary

We decided not to implement `objective exec tracking-gate-facts` in this Objective. The steelthread is now two commands (`objective exec list` and `objective exec read-objective`) rather than three. Tracking Gate evidence collection stays entirely with the skill/agent for now; if deterministic CLI support for it becomes worthwhile, a future Objective will pick it up separately.

What prompted the decision: a Graphite stack reshape on 2026-05-14 dropped the `add-tracking-gate-facts-and-git-path-change-suppor` branch (intended as PR 466) from the `validate-objective-steelthread` stack lineage. As a result, on this branch:

- `packages/asdl-objectives/src/asdl_objectives/exec/tracking_gate_facts.py` does not exist.
- `GitPathChange` and the working-tree/index/committed listing APIs are not present in `asdl_core.git.types`.
- `uv run objective exec --help` lists only `list` and `read-objective`; `uv run objective exec tracking-gate-facts ...` fails with `Error: No such command 'tracking-gate-facts'`.
- The downstream skill/doc delegation cherry-pick (`64977cb1`) and the PR 468 scenario test additions (`598105c8`) both reference `objective exec tracking-gate-facts` and `GitPathChange`. `uv run pytest packages/asdl-objectives/tests/scenario/test_objective_cli.py` fails at import with `ImportError: cannot import name 'GitPathChange' from 'asdl_core.git.types'`.

Rather than re-stack the dropped branch and restore PR 5, we are removing `tracking-gate-facts` from this Objective's scope. The dropped branch still exists locally and on `origin` and is available as a starting point if a future Objective picks the work back up.

## Objective Impact

`objective.md` is updated to reflect the reduced scope:

- The Thesis now describes two CLI commands, with an explicit note that `tracking-gate-facts` was descoped on 2026-05-14.
- The Scope section removes the `tracking-gate-facts` bullet and adds an "Out of scope (descoped on 2026-05-14)" line documenting that decision.
- The Completion Criteria drop the `tracking-gate-facts` criterion and now reference the two shipped commands collectively.
- The earlier assumption that changed-path facts belong only in `tracking-gate-facts` is replaced with the new position that Tracking Gate evidence stays with the skill/agent for now.
- The previous "stack reshape" risk-materialization note is reframed as a descope decision: the dropped branch is now the trigger for changing scope rather than a state to recover from.
- Open Questions are revised to reflect the new shape (whether a future Objective should pick up Tracking Gate evidence; how to clean up the in-branch references that still mention `tracking-gate-facts`).

`roadmap.md`:

- The previous PR 5 entry under `## Work` is removed and replaced with a Parked entry that records the descope decision and points at the still-existing dropped branch.
- "Update Objective skills and docs to delegate deterministic mechanics" is `[~]`: the candidate-listing and record-reading delegations in commit `64977cb1` are correct, but the same edits reference `objective exec tracking-gate-facts` as a shipped command and need to be revised.
- "Validate the reduced steelthread (two commands only)" is `[ ]`: the five `tracking-gate-facts`-coupled scenario tests in `598105c8` are out of scope and must be removed before validation can pass.

Two earlier 2026-05-14 updates (`updates/2026-05-14T004058Z-skill-and-doc-audit-landed.md` and `updates/2026-05-14T012636Z-steelthread-validated.md`) claimed PR 5 done and the steelthread validated. Those claims are no longer accurate for this Objective; both updates are preserved for history and are superseded by this update.

## Follow-Ups

- Revise the skill/doc edits introduced by commit `64977cb1` so they no longer present `objective exec tracking-gate-facts` as a shipped command. Affected files include `skills/objective/SKILL.md` and `docs/objective-system.md`; check `skills/objective-next/SKILL.md` as well in case the cherry-pick reached it.
- Remove the five `tracking-gate-facts`-coupled scenario tests added in commit `598105c8` from `packages/asdl-objectives/tests/scenario/test_objective_cli.py` along with the now-unused `GitPathChange` import, then re-run `uv run pytest packages/asdl-objectives/tests tests/scenario/test_plugins.py` and `just` and record the result in a new update.
- Once the reduced steelthread is green on this branch, this Objective becomes ready for `objective-close`. Decide at that point whether deterministic Tracking Gate evidence should be promoted into a follow-on Objective or left dormant in `## Parked`.
