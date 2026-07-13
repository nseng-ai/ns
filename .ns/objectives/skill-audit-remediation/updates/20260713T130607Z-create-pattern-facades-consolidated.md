# Objective-create pattern facades consolidated into conditional references

## Summary

The six `objective-create-<pattern>` facade skills (wayfinding, steelthread,
standing, umbrella, autoobjective, readme-driven-development) were folded into
conditional references under `skills/objective-create/references/<pattern>-create.md`,
loaded by the same mechanic as the existing `execution-friendly-create.md`. The
`objective-create` interview now presents the pattern set upfront as a numbered menu
(vanilla recommended first, one-line recognition cues from the patterns catalog),
skipped when the pattern is already named or unambiguous. The six
`/ns:objective:create:<pattern>` Pi commands were retired along with the facade skill
directories, their mirror symlinks, `skills-lock.json` entries, and `.pi/settings.json`
exclusions; one `/ns:objective:create` command remains. The RDD reference dropped the
"every run creates a new Objective" rule (it contradicted RDD's multi-pass lifecycle)
and is now first-pass-only with a continuation pointer to the base
`readme-driven-development` skill.

## Objective Impact

This supersedes the facade half of the T3 objective-family SSOT decision
(`updates/20260712T193535Z-t3-objective-family-ssot-executed.md`): the
"create-facades delta-only" family policy no longer describes standalone facade
skills. The catalog remains the recognition-level SSOT; its `Creation:` pointers now
target `objective-create` references instead of facade skills. Pattern selection
moved from skill dispatch to the objective-create interview.

## Follow-Ups

- None; docs (`wayfinder-objective-adaptation.md`, `matt-pocock-skills.md`,
  `issue-tracker.md`) were repointed in the same change.
