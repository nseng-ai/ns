# Semantic Update: AREG overlay term decision

## Summary

Settled the replacement term for AREG's colliding "managed artifacts" overlay sense as **harness overlays**. The term was chosen because the files are defined by harness integration surfaces (Claude Code/Pi frontmatter flags, Codex sidecars, Pi settings exclusions, and mirror symlinks) while staying axis-agnostic beyond the current skill invocation-kind workflow.

The rename is textual-only. No machine-facing names changed: schemas, flags, JSON keys, error codes, file paths, and reconcile/provisioning behavior are unchanged.

## Objective Impact

- Advances roadmap row 2: the AREG overlay terminology is decided and applied across the bounded AREG user-facing strings, scenario test name, and the live `skill-conventions.md` table/section.
- Resolves the open question about the final replacement term for AREG's overlay sense.
- Keeps the Objective's bare-"artifact" collision cleanup bounded: handoff artifacts, consumer artifacts, and harness artifacts are not renamed.
- Leaves the next two-channel `skill-management` positioning slice untouched.

## Follow-Ups

- Continue with the planned two-channel documentation slice for `docs/conventions/skill-conventions.md` and `skills/skill-management/**`.
- Keep `docs/research/harness-skill-invocation.md`, historical retros, and machine-facing AREG identifiers out of this textual rename unless a later Objective row explicitly scopes them.
