# Roadmap

Every row is a typed Question Row (research / grilling / prototype / task) per the
ideation pattern; rows are unordered beyond their blocked-by references, and the
Frontier is the open, unblocked rows. Grilling rows are HITL and resolve only through
live exchange with the user. Assets link from row notes and live in
`docs/wayfinding/ontology-reshape/`.

## Work

- [x] Drift audit of existing context files (research)
  - Question: For each of the 13 present context files (root `CONTEXT.md` + 12 package
    `CONTEXT.md`) and `CONTEXT-MAP.md` itself, which claims no longer match checked-in
    source? Verify inventory counts, package names/paths, term definitions,
    relationship edges, and `Avoid` lists against the workspace.
  - Resolved 2026-07-10: per-file report with source evidence at
    `docs/wayfinding/ontology-reshape/drift-audit.md`, audited against a verified
    baseline of 29 tracked packages and 13 context files. Clean: root `CONTEXT.md`,
    flow, handoffs, plans, reviews, slots, brmem. Drifted: `CONTEXT-MAP.md` (4 wrong —
    26→29 package count, "thirteen package context files"→twelve, missing
    `@internal/ns-dev` exception, phantom `@nseng-ai/flow-pi`); ccc (retired
    `/ns:objective:stack-impl` term and citation, wrong subpackage list,
    worktree-status/Graphite-status ownership actually in hosts/pi); kernel and
    capability-kit/graphite (retired `@ns/` scope throughout — decision-free fix);
    objectives (nonexistent `command-face` export, undercounted exec roster, EDGES
    column position); branch-context (Presentation Boundary — the capability's own
    `pi` subpackage now owns command names and registration); hosts/pi (export-map
    family enumeration omits `worktree-status`, `worktree-status/extension`,
    `skills/lookup`). The worktree-status ownership contradiction feeds the CCC
    reexamination; the reviews tier-vs-"Capability" wording note feeds the
    review/feedback residue reexamination.
- [x] Vocabulary sweep: capabilities (research)
  - Question: What domain language lives in `ts/packages/capabilities/*` (12 packages:
    branch-context, ccc, flow, handoffs, harness-artifacts, ns-init, objectives,
    plans, pr-feedback, retros, reviews, slots) that no context file records? Sweep
    exported types, command surfaces, and README/docs for candidate terms; note
    especially the packages with no context at all (pr-feedback, retros,
    harness-artifacts, ns-init). Produce a per-package candidate-term inventory with
    source citations as a linked asset.
  - Resolved 2026-07-10: per-package inventory with source citations at
    `docs/wayfinding/ontology-reshape/vocab-sweep-capabilities.md`. The four
    context-less packages each carry 10+ unrecorded domain-bearing terms; all eight
    glossaried packages have unrecorded clusters (largest: objectives' runner
    vocabulary, reviews' convergence layer, flow's checkpoint/phase-stream/land
    vocabulary, ccc's dispatch family). New suspects beyond the four clusters jotted
    in `ideas.md` — notably a candidate fifth cluster (plan-authoring ownership /
    enriched-plan residue across plans and branch-context) and a shipped
    `create:wayfinding` surface contradicting the root glossary's Avoid alias —
    partially disproving the "four clusters cover the worst accretion" assumption;
    row creation deferred to the triage row. Feeds confirmed for existing rows: CCC
    (subpackage/worktree-status drift, dispatch vocabulary), review/feedback residue
    (Address vs pr-feedback, doc-side Roaster).
- [x] Vocabulary sweep: hosts, kernel, extensions, internal (research)
  - Question: What domain language lives in `ts/packages/hosts/*`
    (command-backed-skill-registry, ns-cli, nscc, pi, pi-command-surfaces),
    `ts/packages/kernel/`, `ts/packages/extensions/*` (ns-pi-subagents), and
    `ts/packages/internal/*` (ns-dev, pi-tools, typescript-style-guard) that no
    context file records? Only pi and kernel have contexts today; several of these
    packages are absent from `CONTEXT-MAP.md` entirely. Produce a per-package
    candidate-term inventory with source citations as a linked asset.
  - Resolved 2026-07-10: per-package inventory with source citations at
    `docs/wayfinding/ontology-reshape/vocab-sweep-hosts-kernel-extensions-internal.md`,
    suspects weighted toward simplification per session steer. Headliners: the
    machine-enforced nine-tier `ns.tier` layering taxonomy in
    `@internal/typescript-style-guard` is recorded in no glossary (ground-truth
    anchor for the layering grilling row, confirming the meta-vocabulary risk
    hunch); role directories and tiers disagree twice (pi-command-surfaces,
    ns-pi-subagents); the `ns` name spans three package identities
    (kernel / @nseng-ai/ns / nscc); deletion quick wins found
    (pi-command-surfaces duplicate-constants package with a dead dependency edge,
    pi-tools' unexported `side-session`, untracked `jicc`/`sdlcc`/`extensions/flow`
    dirs). New suspects jotted in `ideas.md`. Semantic update:
    `updates/2026-07-10-hosts-kernel-sweep-and-method-notes.md` (also starts the
    method log toward a future skill).
- [x] Vocabulary sweep: infra, capability-kit, tools (research)
  - Question: What domain language lives in `ts/packages/infra/*` (brmem, clinkr,
    foundation), `ts/packages/capability-kit/` (kit level — only its graphite
    subpackage has a context), and `ts/packages/tools/*` (areg, packagechk, vibechk)
    that no context file records? Produce a per-package candidate-term inventory with
    source citations as a linked asset.
  - Resolved 2026-07-10: per-package inventory with source citations at
    `docs/wayfinding/ontology-reshape/vocab-sweep-infra-capability-kit-tools.md`,
    suspects weighted toward simplification. Headliners: the exec seam contradicts
    the root glossary three ways (contract and real spawning adapter live in
    foundation, not capability-kit; live name `CommandExecApi`, not the glossary's
    `ExecGateway`), and the style guard's brmem→capability-kit debt edge reason
    records gateway placement as "not finalized" — prime layering-row input; the
    workspace's two most-imported packages (foundation, clinkr) have no context and
    no README while the leaf tools are well documented; name-collision suspects
    (`model-slug` twice, "registry" ×4, "runner" ×4) and a pattern of unglossaried
    brand names (clinkr, areg, nscc). Nine untracked husk dirs under
    `ts/packages/infra/` document the absorbed standalone-infra split. New suspects
    jotted in `ideas.md`. This was the last research row: all four grilling rows are
    now unblocked. Semantic update:
    `updates/2026-07-10-infra-kit-tools-sweep-completes-research-phase.md`.
- [ ] Reexamine CCC and the orchestration layer (grilling)
  - Blocked by: Drift audit of existing context files; Vocabulary sweep: capabilities;
    Vocabulary sweep: hosts, kernel, extensions, internal; Vocabulary sweep: infra,
    capability-kit, tools.
  - Question: Is CCC ("Cmux Command and Control") a real domain concept or an
    accretion? It owns cmux/workspace orchestration, worktree-status observability,
    landing policy, and public surfaces like `/objective:stack-impl` — a grab-bag
    whose boundary took paragraphs to describe in the old `CONTEXT-MAP.md`. Decide
    what the orchestration layer *is*, what it should be named, what belongs in it
    versus in the capabilities it composes, and spec any resulting renames/moves.
- [x] Reexamine extension, host, and kernel layering vocabulary (grilling)
  - Blocked by: Drift audit of existing context files; Vocabulary sweep: capabilities;
    Vocabulary sweep: hosts, kernel, extensions, internal; Vocabulary sweep: infra,
    capability-kit, tools.
  - Question: The layering meta-vocabulary — kernel, host, extension, capability,
    Capability Kit, Capability API, Command Face, consumer/provider, tier, "extension
    API" (already banned as anti-vocabulary) — is large and partly self-inflicted.
    What is the minimal, clear vocabulary for how code is layered, does the package
    topology (role directories, `@internal` space, unscoped `nscc`, hosts like
    pi-command-surfaces and command-backed-skill-registry) express it, and what
    renames/merges would make the layering legible? Spec resulting changes.
  - Resolved 2026-07-11: thirteen ratified decisions, recorded as ADR 0033 and the
    execution spec `docs/wayfinding/ontology-reshape/layering-reshape-spec.md`.
    Headliners: `ns.tier` is canonical with role directories as a guard-enforced
    projection (four mismatches dispositioned — pi-command-surfaces deleted, reviews
    and ns-dev retiered, ns-pi-subagents into internal space); taxonomy trimmed nine →
    seven tiers; DI Seam vs Gateway distinction canonized with `CommandExecApi`
    winning and `ExecGateway` retired; brmem made honestly Neutral Infra via git-seam
    relocation to foundation (debt edge deleted); command-backed-skill-registry folded
    into areg (Objective Edge to `skill-management-subsystem` records the input);
    `hosts/ns-cli` → `hosts/ns` with the checkout-free pair glossaried; 45 residue
    directories slated for deletion. Kernel rename parked (see Parked). Code-independent
    glossary edits landed in place; code-coupled edits ride the executing PRs per the
    spec. Semantic update: `updates/2026-07-11-layering-reshape-decisions.md`.
- [ ] Reexamine foundation domain residue and the capability-kit junk drawer (grilling)
  - Graduated 2026-07-11 from the layering row's leftovers (was Fog-adjacent sweep
    material, now specifiable).
  - Question: Foundation carries domain-smelling vocabulary below the SDK
    (`terminal/runner-usage`, `terminal/terminal-presentation`,
    `primitives/skill-lookup`) and a one-module `config` subpackage; capability-kit's
    `kit` subpackage is a ~19-subpath junk drawer of checkpoint/slug/text-gen/shell/
    xdg/brmem concerns; Machine Envelope is constructed in clinkr and parsed in
    foundation with no recorded seam; checkpoint vocabulary spans kit and flow. What
    moves up, what collapses, what is `kit`, and who owns Machine Envelope? Spec
    resulting changes.
- [ ] Batch-name the unglossaried brands (grilling)
  - Graduated 2026-07-11 from the layering row (sweep pattern: deferred-to vocabulary
    that does not exist).
  - Question: `clinkr` and `areg` are bins/packages whose name expansions are recorded
    nowhere — the root glossary even defers to "areg vocabulary" that does not exist.
    Decide each expansion (or decide the name is opaque-by-design and record that),
    and where brand-name expansions live. `nscc` is excluded — it belongs to the
    CCC/orchestration row.
- [ ] Decide the reshaping handoff vehicle (grilling)
  - Graduated 2026-07-11 from the "Reshaping handoff vehicle" Fog: the first reshaping
    spec now exists (`layering-reshape-spec.md`), which was that Fog's stated
    graduation trigger.
  - Question: How do decided reshapings get executed after this Objective — new
    objectives, branch-context plans, or direct implementation sessions — and what
    must a spec asset contain to hand off cleanly? Judge against the live example:
    the layering spec's ten execution items.
  - Evidence (2026-07-11): a same-session direct-implementation pass on the layering
    spec's batch one was started (items 1, 2 validated green as stacked slices) and
    rolled back by user steer; the spec now carries the intended implementation
    order (items 1 → 10) plus the scope facts that attempt surfaced. Input for this
    row's vehicle decision.
  - Evidence (2026-07-11, second): the full spec (items 1–10) executed via the
    saved-plan vehicle — a ratified enriched plan implemented in one session as nine
    local stacked slices, `just` green per slice, user-run pause point for the
    residue deletion. Experience report (what the spec got right, where ground truth
    moved, one mechanical hazard) in
    `updates/2026-07-11-layering-reshape-executed.md`.
- [ ] Reexamine the source-control lifecycle spread (grilling)
  - Blocked by: Drift audit of existing context files; Vocabulary sweep: capabilities;
    Vocabulary sweep: hosts, kernel, extensions, internal; Vocabulary sweep: infra,
    capability-kit, tools.
  - Question: The source-control lifecycle vocabulary — Flow, land, autobranch,
    submit, changes/cp, slot gt, Graphite mechanics — is spread across flow, ccc,
    slots, and capability-kit/graphite with boundaries the old `CONTEXT-MAP.md`
    needed paragraphs to state. What is the clear ontology of the branch/PR lifecycle
    (what are the real nouns and verbs, and who owns each), and what renames/moves
    would let one sentence describe each boundary? Spec resulting changes.
- [ ] Reexamine review and feedback naming residue (grilling)
  - Blocked by: Drift audit of existing context files; Vocabulary sweep: capabilities;
    Vocabulary sweep: hosts, kernel, extensions, internal; Vocabulary sweep: infra,
    capability-kit, tools.
  - Question: The review/feedback domain carries rename residue: package `reviews`
    but engine name Roaster; package `pr-feedback` but command face `ns address exec`
    and "Address" vocabulary; Tripwires, deep reviews, findings, findings comments
    versus GitHub review threads. What are the canonical names for the review engine,
    the PR-feedback surface, and their artifacts — and should the residue names be
    retired outright? Spec resulting changes.
- [ ] Triage remaining ambiguity clusters (grilling)
  - Blocked by: Reexamine CCC and the orchestration layer; Reexamine extension, host,
    and kernel layering vocabulary; Reexamine the source-control lifecycle spread;
    Reexamine review and feedback naming residue.
  - Question: Of the old map's flagged ambiguities not consumed by the four cluster
    reexaminations — State/status, Active/root, Branch/ref/start-point/snapshot-ref,
    Evidence/finding, Plan/attachment/handoff, Skill/agent/resource,
    Run/evaluation/metric — which still exist after the reshaping decisions, and which
    need their own reexamination rows versus a one-line resolution recorded during the
    documentation phase? Create the resulting rows and graduate the
    documentation-phase Fog.

## Parked

- [ ] Decide the `@nseng-ai/kernel` name: commit to the kernel brand or rename to
      SDK/host/loader language (grilling)
  - Parked 2026-07-11 by user decision during the layering grilling row. Revisit
    trigger: the `extension-descriptor-contract` Objective closes (the name anchors
    its public author contract — `@nseng-ai/kernel/sdk` imports, folded
    `@nseng-ai/ns/kernel/*` subpaths, `kernel/docs/writing-an-ns-extension.md`).
    Until then, no new kernel-brand prose (no glossary entry committing to the OS
    analogy) so the decision stays cheap in both directions. Evidence for the session:
    ideas.md "kernel name/analogy under user skepticism" plus ADR 0033 §7.
