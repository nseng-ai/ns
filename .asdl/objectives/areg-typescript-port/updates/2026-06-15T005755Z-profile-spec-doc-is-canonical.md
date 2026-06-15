# Skill invocation profiles spec is canonical

## Summary

Confirmed that `docs/skill-invocation-profiles.md` is the canonical TypeScript-port specification for the profile-system work originally prototyped in PR #1510.

The spec covers the full intended behavior for the TypeScript implementation:

- `areg skill profile set PROFILE SKILL...`
- `areg skill profile list`
- `areg skill profile show SKILL`
- legacy compatibility commands `areg command convert|revert|list`
- local-skill-only path resolution and symlink safety boundaries
- managed artifacts for `disable-model-invocation`, `user-invocable:false`, Codex `agents/openai.yaml`, and Pi `.pi/settings.json` exclusions
- profile-to-artifact matrix for `normal`, `invoke-only`, `command-backed`, and `ambient-only`
- inferred profile reporting for `normal`, `invoke-only`, `command-backed`, `ambient-only`, `mixed`, and `inconsistent`
- Pi replacement verification rules and derived command surfaces
- expected CLI output shapes, dry-run behavior, failure behavior, `areg check` diagnostics, and TypeScript acceptance checklist

## Objective Impact

The roadmap row now names the work as `Reimplement the skill invocation profiles system in TypeScript` and cites `docs/skill-invocation-profiles.md` as the implementation contract. PR #1510 remains useful prototype/provenance evidence, but downstream implementation should follow the spec document when resolving details.

This clarifies that the replaced `areg command convert|revert|list` row should not be resurrected as an independent porting deliverable. Legacy `areg command` behavior belongs inside the profile-system compatibility surface described by the spec.

## Follow-Ups

- When implementing the profile-system slice, start from `docs/skill-invocation-profiles.md` and use PR #1510 only as supporting prototype evidence.
- Ensure tests cover the spec acceptance checklist, especially `mixed`/`inconsistent` inference, dry-run validation, multi-skill partial failure behavior, path/symlink rejection, Pi replacement verification, and `areg check` diagnostics.
