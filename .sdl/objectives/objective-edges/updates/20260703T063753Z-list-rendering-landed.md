# List rendering landed; blocked glyph resolved as ⊘ sub-state of open

## Summary

The list-rendering roadmap row is complete on local branch `objective-list-edges-rendering`
(verified runner-step commit, stacked on the linter branch). `buildObjectiveListRecord` reads
each active record through the shared frontmatter reader and surfaces optional `edgeCount`
(omitted when zero) and `isBlocked` (omitted when not blocked) facts; the EDGES column renders
to the right of LATEST UPDATE on the pretty, plain-table, and markdown surfaces, blank when
zero. Records without frontmatter serialize and render byte-identically to before. Full `just`
green (4045 tests, 120-record sweep ok); live CLI shows the EDGES header on this checkout.

## Objective Impact

Fourth roadmap row done; both open spellings in this record are now resolved. Defaults
recorded by this slice where the record was silent:

- Blocked glyph: `⊘` (U+2298, ascii fallback `!`), warn intent, keeping the STATUS word
  `open` so blocked reads as a sub-state of open; pretty surface adds a footer legend,
  table/markdown surfaces render `⊘ open (blocked)`.
- `--minimal` and markdown surfaces do show edge count and blocked state (only branch
  attribution is minimal-suppressed); `--names` output is unchanged.
- Malformed or unreadable frontmatter renders exactly like no frontmatter (blank EDGES, no
  blocked indicator) — the list never errors over one bad record; reporting stays with the
  `check` linter.

Remaining open rows: skill updates, seed, vocabulary. The sdlcc objective-tab host surface
was deliberately left on its slug/status/latest-update table; adopting the new facts there is
optional future work outside this Objective's scope.

## Follow-Ups

- Seed row supplies the live before/after list evidence for the two named records.
