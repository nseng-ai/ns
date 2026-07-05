# objective umbrella rewritten (queue position 2)

## Summary

Rewrote `skills/objective/SKILL.md` from scratch against `writing-great-skills` —
queue position 2 of the post-ADR-0016 re-rank. 164 → 156 lines (modest, as
predicted: its debt was moderate sprawl, not per-command duplication). Frontmatter
and description are diff-verified identical, so ambient routing is unchanged
(`objective` stays `normal`).

Gate: a 113-item contract (vocabulary, selection rules, storage model, safety
boundaries, family routing, CLI commands/flags, Record Frontmatter rules) was
extracted and the rewrite diffed item by item; all items present. The family
routing list, picker rules, and Tracking Gate were deliberately kept near-verbatim
given the skill's shared-grounding role. The headings step skills reference by
name (`Record Frontmatter`, `Objective PR evidence`, `Objective consolidation`,
Tracking Gate) are preserved; the standalone `## Slug identity` H2 merged into the
Concept section after a repo-wide grep confirmed nothing links to that anchor.

What collapsed: the read-only identity restated in the tail line; the twice-stated
`--names` / archived-outside-discovery facts; the duplicated lifecycle-metadata
clause in the orientation.md paragraph; branch-names-are-not-selection folded into
the single Selection prohibition. The Files section gained per-file H3s for
co-location.

## Objective Impact

- Queue position 2 complete via the rewrite method with the gate passed. Both
  ambient (`normal`) targets are now remediated.
- `roadmap.md`: elevation-candidates row notes `objective` DONE with evidence.
- Evidence: `areg check` "All skills OK"; `dprint` clean; contract + report in
  session scratchpad.

## Follow-Ups

- Queue positions 3–6 (`dignified-python`, `code-thermostack`, `refactor-swarm`,
  `objective-create` rewrites) proceed next in the same stack.
