# Anchor the context/ADR format contract to the domain-modeling skill

## Summary

Folded the `domain-modeling` skill (`.agents/skills/domain-modeling/`: `SKILL.md`, `CONTEXT-FORMAT.md`, `ADR-FORMAT.md`) into the Objective as the canonical format authority. The records previously treated "the `grill-with-docs` output shape" as the source of the context format; the skill is the actual owner of the format contract, and grill-me/grill-with-docs are the interview/session *mechanisms* that write to it.

Skill knowledge now reflected in the record:

- **`CONTEXT.md` shape** (`CONTEXT-FORMAT.md`): `# {Context Name}` + one/two-sentence description + `## Language`; each entry is `**Term**:`, a tight one-or-two-sentence definition of what the term *is* (not what it does), and an italic `_Avoid_:` alias list. Be opinionated (pick the canonical word, list the rest under `_Avoid_`); group under subheadings when clusters emerge.
- **Glossary-only rule**: `CONTEXT.md` must stay devoid of implementation details, specs, and scratch notes — "a glossary and nothing else" — and should only hold terms unique to that context, not general programming concepts.
- **`CONTEXT-MAP.md` shape**: a Contexts list plus Relationships.
- **ADR shape** (`ADR-FORMAT.md`): `docs/adr/` with sequential `NNNN-slug.md` numbering, a one-to-three-sentence body, optional Status/Considered Options/Consequences only when they add value. The three-criteria authoring bar (hard to reverse, surprising without context, real trade-off) the Objective already used matches the skill exactly.

## Objective Impact

- **Assumptions**: the "format" assumption bullet was rewritten from "the `grill-with-docs` output shape remains the right context format" to name the `domain-modeling` skill (`CONTEXT-FORMAT.md` / `ADR-FORMAT.md`) as the canonical contract, with the mechanism-vs-format distinction made explicit.
- **Scope**: the adjacent-Objective acceptance contract now points at the skill's `## Language` + `_Avoid_:` + Relationships shape rather than restating an ad hoc format.
- **Definition of Progress**: the "do not keep" list gained two skill-derived guards — no implementation details/specs/scratch in a `CONTEXT.md` (glossary only), and no general programming concepts (project-specific terms only).
- No closure; this sharpens the format contract, it does not change the package inventory or sweep status.

## Follow-Ups

- **Finding (drift surfaced, not fixed):** the `_Avoid_` alias marker renders inconsistently across landed contexts. The skill's canonical token is `_Avoid_:`; most contexts (e.g. `brmem`) use `*Avoid*:` (asterisk-italic — renders identically, cosmetic only), but `ts/packages/roaster/CONTEXT.md` uses plain `Avoid:` (not italic). Per repo policy this drift is reported, not silently corrected; normalize roaster's marker in a future focused context session rather than as incidental work.
- Consider a single map pointer to the `domain-modeling` skill (or to `docs/adr/`) during the final `CONTEXT-MAP.md` readback so contributors can find the format contract from the map. Folds into the existing final-readback row's ADR-pointer question.
- The undecided-packages decision row and the five Planned package contexts remain; they should be authored against the now-explicit `domain-modeling` format.
