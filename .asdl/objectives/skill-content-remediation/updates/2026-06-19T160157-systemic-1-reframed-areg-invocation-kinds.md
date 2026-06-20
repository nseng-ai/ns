# Systemic #1 reframed — areg invocation kinds, not a binary flag

## Summary

Investigation this session established that skill invocation in this repo is governed by
the **agent registry (`areg`)**, not by hand-authored frontmatter — which materially
changes the shape of Systemic #1.

Key findings:

- Every local skill has exactly one **invocation kind**: `normal`, `ambient-only`,
  `invoke-only`, or `command-backed`. Inspect with `areg skill list` / `areg skill show`;
  change with `areg skill apply <kind> <skills>`; `areg check` enforces consistency and
  flags hand-introduced drift as `mixed`/`inconsistent`. The flags
  (`disable-model-invocation`, `agents/openai.yaml`, `.pi/settings.json -skills/<name>`,
  `user-invocable: false`) are *managed artifacts*, not knobs to edit by hand.
- The kinds form a 2×2 over "does the model auto-route to it?" × "can a human invoke it?".
- The `description: "Command: X"` + commented-out real description is the **rendered
  output** of an explicit-only kind, not a freehand token-saving convention. Confirmed via
  `areg skill list`: every `Command: X` stub skill is currently kind `normal` (model-
  invocable) while carrying that stub — i.e. *advertised to the model but unroutable*.
  That is a misconfiguration, not a finished state.
- `command-backed` is the heaviest kind and carries a hard dependency: a *verified* Pi
  replacement extension must already exist (`.pi/extensions/`). `setup-dprint` is the
  canonical and currently only `command-backed` skill. Most explicit-only conversions
  should target the lighter `invoke-only`.
- Invocation kind is **orthogonal to visibility** (`metadata.internal: true`).

The taxonomy and norms are now documented in `docs/skill-conventions.md` § Skill
Invocation Kinds, cross-linked from `docs/harness-skill-invocation.md` (shipped on branch
`branch-policy/document-areg-skill-kinds`, commit `5c25215ad`; PR #1881 covers the parent
branch-policy work).

## Objective Impact

- Roadmap `## Work` Systemic #1 row rewritten: from "decide `disable-model-invocation`
  vs restore description" to "set the correct areg kind via `areg skill apply`", split
  into two streams — (a) incomplete `normal` skills needing a real description, (b)
  explicit-only skills reconciled to `invoke-only`/`command-backed`.
- `objective.md` Scope finding #1, the corresponding Assumption, and the Systemic #1 Open
  Question updated: the *mechanism* is resolved (areg four-kind taxonomy); the *per-skill
  kind assignment* remains open and needs a classification + sign-off before batch apply.
- No roadmap checkbox changed state; Systemic #1 stays `[ ]`. The investigation decided
  *how* to do the work, not the work itself.
- Decoupled risk insight: `command-backed` is load-bearing (verified Pi replacement for
  `setup-dprint`); deleting that kind would be `skill-management-subsystem` / areg work,
  explicitly a Non-Goal here.

## Follow-Ups

- Produce the per-skill kind classification for the ~13 stub skills still kind `normal`:
  which are `normal` + real description vs explicit-only, and which explicit-only skills
  already have a Pi replacement extension (→ `command-backed`) vs not (→ `invoke-only`).
  Get sign-off, then batch-apply via `areg skill apply` and verify with `areg check`.
- Lowest-risk first slice: `objective-close` / `objective-create` are `normal` siblings of
  `objective-next`/`-update`/`-refresh` missing only their trigger descriptions — write
  those, no kind change.
