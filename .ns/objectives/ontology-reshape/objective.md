---
edges:
  - objective: repo-ontology
    annotation: Supersedes this closed standing record; its remaining reconciliation scope and standing non-goals carry over here, and its mined facts live in the effort folder's ideas.md.
---

# Ontology Reshape

Wayfinding (ideation) Objective, packaged 2026-07-10 from the wayfinder map formerly
at `docs/wayfinding/ontology-reshape/map.md`. The record is deliberately held in the
formation phase: the roadmap is a Frontier of typed Question Rows, and questions not
yet stateable stay as Fog under `## Open Questions`. Assets produced while resolving
rows live in `docs/wayfinding/ontology-reshape/` and are linked from row notes.

## Thesis

The repo's domain-language documentation has drifted from checked-in reality, and the
ontology it describes has accreted: product vocabulary, command surfaces, package
topology, and internal meta-vocabulary all carry residue from successive renames and
absorptions. Rather than patching glossaries against a shifting target, this Objective
finds the way — audit → reshape → document — to a deliberately decided ontology:
glossaries are written once, against the reshaped ontology.

Everything is on the table: product terms (Objective, Slot, Handoff, Branch Memory,
Flow, CCC, ...), command surfaces (`ns ...`, `/ns:*`), package identity/topology, and
internal meta-vocabulary (Capability API, Command Face, Domain Core, ...) may all be
renamed, merged, split, or deleted. Every actual change is a per-row HITL decision.

## Scope

- Auditing every `CONTEXT.md`, `CONTEXT-MAP.md`, and related domain-doc claim against
  source, and sweeping the workspace for unrecorded domain language.
- Reexamining the four suspect clusters — CCC/orchestration, extension/host/kernel
  layering vocabulary, the source-control lifecycle spread, and review/feedback naming
  residue — plus whatever further suspects the audits surface.
- Deciding a deliberate context decision for every tracked package (authored glossary,
  deliberately thin, or out-of-scope with a revisit trigger — no silent absence).
- Execution override for documentation only: doc edits (`CONTEXT.md`,
  `CONTEXT-MAP.md`, ADRs) land in place as rows resolve. Product/code reshaping stays
  planning — each decided reshaping exits as a spec; the handoff vehicle is Fog.
- Method: the `domain-modeling` skill's `CONTEXT-FORMAT.md`/`ADR-FORMAT.md` contract
  governs every doc this Objective touches; `grilling` drives the HITL rows.
  `CONTEXT.md` stays a pure glossary — no implementation detail, specs, or task state.
- Sequencing: audit → reshape → document. Decision-free, source-backed drift fixes may
  land at any time.

## Non-Goals

- **Executing code/product reshapings** — the destination is decided specs; landing
  renames/refactors happens beyond this Objective's edge, via the handoff vehicle.
- **Recreating retired identities** (inherited from `repo-ontology`'s non-goals as
  standing rules): Python `packages/*` paths, `asdl-*`/`@sdl/*`/`@ns/*` scopes,
  retired standalone packages, pre-ADR-0029 npm names
  `core`/`objective`/`slot`/`handoff`/`address`/`aretro`/`roaster`.
- **Documentation tooling** — no generators, linters, registries, frontmatter schemas,
  or hidden state; no auto-generated glossaries (source scans are evidence, humans
  choose vocabulary). Markdown contexts and this record are the contract.

## Completion Criteria

Every `CONTEXT.md` and `CONTEXT-MAP.md` claim matches checked-in reality and every
tracked package carries a deliberate context decision (authored glossary, deliberately
thin, or out-of-scope with a revisit trigger — no silent absence); every
ontology-reshaping candidate — product vocabulary, command surfaces, package topology,
internal API language — is decided: specced for handoff or explicitly ruled out. Doc
edits land in place as rows resolve; code/product reshaping leaves this Objective as
decided specs, not landed changes.

## Assumptions and Risks

- **Assumption (verified 2026-07-10 by the drift audit):** the workspace baseline is
  29 tracked packages under `ts/packages/` role directories and 13 context files (root
  `CONTEXT.md` + 12 package contexts). `CONTEXT-MAP.md`'s Inventory Baseline still
  claims 26 packages — known drift, cataloged in the audit report.
- **Assumption:** the four chosen suspect clusters cover the worst accretion; the
  vocabulary sweeps may disprove this by surfacing further suspects (jotted in the
  effort folder's `ideas.md`), which would widen the reexamination phase.
- **Risk (hunch from charting):** the ontology's biggest impurity is the
  describing-language — the meta-vocabulary — not the domain nouns. If true, the
  layering reexamination carries the most reshaping weight and may need to be split.
- **Risk (cross-initiative constraint):** `cross-harness-parity` ("Pi is additive,
  never canonical") and `extension-descriptor-contract` (typed descriptor modules) are
  live initiatives whose direction constrains the layering reexamination; read their
  orientations before that grilling row, and treat conflicts as decisions to surface,
  not silently resolve.
- **Risk:** four of the remaining rows are HITL grilling sessions; progress gates on
  live user availability, and an agent answering its own grill questions has broken
  the row.
- Validation evidence for any row: `dprint` check passes for touched Markdown, and
  source evidence is cited for every inventory/relationship claim.

## Open Questions

Fog — in-scope questions not yet stateable precisely; each graduates into Question
Rows as the Frontier advances, and none is pre-sliced before then:

- **Documentation phase** — the post-reshape doc work: per-package context decisions
  for all 29 packages (the 17 currently without contexts, plus the partial
  capability-kit and pi-tools decisions), glossary authoring/rewrites, and the final
  `CONTEXT-MAP.md` rewrite and unfamiliar-contributor readback. Specifiable once the
  reexamination clusters settle; will graduate into per-cluster or per-package rows.
- **Reshaping handoff vehicle** — how decided reshapings get executed after this
  Objective: new objectives, branch-context plans, or direct implementation sessions;
  and what a "spec" asset must contain to hand off cleanly. Decide when the first
  reshaping decision exists.
- **Doc-structure changes** — whether the context-doc system itself changes shape: the
  `@nseng-ai/foundation` single-file-with-anchors question, whether this record should
  index `docs/adr/` (36 ADRs, five duplicated numbers — treatment undecided), and how
  ADRs relate to reshaping specs.
- **Post-Objective maintenance ownership** — `repo-ontology` was a standing objective;
  this record is bounded. Who or what keeps domain docs synced after this closes
  (successor objective, PR-time habit, periodic re-grill) must be decided near the
  end.
- **Further suspects** — product-level term suspects beyond the four chosen clusters
  that the audits may surface (candidates already jotted in
  `docs/wayfinding/ontology-reshape/ideas.md`).
- **Method extraction** — a running method log (goals, what is working, what is not)
  accumulates in this record's Semantic Updates (started 2026-07-10) with the stated
  intention of distilling a portable skill for the audit → reshape → document method.
  What the skill's shape and boundaries are becomes specifiable once the grilling
  rows have exercised the method end to end; decide near Crystallization.
