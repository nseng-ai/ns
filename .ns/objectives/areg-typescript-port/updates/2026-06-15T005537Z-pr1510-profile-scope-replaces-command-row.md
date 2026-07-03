# PR 1510 profile scope replaces command-conversion row

## Summary

Analyzed GitHub PR #1510, `Add skill profile management commands`, and updated this Objective's durable scope and roadmap to track reimplementing that work in TypeScript instead of keeping the old standalone `areg command convert|revert|list` porting row.

PR #1510 adds a profile-oriented local-skill invocation model in the Python `areg` implementation:

- New user-facing `areg skill profile set`, `areg skill profile list`, and `areg skill profile show` commands.
- Four explicit profiles inferred from on-disk artifacts rather than stored desired-state config: `normal`, `invoke-only`, `command-backed`, and `ambient-only`.
- A new `skill_profile.py` planning/status layer for frontmatter edits, Codex `agents/openai.yaml`, Pi `.pi/settings.json` exclusions, sidecar cleanup, profile inference, and status notes.
- `command-backed` as the profile-model successor to the older command-conversion lifecycle, with Pi replacement verification before hiding native `/skill:<name>` in Pi.
- Docs and tests for profile set/list/show, local/path-like skill selectors, batch behavior, inferred status reporting, ambient-only notes, and Pi-exclusion validation.
- Legacy `areg command convert|revert|list` remains in PR #1510 only as compatibility surface routed through the profile model.

## Objective Impact

The Objective now treats PR #1510's profile model as the semantic deliverable after `areg update-skills`. The previous roadmap row `Port areg command convert|revert|list` was removed and replaced with `Reimplement PR #1510's areg skill profile set|list|show model in TypeScript`.

This changes the intended TypeScript port shape: implementation should port the profile abstraction and artifact inference directly, not first reproduce the pre-profile command-conversion design. Any retained `areg command convert|revert|list` behavior is compatibility behavior inside the profile slice, not its own Objective deliverable.

## Follow-Ups

- Port `areg update-skills` first unless sequencing is deliberately changed again.
- When implementing the profile slice, use PR #1510 as reference evidence but adapt it to the existing TypeScript gateway/fake style rather than copying Python module boundaries.
- Update docs and cutover instructions for `areg skill profile` during the profile/distribution rows, including any accepted legacy alias story.
