# Tracking-Gate-Facts Descoped

## Summary

We decided not to implement `initiative exec tracking-gate-facts` in this Initiative. The steelthread is now two commands (`initiative exec list` and `initiative exec read-initiative`) rather than three. Tracking Gate evidence collection stays entirely with the skill/agent for now; if deterministic CLI support for it becomes worthwhile, a future Initiative will pick it up separately.

What prompted the decision: a Graphite stack reshape on 2026-05-14 dropped the `add-tracking-gate-facts-and-git-path-change-suppor` branch (intended as PR 466) from the `validate-initiative-steelthread` stack lineage. As a result, on this branch:

- `packages/asdl-initiatives/src/asdl_initiatives/exec/tracking_gate_facts.py` does not exist.
- `GitPathChange` and the working-tree/index/committed listing APIs are not present in `asdl_core.git.types`.
- `uv run initiative exec --help` lists only `list` and `read-initiative`; `uv run initiative exec tracking-gate-facts ...` fails with `Error: No such command 'tracking-gate-facts'`.
- The downstream skill/doc delegation cherry-pick (`64977cb1`) and the PR 468 scenario test additions (`598105c8`) both reference `initiative exec tracking-gate-facts` and `GitPathChange`. `uv run pytest packages/asdl-initiatives/tests/scenario/test_initiative_cli.py` fails at import with `ImportError: cannot import name 'GitPathChange' from 'asdl_core.git.types'`.

Rather than re-stack the dropped branch and restore PR 5, we are removing `tracking-gate-facts` from this Initiative's scope. The dropped branch still exists locally and on `origin` and is available as a starting point if a future Initiative picks the work back up.

## Initiative Impact

`initiative.md` is updated to reflect the reduced scope:

- The Thesis now describes two CLI commands, with an explicit note that `tracking-gate-facts` was descoped on 2026-05-14.
- The Scope section removes the `tracking-gate-facts` bullet and adds an "Out of scope (descoped on 2026-05-14)" line documenting that decision.
- The Completion Criteria drop the `tracking-gate-facts` criterion and now reference the two shipped commands collectively.
- The earlier assumption that changed-path facts belong only in `tracking-gate-facts` is replaced with the new position that Tracking Gate evidence stays with the skill/agent for now.
- The previous "stack reshape" risk-materialization note is reframed as a descope decision: the dropped branch is now the trigger for changing scope rather than a state to recover from.
- Open Questions are revised to reflect the new shape (whether a future Initiative should pick up Tracking Gate evidence; how to clean up the in-branch references that still mention `tracking-gate-facts`).

`roadmap.md`:

- The previous PR 5 entry under `## Work` is removed and replaced with a Parked entry that records the descope decision and points at the still-existing dropped branch.
- "Update Initiative skills and docs to delegate deterministic mechanics" is `[~]`: the candidate-listing and record-reading delegations in commit `64977cb1` are correct, but the same edits reference `initiative exec tracking-gate-facts` as a shipped command and need to be revised.
- "Validate the reduced steelthread (two commands only)" is `[ ]`: the five `tracking-gate-facts`-coupled scenario tests in `598105c8` are out of scope and must be removed before validation can pass.

Two earlier 2026-05-14 updates (`updates/2026-05-14T004058Z-skill-and-doc-audit-landed.md` and `updates/2026-05-14T012636Z-steelthread-validated.md`) claimed PR 5 done and the steelthread validated. Those claims are no longer accurate for this Initiative; both updates are preserved for history and are superseded by this update.

## Follow-Ups

- Revise the skill/doc edits introduced by commit `64977cb1` so they no longer present `initiative exec tracking-gate-facts` as a shipped command. Affected files include `skills/initiative/SKILL.md` and `docs/initiative-system.md`; check `skills/initiative-next/SKILL.md` as well in case the cherry-pick reached it.
- Remove the five `tracking-gate-facts`-coupled scenario tests added in commit `598105c8` from `packages/asdl-initiatives/tests/scenario/test_initiative_cli.py` along with the now-unused `GitPathChange` import, then re-run `uv run pytest packages/asdl-initiatives/tests tests/scenario/test_plugins.py` and `just` and record the result in a new update.
- Once the reduced steelthread is green on this branch, this Initiative becomes ready for `initiative-close`. Decide at that point whether deterministic Tracking Gate evidence should be promoted into a follow-on Initiative or left dormant in `## Parked`.
