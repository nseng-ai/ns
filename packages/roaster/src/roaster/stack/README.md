# Roaster stack buckets

`roaster stack` is intentionally split into deletable implementation buckets while the command-driven and skill-first approaches bake off.

- `core/`: neutral contracts and pure helpers that survive either deletion.
- `common/`: shared run-state infrastructure backed by Branch Memory.
- `command/`: command-driven implementation for `roaster stack run`.
- `skill/`: skill-first deterministic helpers for `roaster stack exec ...`.

The only shared CLI mount file is `roaster/cli/roaster/stack/group.py`.

Shared tests live under `tests/unit/stack/core/` and `tests/unit/stack/common/`; do not delete them when removing only one implementation bucket.

## Delete COMMAND-DRIVEN (skill-first wins)

1. In `cli/roaster/stack/group.py`, remove the `run_stack_command` import and the `operations=[...]` entry marked `# COMMAND-DRIVEN`.
2. Remove `roaster/stack/command/` and `cli/roaster/stack/command/`.
3. Remove `prompts/stack_triage.md` and `prompts/stack_resolver.md`, plus their `test_prompt_resources.py` entries.
4. Remove command-driven tests under `tests/unit/stack/command/` (`test_workflow.py`, `test_triage_runner.py`, `test_agent_output.py`, `test_resolver_input.py`, `test_dry_run.py`, `test_dashboard.py`, and `test_dashboard_projection.py`) plus `tests/scenario/test_stack_cli.py`.
5. Leave `core/` and `common/` untouched. Optionally prune command-only helpers from `common/run_persistence.py` and `common/markers.py` if `just ty` proves they are unused.

## Delete SKILL-FIRST (command-driven wins)

1. In `cli/roaster/stack/group.py`, remove the `build_stack_exec_group` import and `group.add_command(...)` line marked `# SKILL-FIRST`.
2. Remove `roaster/stack/skill/` and `cli/roaster/stack/exec/`.
3. Remove `skills/roaster-stack/` and its `skills-lock.json` entry.
4. Remove skill-first tests under `tests/unit/stack/skill/` (`test_gate.py`) plus `tests/scenario/test_stack_exec_cli.py`.
5. Leave `core/` and `common/` untouched; the skill namespace is bound in `stack/skill/storage.py`, so no shared storage signatures need reverting.
