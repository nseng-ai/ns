# Systemic #1 — command-backed kind now unexemplified (setup examples removed)

## Summary

Branch `remove-command-backed-skill-examples` (commit `3aba5bc38`, "Drop command-backed
setup skill references"; Graphite parent `branch-policy/document-areg-skill-kinds`)
removes the only remaining `command-backed` exemplars from the repo. Treated as landed
state, after this branch merges **no skill uses the `command-backed` kind** — it remains
supported but unexemplified.

Branch-local changes (vs the Graphite parent), all committed, working tree clean:

- Removed the `setup:*` entries (`setup:dprint`, `setup:dprint-gh-ci`, `setup:graphite`,
  `setup:pypi-publish`, `setup:python-gh-ci`) from the `command-backed` replacement-surface
  allowlist in `ts/packages/areg/src/real-gateways.ts`.
- Removed the matching `setup-*` entries from `COMMAND_STYLE_LOCAL_SKILLS` in
  `ts/packages/pi-extensions/src/backing-skill-commands.ts`.
- Rewrote the `invoke-only` vs `command-backed` norm in `docs/skill-conventions.md` to
  state that no skill currently uses `command-backed` (supported but unexemplified),
  replacing the prior "`setup-dprint` is the canonical (and only) `command-backed`
  example" wording.
- Cleared the `-skills/setup-dprint` entry from `.pi/settings.json` (now `"skills": []`).

## Objective Impact

- This **invalidates the durable premise** that `setup-dprint` is "the canonical and
  currently only `command-backed` skill." The immutable update
  `2026-06-19T160157-systemic-1-reframed-areg-invocation-kinds.md` recorded that premise
  (and a "command-backed is load-bearing" risk insight resting on it); that update is a
  historical record and is **not** edited. This new update supersedes the setup-dprint
  framing: as of this branch, `command-backed` has no exemplar.
- `roadmap.md` Systemic #1 row reconciled: the `command-backed` parenthetical no longer
  names `setup-dprint` as the canonical example; it now states the kind is unexemplified
  and that any future `command-backed` conversion must build the verified Pi replacement
  extension first.
- `objective.md` Scope finding #1 reconciled to the same effect: `invoke-only` is the
  default explicit-only target; `command-backed` is currently unexemplified.
- No roadmap checkbox changed state. Systemic #1 stays `[ ]` — the per-skill kind
  classification and sign-off for the stub skills is still the open next action. This
  branch only removed the (now invalidated) `command-backed` exemplar surface; it did not
  classify or convert any stub-description skill.
- Practical effect on Systemic #1 guidance: explicit-only reconciliations should target
  `invoke-only`. `command-backed` is effectively off the table for this Objective's batch
  work unless a verified Pi replacement extension is built first — building one is
  `skill-management-subsystem` / Pi-extension work, a Non-Goal here.

## Follow-Ups

- Unchanged primary next action: produce the per-skill kind classification for the stub
  skills still kind `normal` (which become `normal` + real description vs `invoke-only`),
  get sign-off, then batch-apply via `areg skill apply` and verify with `areg check`.
  Drop `command-backed` from the option set for that classification given no exemplar
  exists.
- Lowest-risk first slice still stands: `objective-close` / `objective-create` are
  `normal` siblings of `objective-next`/`-update`/`-refresh` missing only their trigger
  descriptions — write those, no kind change.
  </content>
  </invoke>
