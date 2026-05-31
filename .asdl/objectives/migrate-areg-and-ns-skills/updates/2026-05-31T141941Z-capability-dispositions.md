# Capability Dispositions Completed

## Summary

The whole-repo nonslop capability inventory now has explicit dispositions for every discovered source/config/documentation/development artifact from `/Users/schrockn/code/nonslop`.

Evidence used for the disposition pass included `git -C /Users/schrockn/code/nonslop ls-files`, a clean nonslop worktree, bounded checkout inspection excluding caches/build output, and a file-level comparison between nonslop `skills/` and existing asdl-tools `.agents/skills/ns-*` copies. The comparison found that most overlapping `ns-*` skills are identical, `ns-dignified-python` and `ns-py-fake-driven-testing` need reconciliation, six nonslop skills are missing from asdl-tools, and asdl-tools has an asdl-only `ns-setup-python-ci` variant that should be folded or retired after `ns-setup-python-gh-ci` lands.

## Objective Impact

The first roadmap row is no longer blocked on `TBD` dispositions. Implementation can proceed to the next semantic slice: porting `areg` as a standalone workspace package while using the inventory as the migration map.

The audit also clarifies that several checkout-visible nonslop artifacts should not be copied: the nonslop `uv.lock`, local Claude/Codex permission state, twerk symlinks from `local.just`, empty `packages/nonslop-dev`, and cache/build output are all deletion-readiness inputs only insofar as they are explicitly ignored or retired.

## Follow-Ups

- Start the next implementation slice with `packages/areg` workspace wiring and default-source rewrites to `dagster-io/asdl-tools`.
- When promoting skills, reconcile `ns-dignified-python` and `ns-py-fake-driven-testing` from the asdl-tools copies first, then add the six missing nonslop skills.
- Rewrite `ns-install`, `ns-skill-management`, `ns-skillx`, and `nsx` away from `uvx nonslop` / `nseng-ai/nonslop`.
- Fold or retire the existing asdl-only `ns-setup-python-ci` after `ns-setup-python-gh-ci` is present and references are updated.
