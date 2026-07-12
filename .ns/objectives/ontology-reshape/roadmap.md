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
- [x] Reexamine CCC and the orchestration layer (grilling)
  - Blocked by: Drift audit of existing context files; Vocabulary sweep: capabilities;
    Vocabulary sweep: hosts, kernel, extensions, internal; Vocabulary sweep: infra,
    capability-kit, tools.
  - Question: Is CCC ("Cmux Command and Control") a real domain concept or an
    accretion? It owns cmux/workspace orchestration, worktree-status observability,
    landing policy, and public surfaces like `/objective:stack-impl` — a grab-bag
    whose boundary took paragraphs to describe in the old `CONTEXT-MAP.md`. Decide
    what the orchestration layer *is*, what it should be named, what belongs in it
    versus in the capabilities it composes, and spec any resulting renames/moves.
  - Resolved 2026-07-11: CCC is an accretion; the package becomes the cmux
    capability. Nine ratified decisions recorded as ADR 0034 and the execution spec
    `docs/wayfinding/ontology-reshape/cmux-reshape-spec.md`. Headliners: strong-form
    rename `@nseng-ai/ccc` → `@nseng-ai/cmux` with CCC retired as anti-vocabulary
    (no aliases); flow-facade residue deleted (`./land`/`./trunk-pull`/`./autoslot`
    shims); standalone `ccc` bin deleted with its one command re-homed as
    `ns cmux exec workspace-summary` via kernel extension descriptor; Pi surfaces
    `/ns:ccc:*` → `/ns:cmux:*`; skills renamed `ns-cmux-*`; handoffs re-mints
    `ns:cmux:handoff-tab`; `capability-kit/cmux` stays as the neutral substrate;
    worktree-status vocabulary re-homed to `hosts/pi`. No dispatch CLI parity built
    here — `cross-harness-parity` closed by decision alongside, its remaining goals
    released to the future e2e-docs effort. The earlier `nscc` deletion
    (`updates/2026-07-11-nscc-deletion-disposition.md`) was this row's other
    disposition. Semantic update:
    `updates/2026-07-11-ccc-to-cmux-reshape-decided.md`.
- [x] Execute the cmux reshape spec (task)
  - Graduated 2026-07-11 from the CCC/orchestration grilling row per the reshaping
    handoff vehicle.
  - Task: land ADR 0034 / `cmux-reshape-spec.md` items 1–8 via the saved-plan
    pipeline (read-only verification sweep → ratified enriched plan → dedicated
    execution session, stacked local slices, `just` green per slice).
  - Planning stages complete 2026-07-12: a 7-agent read-only sweep fact-checked
    every spec item (corrections committed to the spec on branch
    `rename-ccc-to-cmux-capability`; headline fixes: kernel source-dev discovery
    replaces the assumed declared-descriptors registration, and the
    `objective-sidebar.ts` runtime bin caller joined item 3's scope). Enriched
    plan `cmux-reshape-execution-stack` ratified by the user (six slices — spec
    items 4+5 merged; ripple renames separate; stack based on
    `rename-ccc-to-cmux-capability`) and attached as branch context on
    `cmux-reshape/trim-flow-facade` for the dedicated execution session. Semantic
    update: `updates/2026-07-12-cmux-reshape-plan-ratified.md`. Execution
    underway 2026-07-12: slice 1/6 `trim-flow-facade` committed (spec item 1 —
    flow-facade subpaths/modules/tests and the `@nseng-ai/flow` dependency
    deleted; reference grep clean; local-only pending review; semantic update:
    `updates/2026-07-12-cmux-reshape-slice-1-executed.md`). Extracted
    2026-07-12: the remaining work — slices 2–6 plus the stack closeout — moved
    to the `execute-cmux-reshape-spec` autoobjective (Objective Edge), invoking
    the reshaping handoff vehicle's New-Objective escape hatch for autonomous
    runner pursuit; this row resolves when that record closes. Semantic update:
    `updates/2026-07-12-cmux-reshape-execution-extracted.md`. Completed
    2026-07-12 when `execute-cmux-reshape-spec` closed: slices 2–6 landed as the
    five planned local branches, per-slice and closeout validation passed, the
    final stale-term inventory was fully accounted, and no submit occurred.
    Semantic update:
    `updates/2026-07-12-cmux-reshape-execution-completed.md`.
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
- [x] Execute the layering reshape spec (task)
  - Added retroactively 2026-07-11 when executing reshapings was incorporated into
    the Objective (handoff-vehicle row decision); the work predates the row.
  - Task: land ADR 0033 / `layering-reshape-spec.md` items 1–10 via the handoff
    vehicle.
  - Resolved 2026-07-11: all ten items landed as nine stacked local branches (item 3
    was a user-run deletion script by design), `just` green per slice, local-only
    pending review. Evidence and experience report:
    `updates/2026-07-11-layering-reshape-executed.md`.
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
- [~] Spec the kernel → sdk rename (grilling)
  - Unparked 2026-07-12 from the Parked row "Decide the `@nseng-ai/kernel` name":
    the revisit trigger fired (`extension-descriptor-contract` closed 2026-07-11)
    and the user decided the direction — the kernel brand retires and the concept
    renames to sdk throughout the ontology: package identity, import subpaths,
    folded `@nseng-ai/ns` re-exports, glossaries, author docs, and prose surfaces.
    Direction is settled; this row grills the mechanics only.
  - Question: What exact shape does the rename take? Open mechanics as of
    2026-07-12 (re-enumerate at spec/execution time): the target name collides
    three ways — `sdk` is already the package's own `ns.tier`, the public author
    subpath (`@nseng-ai/kernel/sdk`, ~176 imports across 17 packages), and the
    root glossary's "SDK boundary" term — so decide the package name form and the
    author-entry-point treatment (accept the `@nseng-ai/sdk/sdk` stutter, or
    reshape the subpath); the `@nseng-ai/ns` folded re-exports (`./kernel/*`
    subpaths, `kernel-export-entries.json`, bundle/prepare scripts); rewording of
    the ~20 "kernel-" glossary terms (root `CONTEXT.md`, `CONTEXT-MAP.md` subpath-
    folding section, `kernel/CONTEXT.md`); the author-facing docs
    (`writing-an-ns-extension.md`, `sdk-reference.md`, README); and word-boundary
    safety for every rename pair. Exit per the reshaping handoff vehicle:
    spec + ADR, then graduate an execution task row. The vehicle's verification
    sweep and the execution-time residue inventory are natural multi-agent
    workflow fan-outs (per-claim fact-check; loop-until-dry stale-term sweep).
  - Evidence: ADR 0033 §7 (parked decision and its trigger), ideas.md "kernel
    name/analogy under user skepticism" (tier already `sdk`), ADR 0016 (SDL-era
    `@sdl/kernel` vs `sdl-sdk` precedent), ADR 0029 (kernel unpublished, ships
    folded into `@nseng-ai/ns`).
  - Resolved 2026-07-12 in a live creation-session grilling: ratified decisions
    recorded as ADR 0035 and the execution spec
    `docs/wayfinding/ontology-reshape/kernel-sdk-rename-spec.md`. Headliners:
    `@nseng-ai/kernel` → `@nseng-ai/sdk` (dir `ts/packages/sdk/`, brand now
    matching the `ns.tier`); the author API moves from the `./sdk` subpath to
    the package root — no `@nseng-ai/sdk/sdk` stutter, `publicPluginApi` becomes
    `["."]`; folded surfaces become `@nseng-ai/ns/sdk` +
    `@nseng-ai/ns/sdk/{cli,command-io,context}`; prose goes sdk-throughout —
    "the SDK" absorbs the runtime-machinery concept with no separate runtime
    noun, and kernel becomes anti-vocabulary in live prose; npm registry
    actions (claiming `@nseng-ai/sdk`, deprecating the published
    `@nseng-ai/kernel@0.1.2`) stay operator-run. Instead of graduating an
    in-record execution task row, execution was extracted at creation to the
    `execute-kernel-sdk-rename-spec` autoobjective (Objective Edge) via the
    vehicle's New-Objective hatch; this row resolves fully when that record
    closes. Semantic update:
    `updates/2026-07-12-kernel-sdk-rename-spec-ratified.md`.
- [x] Decide the reshaping handoff vehicle (grilling)
  - Graduated 2026-07-11 from the "Reshaping handoff vehicle" Fog: the first reshaping
    spec now exists (`layering-reshape-spec.md`), which was that Fog's stated
    graduation trigger.
  - Question: How do decided reshapings get executed after this Objective — new
    objectives, branch-context plans, or direct implementation sessions — and what
    must a spec asset contain to hand off cleanly? Judge against the live example:
    the layering spec's ten execution items.
  - Resolved 2026-07-11 in a live grilling session; procedure recorded at
    `docs/wayfinding/ontology-reshape/reshaping-handoff-vehicle.md`. Decisions:
    saved-plan pipeline is the default vehicle (spec → verification sweep → ratified
    enriched plan → dedicated execution session, stacked slices, `just` green per
    slice) with a trivial-slice direct hatch and a name-it-when-hit new-Objective
    exception; execution never starts in the decision session on the agent's
    initiative; two mandatory verification duties (claim fact-check at plan time,
    volatile-fact re-enumeration at execution time); an eight-point spec content
    contract. Scope decision ratified alongside: executing reshapings is Objective
    work — the row's "after this Objective" premise was retired, Non-Goals and the
    completion bar amended in `objective.md`, and decided specs now graduate into
    execution task rows here. Semantic update:
    `updates/2026-07-11-reshaping-handoff-vehicle-decided.md`.
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

(none)
