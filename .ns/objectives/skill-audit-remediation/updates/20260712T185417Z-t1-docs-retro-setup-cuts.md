# T1 docs/retro/setup cuts executed

## Summary

Seventh Tranche 1 family branch executed via an Objective Runner step on
`skill-audit-t1-docs-retro-setup` (commit bbb228fe, stacked on the TypeScript/CLI
slice). 22 findings applied across 9 skills / 10 files (batch 10 plus the two batch-11
analysis skills), family total 1304 → 1233 lines. Largest cut: changelog-update
172 → 144, replacing in-skill entry-format and category-order copies with pointers to
`references/changelog-format.md` while preserving its pure-git identity per the
frontload decision. Every touched file's pre-edit `wc -l` matched the audit's anchor
counts, so no finding was stale and none was rejected. Notable verifications: the
`references:` frontmatter key was deleted only after confirming no TS code or harness
reads it, and every deleted sentence fragment was grepped across `ts/`, `.ns/`, and
`docs/` for test pins (none found; full suite green).

Validation: `just` green, `areg check` OK, `areg skill show` verified for all 9
touched skills.

## Objective Impact

Tranche 1: seven of 8 family branches done. Only review/meta remains, after which the
T1 roadmap row is complete fleet-wide (python family excluded as moved).

## Follow-Ups

- Final T1 family branch: review/meta. It should mirror pi-grill-with-docs-ui's
  re-voicing ("Interview the user") to pi-grill-ui per the sanctioned sibling
  coupling recorded in the batch-10/11 cross-skill findings.
- T2/T3/T4 items for these skills (description rewrites, doc-economics extraction,
  HTML-REPORT TOC, episode-slice script) remain in their tranches.
