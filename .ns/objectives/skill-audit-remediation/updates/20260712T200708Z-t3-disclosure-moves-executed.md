# T3 disclosure moves executed

## Summary

The disclosure-moves cluster executed via an Objective Runner step on
`skill-audit-t3-disclosure-moves` (commit e11c21f8). Four skills, five findings
applied, every relocation staying inside the owning skill's directory with
condition-shaped pointers left behind: code-smush's Absorbing feedback/Recovery/Known
limits moved verbatim to `references/recovery-and-feedback.md` (SKILL.md 439 → 406);
ns-cmux-stack-map's ANSI palette joined its existing
`references/display-and-code-sketch.md` (102 → 90); objective-retro's two artifact
templates moved to `references/templates.md` and its maintainer sanity check to a
sibling README (259 → 178); skill-management's umbrella-families section moved to
`references/umbrella-families.md` with its Avoid list deduped per the finding
(262 → 213). Always-loaded SKILL.md surface across the four: 1062 → 887 lines.

Dispositions: the pytest import-mode disclosure finding is moot here (skill moved to
ns-python); two cross-skill findings were verified already executed by the
neutral-homes slice; skill-management #18 (allowed-tools narrowing) is T3-tagged but
not a disclosure move — deferred to the final T3 slice; the TOC and
completion-criteria findings stay with that slice too.

Validation: `just` green, `areg check` OK, `areg skill show` verified for all four
touched skills (kinds unchanged, mirrors present).

## Objective Impact

Tranche 3: five clusters done (adversarial-reviews, TS ownership, objective-family
SSOT, neutral homes, disclosure moves). One T3 slice remains: reference TOCs, the
four vague completion criteria, and the skill-management allowed-tools disposition —
after which T3 is complete and T4 begins.

## Follow-Ups

- Final T3 slice: TOCs for `code-gh` graphql references and
  architecture-topology-report HTML-REPORT.md; completion-criteria sharpening for
  ns-cmux-branch-triage, code-thermostack, code-gt-restack-resolve, and the
  skill-management rename workflow; disposition skill-management #18 (allowed-tools).
