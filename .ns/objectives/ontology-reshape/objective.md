---
edges:
  - objective: capability-infrastructure-reorg
    annotation: Receives the implemented capability-infrastructure ownership model, deviations, and evidence from that focused Objective, then incorporates them into this record's broader ontology and documentation closeout.
  - objective: repo-ontology
    annotation: Supersedes this closed standing record; its remaining reconciliation scope and standing non-goals carry over here, and its mined facts live in the effort folder's ideas.md.
  - objective: skill-management-subsystem
    annotation: The layering reshape (ADR 0033, layering-reshape-spec.md item 7) folds the command-backed-skill-registry into areg — recorded input that Objective must consume before reshaping skill surfaces further; the fold landed on trunk (commit 16ea42059).
  - objective: execute-cmux-reshape-spec
    annotation: Execution of the cmux reshape spec (ADR 0034, slices 2–6 plus closeout) was extracted 2026-07-12 to that autoobjective via the handoff vehicle's New-Objective hatch; it closed 2026-07-12, the "Execute the cmux reshape spec" task row is resolved, and the full stack has since merged to trunk.
  - objective: execute-kernel-sdk-rename-spec
    annotation: Owns executing the kernel → sdk rename (ADR 0035, kernel-sdk-rename-spec.md) whose mechanics this record's "Spec the kernel → sdk rename" grilling row ratified 2026-07-12; that row resolves when it closes.
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
Flow, cmux, ...), command surfaces (`ns ...`, `/ns:*`), package identity/topology, and
internal meta-vocabulary (Capability API, Command Face, Domain Core, ...) may all be
renamed, merged, split, or deleted. Every actual change is a per-row HITL decision.

## Scope

- Auditing every `CONTEXT.md`, `CONTEXT-MAP.md`, and related domain-doc claim against
  source, and sweeping the workspace for unrecorded domain language.
- Reexamining the four suspect clusters — CCC/orchestration (resolved: cmux),
  extension/host/kernel layering vocabulary (resolved), the source-control lifecycle
  spread, and review/feedback naming residue — plus whatever further suspects the
  audits surface.
- Deciding a deliberate context decision for every tracked package (authored glossary,
  deliberately thin, or out-of-scope with a revisit trigger — no silent absence).
- Doc edits (`CONTEXT.md`, `CONTEXT-MAP.md`, ADRs) land in place as rows resolve.
  Executing code/product reshapings is Objective work too (decided 2026-07-11): each
  decided reshaping exits its grilling row as a spec, then graduates into execution
  task rows run through the reshaping handoff vehicle
  (`docs/wayfinding/ontology-reshape/reshaping-handoff-vehicle.md`). The roadmap
  reshapes as the work advances — exploration rows spawn the rows their answers make
  specifiable, including execution rows.
- Method: the `domain-modeling` skill's `CONTEXT-FORMAT.md`/`ADR-FORMAT.md` contract
  governs every doc this Objective touches; `grilling` drives the HITL rows.
  `CONTEXT.md` stays a pure glossary — no implementation detail, specs, or task state.
- Sequencing: audit → reshape → document. Decision-free, source-backed drift fixes may
  land at any time.

## Non-Goals

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
internal API language — is decided and carried through: executed via the reshaping
handoff vehicle, deliberately parked with a revisit trigger, or explicitly ruled out
(bar moved 2026-07-11 when execution was incorporated into the Objective). Doc edits
land in place as rows resolve.

## Assumptions and Risks

- **Assumption (re-verified 2026-07-12 against trunk):** the workspace baseline is now
  26 tracked packages under `ts/packages/` role directories and 15 context files (root
  `CONTEXT.md` + 14 package/subpackage contexts). The shrink from the original
  29-package baseline is this Objective's own landed reshaping (pi-command-surfaces
  deleted, command-backed-skill-registry folded into areg, nscc deleted); the original
  `CONTEXT-MAP.md` 26-count drift is resolved — its rewritten Inventory Baseline now
  states 26 with the probe command, matching `git ls-files`.
- **Assumption:** the four chosen suspect clusters cover the worst accretion; the
  vocabulary sweeps partially disproved this by surfacing further suspects (jotted in
  the effort folder's `ideas.md`), which the triage row turns into rows or one-line
  resolutions.
- **Risk (hunch from charting, since confirmed):** the ontology's biggest impurity was
  the describing-language — the meta-vocabulary. The layering reexamination confirmed
  this and carried the most reshaping weight; its decisions (ADR 0033) executed and
  landed on trunk, with the remaining meta-vocabulary residue split into the
  foundation/capability-kit junk-drawer grilling row.
- **Constraint discharged (verified 2026-07-12):** the two cross-initiative
  constraints on the layering reexamination are gone — `cross-harness-parity` closed
  by decision during the CCC/orchestration row, and `extension-descriptor-contract`
  is closed (its `closed.md` is at trunk), which also fires the parked kernel-name
  row's revisit trigger.
- **Risk:** the five remaining open rows are all HITL grilling sessions; progress
  gates on live user availability, and an agent answering its own grill questions has
  broken the row.
- Validation evidence for any row: `dprint` check passes for touched Markdown, and
  source evidence is cited for every inventory/relationship claim.

## Open Questions

Fog — in-scope questions not yet stateable precisely; each graduates into Question
Rows as the Frontier advances, and none is pre-sliced before then:

- **Documentation phase** — the post-reshape doc work: per-package context decisions
  for all 26 packages (the 12 currently without any context, plus the partial
  capability-kit decision — only its graphite subpackage has one — and the pi-tools
  decision), glossary authoring/rewrites, and the final `CONTEXT-MAP.md` rewrite and
  unfamiliar-contributor readback. The landed reshapes already added contexts for
  foundation, ns-pi-subagents, and cmux. Specifiable once the reexamination clusters
  settle; will graduate into per-cluster or per-package rows.
- **Doc-structure changes** — whether the context-doc system itself changes shape:
  whether this record should index `docs/adr/` (41 ADRs, six duplicated numbers —
  treatment undecided), and how ADRs relate to reshaping specs. The
  `@nseng-ai/foundation` single-file-with-anchors question was overtaken by events —
  foundation gained a conventional `CONTEXT.md` when the layering reshape landed.
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

## Closure

Closed 2026-07-20 as substantially completed, remaining frontier deferred.

Outcome: the record's major execution already landed through extracted records — the cmux reshape spec (ADR 0034) executed and merged via `execute-cmux-reshape-spec`; the kernel → sdk rename (ADR 0035) executed via `execute-kernel-sdk-rename-spec`; the layering reshape (ADR 0033) folded the command-backed-skill-registry into areg on trunk. Landed reshapes added CONTEXT docs for foundation, ns-pi-subagents, and cmux. What remains open in the roadmap is ideation frontier — reexamination clusters, doc-structure questions (ADR indexing), post-Objective maintenance ownership, and method extraction — none of it currently being advanced.

Deferred at closure:

- The capability-infrastructure write-back edge is moot for now: `capability-infrastructure-reorg` closes concurrently as deferred before executing its ownership map. If that work resumes, its evidence lands in whatever successor record owns ontology documentation then.
- Post-closure maintenance ownership (the roadmap's open question) is resolved by default: domain-doc sync falls to the standing AGENTS.md/CONTEXT.md drift rules and PR-time habit rather than a successor standing objective.
- The method-extraction ambition (a portable audit → reshape → document skill) remains a candidate for a fresh record; the method log lives in this record's Semantic Updates (from 2026-07-10) and `docs/wayfinding/ontology-reshape/ideas.md` keeps the unmined suspects.

Closure decision made in the 2026-07-20 open-objective portfolio review (reduce concurrent WIP; the extracted execution is done and the remaining frontier is not active work).
