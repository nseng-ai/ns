# Ontology Reshape

Wayfinder map. Tracker conventions: `docs/agents/issue-tracker.md` ("Wayfinding
operations").

## Destination

Every `CONTEXT.md` and `CONTEXT-MAP.md` claim matches checked-in reality and every
tracked package carries a deliberate context decision (authored glossary, deliberately
thin, or out-of-scope with a revisit trigger — no silent absence); every
ontology-reshaping candidate — product vocabulary, command surfaces, package topology,
internal API language — is decided: specced for handoff or explicitly ruled out. Doc
edits land in place as tickets resolve; code/product reshaping leaves the map as decided
specs, not landed changes.

## Notes

- Skills: `domain-modeling` (`.agents/skills/domain-modeling/` — its
  `CONTEXT-FORMAT.md`/`ADR-FORMAT.md` contract governs every doc this map touches) and
  `grilling` for HITL tickets. `CONTEXT.md` stays a pure glossary — no implementation
  detail, specs, or task state.
- Execution override: documentation edits (`CONTEXT.md`, `CONTEXT-MAP.md`, ADRs) are
  carried into the map and land in place as tickets resolve. Product/code reshaping
  stays planning — each decided reshaping exits as a spec; the handoff vehicle is fog.
- Everything is on the table: product terms (Objective, Slot, Handoff, Branch Memory,
  Flow, CCC, ...), command surfaces (`ns ...`, `/ns:*`), package identity/topology, and
  internal meta-vocabulary (Capability API, Command Face, Domain Core, ...) may all be
  renamed, merged, split, or deleted. Every actual change is a per-ticket HITL decision.
- Sequencing: audit → reshape → document. Glossaries are written once, against the
  reshaped ontology. Decision-free, source-backed drift fixes may land at any time.
- This map supersedes the closed `repo-ontology` objective
  (`.ns/objectives/repo-ontology/`). Its non-goals carry over as standing rules: no
  documentation generators/linters/registries/schemas; no auto-generated glossaries
  (source scans are evidence, humans choose vocabulary); never recreate retired
  identities (Python `packages/*` paths, `asdl-*`/`@sdl/*`/`@ns/*` scopes, retired
  standalone packages, pre-ADR-0029 npm names `core`/`objective`/`slot`/`handoff`/
  `address`/`aretro`/`roaster`).
- Baseline facts (verify, don't trust): 29 tracked packages under `ts/packages/` role
  directories; 13 context files (root `CONTEXT.md` + 12 package contexts);
  `CONTEXT-MAP.md` Inventory Baseline still claims 26 packages. Mined detail from
  `repo-ontology` lives in [ideas.md](./ideas.md).
- Validation: `dprint` check for touched Markdown; source evidence cited for every
  inventory/relationship claim.

## Decisions so far

- [Drift audit of existing context files](#drift-audit-of-existing-context-files):
  7 of 13 context files are drift-free; drift concentrates in `CONTEXT-MAP.md`
  (inventory undercount, phantom `flow-pi`), ccc (retired stack-impl surface,
  worktree-status ownership now in hosts/pi), kernel + capability-kit/graphite
  (retired `@ns/` scope throughout), objectives, branch-context, and pi. Full report:
  [drift-audit.md](./drift-audit.md).

## Not yet specified

- **Documentation phase** — the post-reshape doc work: per-package context decisions
  for all 29 packages (the 17 currently without contexts, plus the partial
  capability-kit and pi-tools decisions), glossary authoring/rewrites, and the final
  `CONTEXT-MAP.md` rewrite and unfamiliar-contributor readback. Specifiable once the
  reexamination clusters settle; will graduate into per-cluster or per-package tickets.
- **Reshaping handoff vehicle** — how decided reshapings get executed after the map:
  new objectives, branch-context plans, or direct implementation sessions; and what a
  "spec" asset must contain to hand off cleanly. Decide when the first reshaping
  decision exists.
- **Doc-structure changes** — whether the context-doc system itself changes shape: the
  map's format, `@nseng-ai/foundation` single-file-with-anchors question, whether the
  map should index `docs/adr/` (36 ADRs, five duplicated numbers — treatment undecided),
  and how ADRs relate to reshaping specs.
- **Post-map maintenance ownership** — `repo-ontology` was a standing objective; this
  map is bounded. Who or what keeps domain docs synced after this map closes (successor
  objective, PR-time habit, periodic re-grill) must be decided near the end.
- **Further suspects** — product-level term suspects beyond the four chosen clusters
  that the audits may surface (candidates already jotted in [ideas.md](./ideas.md)).

## Out of scope

- **Executing code/product reshapings** — the destination is decided specs; landing
  renames/refactors happens beyond this map's edge, via the handoff vehicle.
- **Recreating retired identities** — Python package paths, retired scopes/packages,
  pre-ADR-0029 npm names; inherited from `repo-ontology`'s non-goals.
- **Documentation tooling** — no generators, linters, registries, frontmatter schemas,
  or hidden state; Markdown contexts and this map are the contract.

## Tickets

### Drift audit of existing context files

- type: research
- status: closed

**Question:** For each of the 13 present context files (root `CONTEXT.md` + 12 package
`CONTEXT.md`) and `CONTEXT-MAP.md` itself, which claims no longer match checked-in
source? Verify inventory counts, package names/paths, term definitions, relationship
edges, and `Avoid` lists against the workspace. Produce a per-file drift report
(verified / stale / wrong, each with source evidence) as a linked asset in this folder.

**Resolution:** Per-file report with source evidence at
[drift-audit.md](./drift-audit.md), audited against a verified baseline of 29 tracked
packages and 13 context files. Clean: root `CONTEXT.md`, flow, handoffs, plans,
reviews, slots, brmem. Drifted: `CONTEXT-MAP.md` (4 wrong — 26→29 package count,
"thirteen package context files"→twelve, missing `@internal/ns-dev` exception, phantom
`@nseng-ai/flow-pi`); ccc (retired `/ns:objective:stack-impl` term and citation, wrong
subpackage list, worktree-status/Graphite-status ownership actually in hosts/pi);
kernel and capability-kit/graphite (retired `@ns/` scope throughout — decision-free
fix); objectives (nonexistent `command-face` export, undercounted exec roster, EDGES
column position); branch-context (Presentation Boundary — the capability's own `pi`
subpackage now owns command names and registration); hosts/pi (export-map family
enumeration omits `worktree-status`, `worktree-status/extension`, `skills/lookup`).
The worktree-status ownership contradiction feeds the CCC reexamination; the
reviews tier-vs-"Capability" wording note feeds the review/feedback residue
reexamination.

### Vocabulary sweep: capabilities

- type: research
- status: open

**Question:** What domain language lives in `ts/packages/capabilities/*` (12 packages:
branch-context, ccc, flow, handoffs, harness-artifacts, ns-init, objectives, plans,
pr-feedback, retros, reviews, slots) that no context file records? Sweep exported types,
command surfaces, and README/docs for candidate terms; note especially the packages with
no context at all (pr-feedback, retros, harness-artifacts, ns-init). Produce a
per-package candidate-term inventory with source citations as a linked asset.

### Vocabulary sweep: hosts, kernel, extensions, internal

- type: research
- status: open

**Question:** What domain language lives in `ts/packages/hosts/*` (command-backed-
skill-registry, ns-cli, nscc, pi, pi-command-surfaces), `ts/packages/kernel/`,
`ts/packages/extensions/*` (ns-pi-subagents), and `ts/packages/internal/*` (ns-dev,
pi-tools, typescript-style-guard) that no context file records? Only pi and kernel have
contexts today; several of these packages are absent from the map entirely. Produce a
per-package candidate-term inventory with source citations as a linked asset.

### Vocabulary sweep: infra, capability-kit, tools

- type: research
- status: open

**Question:** What domain language lives in `ts/packages/infra/*` (brmem, clinkr,
foundation), `ts/packages/capability-kit/` (kit level — only its graphite subpackage has
a context), and `ts/packages/tools/*` (areg, packagechk, vibechk) that no context file
records? Produce a per-package candidate-term inventory with source citations as a
linked asset.

### Reexamine CCC and the orchestration layer

- type: grilling
- status: open
- blocked by: [Drift audit of existing context files](#drift-audit-of-existing-context-files),
  [Vocabulary sweep: capabilities](#vocabulary-sweep-capabilities),
  [Vocabulary sweep: hosts, kernel, extensions, internal](#vocabulary-sweep-hosts-kernel-extensions-internal),
  [Vocabulary sweep: infra, capability-kit, tools](#vocabulary-sweep-infra-capability-kit-tools)

**Question:** Is CCC ("Cmux Command and Control") a real domain concept or an
accretion? It owns cmux/workspace orchestration, worktree-status observability, landing
policy, and public surfaces like `/objective:stack-impl` — a grab-bag whose boundary
took paragraphs to describe in the old map. Decide what the orchestration layer *is*,
what it should be named, what belongs in it versus in the capabilities it composes, and
spec any resulting renames/moves.

### Reexamine extension, host, and kernel layering vocabulary

- type: grilling
- status: open
- blocked by: [Drift audit of existing context files](#drift-audit-of-existing-context-files),
  [Vocabulary sweep: capabilities](#vocabulary-sweep-capabilities),
  [Vocabulary sweep: hosts, kernel, extensions, internal](#vocabulary-sweep-hosts-kernel-extensions-internal),
  [Vocabulary sweep: infra, capability-kit, tools](#vocabulary-sweep-infra-capability-kit-tools)

**Question:** The layering meta-vocabulary — kernel, host, extension, capability,
Capability Kit, Capability API, Command Face, consumer/provider, tier, "extension API"
(already banned as anti-vocabulary) — is large and partly self-inflicted. What is the
minimal, clear vocabulary for how code is layered, does the package topology (role
directories, `@internal` space, unscoped `nscc`, hosts like pi-command-surfaces and
command-backed-skill-registry) express it, and what renames/merges would make the
layering legible? Spec resulting changes.

### Reexamine the source-control lifecycle spread

- type: grilling
- status: open
- blocked by: [Drift audit of existing context files](#drift-audit-of-existing-context-files),
  [Vocabulary sweep: capabilities](#vocabulary-sweep-capabilities),
  [Vocabulary sweep: hosts, kernel, extensions, internal](#vocabulary-sweep-hosts-kernel-extensions-internal),
  [Vocabulary sweep: infra, capability-kit, tools](#vocabulary-sweep-infra-capability-kit-tools)

**Question:** The source-control lifecycle vocabulary — Flow, land, autobranch,
submit, changes/cp, slot gt, Graphite mechanics — is spread across flow, ccc, slots, and
capability-kit/graphite with boundaries the old map needed paragraphs to state. What is
the clear ontology of the branch/PR lifecycle (what are the real nouns and verbs, and
who owns each), and what renames/moves would let one sentence describe each boundary?
Spec resulting changes.

### Reexamine review and feedback naming residue

- type: grilling
- status: open
- blocked by: [Drift audit of existing context files](#drift-audit-of-existing-context-files),
  [Vocabulary sweep: capabilities](#vocabulary-sweep-capabilities),
  [Vocabulary sweep: hosts, kernel, extensions, internal](#vocabulary-sweep-hosts-kernel-extensions-internal),
  [Vocabulary sweep: infra, capability-kit, tools](#vocabulary-sweep-infra-capability-kit-tools)

**Question:** The review/feedback domain carries rename residue: package `reviews` but
engine name Roaster; package `pr-feedback` but command face `ns address exec` and
"Address" vocabulary; Tripwires, deep reviews, findings, findings comments versus GitHub
review threads. What are the canonical names for the review engine, the PR-feedback
surface, and their artifacts — and should the residue names be retired outright? Spec
resulting changes.

### Triage remaining ambiguity clusters

- type: grilling
- status: open
- blocked by: [Reexamine CCC and the orchestration layer](#reexamine-ccc-and-the-orchestration-layer),
  [Reexamine extension, host, and kernel layering vocabulary](#reexamine-extension-host-and-kernel-layering-vocabulary),
  [Reexamine the source-control lifecycle spread](#reexamine-the-source-control-lifecycle-spread),
  [Reexamine review and feedback naming residue](#reexamine-review-and-feedback-naming-residue)

**Question:** Of the old map's flagged ambiguities not consumed by the four cluster
reexaminations — State/status, Active/root, Branch/ref/start-point/snapshot-ref,
Evidence/finding, Plan/attachment/handoff, Skill/agent/resource, Run/evaluation/metric —
which still exist after the reshaping decisions, and which need their own reexamination
tickets versus a one-line resolution recorded during the documentation phase? Create the
resulting tickets and graduate the documentation-phase fog.
