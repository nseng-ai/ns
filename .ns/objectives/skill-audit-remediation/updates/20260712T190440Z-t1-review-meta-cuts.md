# T1 review/meta cuts executed — Tranche 1 complete

## Summary

Eighth and final Tranche 1 family branch, executed via an Objective Runner step on
`skill-audit-t1-review-meta` (stacked on `skill-audit-t1-docs-retro-setup`). 27 findings
applied across 4 skills / 5 skill files plus `docs/conventions/skill-conventions.md`;
13 findings dispositioned. Family totals (batch 11 + 12 files in this slice's scope):
991 → 855 lines (−136). Per-file: skill-management SKILL.md 326 → 262 (positioning
compressed to a scope note keeping the areg boundary one-liner, workflow-1 public and
internal code blocks merged into one flow plus a three-delta paragraph, Anti-patterns
and Skill visibility sections deleted, areg paragraph and update-guidance restatements
cut), skill-management commands.md 268 → 228 (Known CLI quirks and Reference: install
flag sections deleted — every quirk verified stated elsewhere before cutting; stray
stack-address sediment line removed), skill-audit 142 → 117 (11 per-section LINEAGE
`src:` tags deleted per the recorded de-meld, header comment shortened to the
runtime-load guard + areg line, vocabulary restatements cut, failure-mode duty stated
once in Audit Order, Harness & overlay notes compressed to two pointer lines resolving
the bare negation), refactor-swarm 138 → 131 (promotional benchmark, reassurance
clause, batching-strategy table, example moral, second rationale sentence), pi-grill-ui
25 → 25 (carry-over re-voicing "Interview me" → "Interview the user" mirrored from
pi-grill-with-docs-ui per the sanctioned sibling coupling). Cross-skill batch-12
findings 1 and 4 applied: the duplicate-skill-index rule now homed in
skill-conventions.md (skill-management drops it, skill-audit keeps the one-line check)
and the conventions doc's failure-mode enumeration replaced with a pointer to the
vendored vocabulary; cross-skill 2 resolved via the individual ownership cuts.

Dispositions (13): the four review stubs' double-pointer and negation findings (2 each
for dry-but-not-too-dry, improve-codebase-architecture, thermonuclear-review; 1 for
reinvented-abstractions-tripwire) are superseded — the T3 adversarial-reviews cluster
re-instantiated all four bodies from the template in
`docs/conventions/adversarial-reviews.md` with a sanctioned-duplication marker, so any
body change routes through the template, not per-stub cuts. The four Pi-alias sediment
findings (batch-11 cross-skill 4) are already resolved by that cluster (line absent
from all live stubs). pi-grill-ui findings 2 and 3 (negation re-leads) rejected: both
sentences sit in verbatim shared paragraphs with pi-grill-with-docs-ui whose copies
batch 10 judged clean and the prior slice kept; a one-sided rewrite would drift the
sanctioned coupling.

No deleted fragment is test-pinned: grepped `ts/`, `.pi/`, `docs/`, `.ns/reviews/` for
the cut phrases before editing (no hits outside the edited files); full suite green.

## Objective Impact

Tranche 1 is complete fleet-wide: all eight family branches executed (python family
excluded as moved to ns-python). The T1 roadmap row can be marked done pending the
parent's commit/stacking.

## Follow-Ups

- T2 items for these skills remain: skill-management and skill-audit description
  rewrites, refactor-swarm ↔ refactor-swarm-workflow reciprocal routing line,
  reinvented-abstractions-tripwire pointer-sentence exhaustiveness (now a template
  edit).
- T3 items remain: skill-management umbrella-families disclosure, rename-workflow
  completion bound, allowed-tools narrowing; pi-grill sibling-sync lineage note.
- T4: areg mutation commands (recorded on skill-management-subsystem).
