# Hosts/kernel/extensions/internal sweep resolved; method log started

## Summary

Resolved the "Vocabulary sweep: hosts, kernel, extensions, internal (research)" row.
Per-package inventory with source citations at
`docs/wayfinding/ontology-reshape/vocab-sweep-hosts-kernel-extensions-internal.md`;
new suspects jotted in `ideas.md`. Baseline held: exactly the ten roadmap packages
are tracked; on-disk `hosts/jicc`, `hosts/sdlcc`, and `extensions/flow` are untracked
residue.

Headline findings: the machine-enforced layering meta-vocabulary (a nine-value
`ns.tier` taxonomy with rank-derived layering, debt edges, topology circles, and
internal-space admission in `@internal/typescript-style-guard`) is recorded in no
glossary — strong confirmation of the meta-vocabulary risk hunch, and it gives the
layering grilling row a ground-truth current-state inventory. The repo runs two
package-classification systems (role directories vs tiers) that disagree twice. The
`ns` name is spread across three package identities. Cheap deletions surfaced:
`@nseng-ai/pi-command-surfaces` (duplicate constants, dead dependency edge),
pi-tools' unexported `side-session` subpackage, and the untracked residue dirs.

This update also starts the running method log requested this session, toward a
future portable skill (Fog entry added to `objective.md`).

## Objective Impact

- Two of the four sweep prerequisites for the grilling Frontier are now done; one
  research row remains (infra, capability-kit, tools) before the four grilling rows
  unblock.
- The layering reexamination row gains a concrete anchor: treat the style guard's
  tier config as the enforced current-state ontology and grill against it, rather
  than reconstructing layering from prose.
- Session steer recorded as standing method guidance: sweeps and reexaminations
  should *simplify and clarify*, not just delineate — suspects are framed as
  collapse/retire/delete candidates, and delineation-only glossary work risks
  institutionalizing accretion.

Method log (goals / working / not working):

- **Goal recap**: audit → reshape → document against a deliberately decided
  ontology; glossaries written once at the end; every reshaping a per-row HITL
  decision; simplification over delineation (steer, 2026-07-10).
- **Working**: the drift-audit-first verified baseline makes sweeps mechanical and
  disputes cheap to settle; manifest/export-map mining before source reading finds
  most vocabulary fast (tier metadata alone exposed two classification
  contradictions); weighting suspects toward simplification produced sharper,
  more decision-shaped output than the neutral inventory framing of the first
  sweep; recording row resolutions in roadmap notes keeps the record compact.
- **Not working / tensions**: sweep assets are getting long — the grilling rows
  must consume the Summary/Cross-package-themes sections and `ideas.md`, not the
  raw per-package lists, or the HITL sessions will drown; decision-free fixes are
  accumulating (SDL/ji residue, README pointer drift, dead dep) without a landing
  vehicle even though Scope allows them to land anytime — batch-landing them as a
  small PR after the sweeps finish would clear the noise before grilling starts.

## Follow-Ups

- Resolve the last research row (infra, capability-kit, tools sweep), which
  unblocks all four grilling rows.
- Consider batch-landing the accumulated decision-free drift fixes before the
  grilling phase.
- Keep appending method-log sections to future Semantic Updates; the Fog entry in
  `objective.md` owns the eventual skill-extraction decision.
