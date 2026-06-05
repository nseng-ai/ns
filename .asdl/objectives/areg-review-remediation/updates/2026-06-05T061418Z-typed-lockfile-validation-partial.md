# Typed lockfile validation completed with lock hash debt resolved

## Summary

The typed-lockfile remediation slice has landed in branch evidence via commit `8bbe352d` ("[cp] Add typed lockfile validation") on branch `typed-skills-lockfile-validation`. `areg` now parses `skills-lock.json` into typed `SkillsLockfile`/`LockfileSkill` dataclasses instead of raw nested dictionaries, and both `areg check` and `areg update-skills` fail malformed-but-valid JSON shapes with clean `click.ClickException` messages.

Parse-time validation now requires root/version/skills shape, supported `sourceType`, string `source`, string `computedHash`, and string `skillPath` when present. `areg update-skills` consumes the typed entries while preserving the existing GitHub-only update contract. A new lockfile consistency project check reports placeholder `PENDING_REGEN` hashes and non-64-lowercase-hex hashes as per-skill `areg check` findings rather than incidental Python exceptions.

The stricter check deliberately surfaced existing repository debt: `uv run areg check --path .` reported 12 local-skill lockfile entries with `computedHash: PENDING_REGEN`. Commit `b63d9356` resolved that debt by regenerating the local skill hashes and replacing all 12 placeholders in root `skills-lock.json`; `areg-check` is green again in PR #906 v2.

Evidence basis: committed branch diff against Graphite parent `areg-npx-skills-skillx-workspace-boundary`; PR #906 v2 corroborates the same file set and passing checks. Verification: `uv run pytest packages/areg/tests/unit/test_lockfile.py -q`, `uv run pytest packages/areg/tests/integration/test_check.py -q`, `uv run pytest packages/areg/tests/scenario/test_update_skills.py packages/areg/tests/scenario/test_cli_preconditions.py -q`, `uv run pytest packages/areg/tests -q`, `just lint`, `just format-check`, `just ty`, `just test`, and PR #906 v2 CI including `areg-check` passed.

## Objective Impact

- Roadmap Work item #4 moved from `[ ]` through `[~]` to `[x]`: typed/user-facing lockfile schema handling and consistency issue reporting are implemented and tested, and the repository lockfile now satisfies the enforced hash contract.
- The lockfile-debt risk materialized in a controlled way and is resolved for this slice: `areg check` exposed all 12 `PENDING_REGEN` placeholders as actionable findings, then commit `b63d9356` replaced them with generated hashes.
- Completion criterion "Lockfile parsing and skills-management validation enforce the real contract" is now satisfied for the planned lockfile remediation scope.

## Follow-Ups

- Continue with migrated skill docs/templates reconciliation and the final strict-review rerun.
