# areg Cutover and Playbook Lessons

## Summary

Recorded `areg` as a completed TS-default capability in the umbrella TypeScript migration Objective after the child `areg-typescript-port` Objective closed.

Umbrella updates made in this slice:

- Migration ledger now marks `areg` as a completed out-of-sequence TS-default cutover rather than an active subobjective.
- Planned capability order now records the `areg` exception as complete and resumes the default next capability as `objective` unless new evidence changes the sequence.
- Roadmap now records `areg` completion evidence under the broader repeat-capability row.
- `porting-playbook.md` now includes `areg` lessons for skill-artifact contract inventories, managed project-file mutation safety, local-before-shared treatment of skill-lock/project-config/managed-block seams, final variadic Clinkr support, repo-local TypeScript shim distribution, stale Python console-script cleanup, and explicit Python deletion rollback/reference evidence.

Verification evidence from the child closure:

- `node ts/packages/areg/src/cli.ts --runtime` reports TypeScript.
- `areg --runtime` and `uv run areg --runtime` resolve to the TypeScript-backed shim/path in this checkout.
- `just areg-check` passed.
- Focused `@asdl/areg` TypeScript check and Vitest suite passed.
- `git ls-files packages/areg` is empty and empty untracked `packages/areg` directories were removed.
- `pyproject.toml` no longer includes `areg` in uv workspace/dev/source, Python lint/type, or pytest paths.

The deleted Python implementation's rollback/reference point is in-repo commit `18f25c34720f2422881afe93084d569f0d071dfd`, the parent of deletion commit `eb5785fc3`.

## Objective Impact

The parent Objective no longer treats `areg` as an active exception. It now has four completed production capability cutovers in evidence: `pr-address`, `brmem`, `handoff`, and the out-of-sequence `areg` slice.

The default migration order resumes at `objective` unless new integration-leverage or strategic evidence changes the sequence. Broader areg CLI structural cleanup is not migration-blocking and is tracked separately in `areg-ts-cli-cleanup`.

## Follow-Ups

- Use the updated playbook when creating or implementing the future `objective` TypeScript port subobjective.
- Keep `areg` post-migration structural cleanup in `areg-ts-cli-cleanup`; do not reopen the completed language-cutover Objective for cleanup-only work.
- Continue recording transitional migration compromises in `migration-debt.md` only when they affect the umbrella migration rather than one package's local cleanup.
