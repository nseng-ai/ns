# Systemic #1 — objective-family stub descriptions written (4 of N)

## Summary

Resolved the first concrete Systemic #1 slice on branch
`objective-family-descriptions` (stacked on `remove-command-backed-skill-examples`).
Four objective-family skills carried bare `description: "Command: <name>"` stubs while
being kind `normal` — advertised to the model but unroutable ("listed but unroutable").
`objective-refresh` was the only objective-* skill with a real `normal` description.

Changes (five `skills/objective-*/SKILL.md` frontmatter edits; real `skills/` source, not
symlinks):

- Wrote real `normal` trigger descriptions for `objective-close`, `objective-create`,
  `objective-next`, `objective-update`, mirroring `objective-refresh`'s style.
- Corrected `objective-refresh`'s existing boundary clause: it routed *closure* to
  `objective-update`; it now routes user-directed updates to `objective-update` and
  explicit closure to `objective-close`.
- No `areg` kind changes — all five remain kind `normal` (a deliberate decision, not the
  inherited default: these are model-routable Objective operations consistent with
  `objective-refresh`).

Each of the five descriptions carries an explicit sibling-disambiguation clause. The
three genuinely-overlapping pairs are split as: `next` (read-only advice) ↔ `update`
(record); `update` (user-directed change, auto-close only when criteria clearly met) ↔
`refresh` (non-closing rebaseline / fan-out); `update` (incidental/auto close) ↔ `close`
(explicit close intent).

## Objective Impact

- Partial progress on the Systemic #1 stream "(a) incomplete `normal` skills that only
  need a real trigger description written." The objective-family sub-slice is complete:
  `objective-close`, `objective-create`, `objective-next`, `objective-update` are no
  longer misconfigured stubs.
- Roadmap Systemic #1 row stays `[ ]`: the remaining stub-description skills are
  untouched (`sdl-submit`, `code-workflows`, `changelog-update`, `code-checkpoint`,
  `code-just-fix`, and the `setup-*` / `create-*` family), and the per-skill kind
  classification + sign-off for the genuinely-ambiguous explicit-only candidates remains
  the open next action.
- The kind decision was deliberately scoped: choosing `normal` for the objective family
  is settled (model-routable, consistent with `refresh`); the formal
  classification-with-sign-off applies only to the explicit-only candidates, not this
  family.

## Verification

- `areg check`: "All skills OK" (regression guard — confirms kinds unchanged; note this
  does NOT validate description quality, since `areg check` was already green with the
  stubs in place).
- All five objective-* skills confirmed still kind `normal` via `areg skill list`.
- No `Command: <name>` stub remains in any `skills/objective-*/SKILL.md`.
- Mutual-disambiguation review (the real acceptance bar, qualitative not automated): the
  five descriptions laid side-by-side; no trigger phrase plausibly routes to two skills;
  all three overlapping pairs carry mutual boundary clauses; no collision with the
  read-only `objective` umbrella skill.

## Follow-Ups

- Continue Systemic #1 stream (a) on the remaining incomplete-`normal` stubs, and produce
  the per-skill kind classification + sign-off for the explicit-only candidates before any
  batch `areg skill apply`. `command-backed` is off the option set (no exemplar exists —
  see the command-backed-unexemplified update).
- No automated stub-description lint was added; description quality remains a manual
  review concern. Revisit only if drift recurs.
</content>
