# skill-audit-improved registered as invoke-only support skill

## Summary

The `skill-audit-improved` branch's support-skill status is resolved as a deliberate invoke-only support-skill exception for this Objective. The skill remains a support artifact for skill-content remediation rather than a new production/remediation target skill.

Implementation evidence in the working tree:

- `npx skills add ./skills/skill-audit-improved --agent codex claude-code -y` registered the local skill.
- `skills-lock.json` now has a repo-relative local entry for `skill-audit-improved`.
- `.agents/skills/skill-audit-improved` points to `../../skills/skill-audit-improved`, and `.claude/skills/skill-audit-improved` points to `../../.agents/skills/skill-audit-improved`.
- `areg skill apply invoke-only skill-audit-improved` reconciled invocation artifacts and generated `skills/skill-audit-improved/agents/openai.yaml`.
- The `SKILL.md` lineage comment no longer says the skill is an inert comparison artifact; it now says the skill is installed as an invoke-only support skill via areg.

Verification evidence: `areg skill show skill-audit-improved` reports kind `invoke-only`; `areg check` reports `All skills OK`; `npx skills list` shows `skill-audit-improved`; `just dprint-check` passed.

## Objective Impact

- The roadmap row "Resolve the `skill-audit-improved` support-skill status" is now `[x]`.
- The boundary/invocation risk in `objective.md` is updated from unresolved to resolved-as-support-exception, with evidence linked to this update.
- This does not complete any existing per-skill remediation target and does not change the next highest-value work: the `python-fake-driven-testing` reference-tree merge remains open.
- Closure is not ready because the main per-skill remediation row and the `python-fake-driven-testing` reference-tree merge remain active.

## Follow-Ups

- Continue with the value-adjusted sequence: the `python-fake-driven-testing` reference-tree merge remains the highest-value open action.
- When this branch is committed/submitted, include the new install artifacts (`skills-lock.json`, symlinks, `agents/openai.yaml`) with the skill body wording change.
