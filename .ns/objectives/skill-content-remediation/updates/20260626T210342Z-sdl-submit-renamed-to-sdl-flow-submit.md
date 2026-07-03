# `sdl-submit` target renamed to `sdl-flow-submit`

## Summary

Trunk-explicit rebaseline at HEAD against current repository ground truth. The only
material claim that ground truth contradicts is the skill identifier `sdl-submit`: it was
renamed to `sdl-flow-submit` after the Objective baseline. Commit `e52c73b7b` ("Rename SDL
submit skill to flow submit", 2026-06-24) postdates baseline `a1cc7fb2b` (2026-06-20).

Evidence at HEAD:

- `skills/sdl-submit/` no longer exists; `skills/sdl-flow-submit/SKILL.md` exists.
- `git log -- skills/sdl-submit/` shows the rename as the latest touch (`e52c73b7b`).
- `sdl-flow-submit` is the `command-backed` member: present in `COMMAND_STYLE_LOCAL_SKILLS`
  (`ts/packages/hosts/pi/src/commands/surfaces.ts`) and mapped to the Pi surface
  `sdl:flow:submit`; its frontmatter still carries `disable-model-invocation: true` plus the
  `Command: sdl-flow-submit` stub, consistent with the recorded command-backed resolution.
- The `move-to-reference` target remains unstarted: `skills/sdl-flow-submit/` has no
  `references/` dir; the env-var catalog still lives inline in its 76-line `SKILL.md`.

Corrected all four record references (1 in `objective.md`, 3 in `roadmap.md`). The
command-backed set is still eight skills (a rename, not a membership change). Everything
else re-verified clean: systemic #1/#2/#3 resolutions hold (grill pair, branch-context
`lifecycle.md`/`from-plan`, `docs/conventions/skill-conventions.md` § Skill Invocation Kinds all
present); every other named per-skill target still exists under `skills/`; the DONE rewrites
(`objective-stack-impl`, `objective-refresh`, `objective-update`, `handoff-create`) and the
`python-fake-driven-testing` reference-tree merge (`quick-reference.md` gone, `workflows.md`
present) all hold; `skill-audit-improved` is installed with `agents/openai.yaml`.

## Objective Impact

No change to scope, completion criteria, risks, or open questions. Only the stale skill
identifier was corrected to its current name and Pi surface. The `sdl-flow-submit`
move-to-reference work remains pending under the in-progress per-skill remediation row.

Note (not rewritten): `docs/conventions/skill-conventions.md` now frames the `Command: <name>` stub as a
legacy artifact ("current `areg skill apply` does not rewrite descriptions"), whereas the
Objective's systemic #1 prose frames the stub as the live "rendered output" of an
explicit-only kind. The systemic #1 work is DONE and the recorded decision/evidence remain
accurate, so this framing nuance is logged as a finding rather than rewritten.

Provenance: objective-refresh basis target=HEAD from=a1cc7fb2b

## Follow-Ups

- None required for this rebaseline. When the `sdl-flow-submit` move-to-reference work is
  picked up, confirm the env-var catalog relocates to `skills/sdl-flow-submit/references/`.
