# skill-audit-improved support-skill status is unresolved

## Summary

Current branch evidence (`add-skill-audit-improved`, PR #1919, Graphite parent `master`) adds a new first-party skill at `skills/skill-audit-improved/`, a bundled `GLOSSARY.md`, and docs in `docs/skill-conventions.md` that tell authors to summon `skill-audit-improved` for skill audits. That is relevant to this Objective because it tries to package the skill-remediation audit vocabulary and process as a reusable support skill.

The branch is not clean Objective progress yet. It crosses the Objective's original "no new skills" boundary unless it is deliberately accepted as a support-skill exception, and its invocation state is inconsistent:

- `areg check` reports: `Orphaned directory skills/skill-audit-improved/ has no entry in skills-lock.json`.
- `areg skill show skill-audit-improved` reports kind `inconsistent`, with `disable-model-invocation` present but `agents/openai.yaml` absent.
- The new docs say to summon the skill, while the skill body says it is an inert comparison artifact and suggests `areg skill apply invoke-only skill-audit-improved` to install it.

## Objective Impact

- `objective.md` Non-Goals were tightened from a blanket "No new skills" statement to "No new production/remediation target skills" plus an explicit rule that any `skill-audit-improved` support artifact must be registered cleanly or removed/parked before it counts as progress.
- `objective.md` Assumptions and Risks now records the boundary/invocation risk surfaced by this branch.
- `roadmap.md` gained an active work row to resolve the `skill-audit-improved` support-skill status before counting the branch as landed Objective progress.
- No existing remediation target was marked complete. Closure is not ready: active roadmap work remains, and the current support-skill branch has red invocation verification.

## Follow-Ups

- Decide whether `skill-audit-improved` is a deliberate support-skill exception for this Objective or should be removed/parked as inert comparison material.
- If kept, register/reconcile it through the correct `areg` path and rerun `areg check` until green.
- Reconcile the docs/body mismatch: either the docs can tell authors to summon it because it is installed, or the body/docs should both present it as inert comparison material.
