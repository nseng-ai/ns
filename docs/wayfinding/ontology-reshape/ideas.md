# Jot pad — ontology-reshape

Free-form, never authoritative. Mined from the superseded `repo-ontology` objective
(`.ns/objectives/repo-ontology/objective.md`, read at close) plus charting-session
finds. Verify against source before relying on any of it.

## Inventory facts inherited from repo-ontology (as of its last update)

- 29 tracked packages; `CONTEXT-MAP.md` Inventory Baseline still says 26 and its
  "Thirteen have present package context files" wording is off by one (12 package
  contexts + root).
- Packages absent from the map **entirely**: `@internal/ns-dev`, `@nseng-ai/ns-init`
  (owns `ns.toml` repo-root harness selection — vocabulary recorded nowhere),
  `@nseng-ai/harness-artifacts` (`ns install`/`list`/`path`/`update` surface).
- Packages with **no recorded context decision**: pr-feedback, clinkr, foundation,
  nscc, ns (ns-cli), command-backed-skill-registry, pi-command-surfaces,
  typescript-style-guard, plus the three absent ones above.
- **Partial decisions**: capability-kit (graphite subpackage only, no kit-level
  decision); pi-tools (Planned subpackage targets, no container-level decision).
- The map's Planned slate includes `@nseng-ai/flow-pi`, which is *not a tracked
  package* — planned architecture recorded as if inventory.

## Open questions inherited from repo-ontology

- Foundation: one context entry with H2 anchors vs. per-subpackage files (provisional:
  single entry; do not split unless a subpackage graduates).
- Severe cross-context ambiguity: canonicalize one repo-wide name vs. preserve
  package-local names with documented boundaries (provisional: preserve local names
  when concepts differ; `Avoid` aliases guard synonym collapse).
- ADR corpus: 36 ADRs, numbers 0001–0031, with 0012/0016/0022/0023/0024 each used
  twice. Map has no ADR index. Old leaning: keep authoring parked, consider a single
  map pointer to `docs/adr/`.
- Residual stale `sdl`/`ji`/`@ns` naming may linger in package context prose —
  opportunistic fix territory.
- Maintenance cadence after the sweep: opportunistic-on-PR vs. periodic re-grill —
  now this map's "post-map maintenance ownership" fog.

## Capabilities vocabulary-sweep finds (2026-07-10)

Suspects beyond the four chosen clusters, from `vocab-sweep-capabilities.md`:

- **Plan-authoring ownership / enriched-plan residue** — candidate fifth suspect
  cluster: package `plans` vs durable CLI/store name `enriched-plan` (bin, store path
  segment, CLI self-definition); `ns:plan:*` Pi surfaces and the
  `write_saved_plan_file` tool registered by branch-context while plans owns the tool
  name; user-facing errors still teach `enriched-plan exec save`. Neither glossary
  records the seam.
- **`ns init` scope tension** — extension says "Activate ns in a repository" but every
  domain function and output is Objectives-specific; is init ns-activation or
  Objectives-activation?
- **"Skills" noun vs "harness artifact" model** — harness-artifacts models three kinds
  but all CLI/lockfile/mirror vocabulary is skill-only (README frames as steelthread
  scoping; overlaps `skill-management-subsystem`).
- **Two-name capabilities as a pattern** — pr-feedback/Address, plans/enriched-plan,
  retros/retro, reviews/Roaster (doc-side): recurring package-name vs
  capability-brand splits; the review/feedback grilling row covers two of four.
- **Wayfinding contradiction** — root `CONTEXT.md` lists "Wayfinding Objective" as an
  Avoid alias for Ideation Objective while the shipped surface is
  `ns:objective:create:wayfinding` / `objective-create-wayfinding`.
- **Result/status unions carry the real ontology** — glossaries record nouns and miss
  the discriminated-union verbs/outcomes (checkout plans, gate checks, GC actions,
  provision decisions); a documentation-phase authoring guideline candidate.

## Hosts/kernel/extensions/internal sweep finds (2026-07-10)

Suspects from `vocab-sweep-hosts-kernel-extensions-internal.md`, weighted toward
simplification:

- **Dual package-classification systems** — role directories vs the machine-enforced
  nine-value `ns.tier` taxonomy (typescript-style-guard config), disagreeing twice
  (hosts/pi-command-surfaces = capability; extensions/ns-pi-subagents =
  internal-pi-tool). Decide one canonical system; the style-guard config is the
  ground-truth inventory for the layering grilling row.
- **`ns` identity spread** — `@nseng-ai/kernel` (bins `ns` from source, manifest
  still says "Source Development Lifecycle CLI"), `@nseng-ai/ns` in directory
  `hosts/ns-cli` (checkout-free bin, absorbs kernel at package-prep), unscoped
  `nscc` (expansion recorded nowhere, one letter from CCC).
- **Deletion quick wins** — `@nseng-ai/pi-command-surfaces` (12-line duplicate of
  branch-context/pi constants; sole consumer is a dead `hosts/pi` dep declaration);
  `@internal/pi-tools` `side-session` (declared subpackage, no exports); untracked
  residue dirs `hosts/jicc`, `hosts/sdlcc`, `extensions/flow`.
- **Residue in standing prose** — `ts/AGENTS.md:3` "ji's first-party TypeScript
  packages"; kernel/package.json:4 SDL description. Decision-free fixes, not yet
  landed.
- **One concept, two homes** — grill (pi host `grill/surfaces` vs
  `@internal/pi-tools/grill`); PR feedback (pi host residue + `pr-feedback-watch` +
  stack-view + Address capability — pi CONTEXT.md's residue entry should preserve
  those ownership seams); progress five-state union is shared correctly
  (kernel SDK store, flow consumer) but documented as if flow-local.
- **"Kernel" name/analogy under user skepticism (2026-07-10)** — reconsider in the
  layering grilling row. Supporting evidence: the package's own enforced tier is
  `sdk`, not a kernel-like tier (kernel/package.json `ns.tier`); the OS-kernel
  analogy oversells a command-catalog/descriptor-loader/author-SDK host, and its
  CONTEXT.md must immediately narrow the claim ("the kernel stays small ...");
  the name ships in public API subpaths (`@nseng-ai/ns/kernel/sdk`), so external
  extension authors inherit the analogy. Candidate directions to grill: rename to
  the host/loader/SDK language the code already uses, or decide kernel is the
  deliberate brand and align tier/prose to it.

## Infra/capability-kit/tools sweep finds (2026-07-10)

Suspects from `vocab-sweep-infra-capability-kit-tools.md`, weighted toward
simplification:

- **Exec-seam contradiction cluster** — root `CONTEXT.md` says gateways are never
  Neutral Infra and lists `exec` as Capability Kit material, citing `ExecGateway`;
  in code the contract and real spawning adapter live in foundation
  (`./command`, `foundation/exec` `NodeCommandExecApi`), the live name is
  `CommandExecApi`, and the only live `ExecGateway` is a Pi-host type. The
  brmem→capability-kit tier debt edge reason even says "until neutral-infra gateway
  placement is finalized" — the indecision is machine-recorded. Prime layering-row
  input.
- **brmem ↔ capability-kit mutual coupling** — brmem imports capability-kit
  git/xdg (via debt edge); capability-kit's `brmem-cli` module shells out to the
  brmem CLI. Neither glossary can state the boundary in one sentence.
- **Unglossaried brand names as a pattern** — `clinkr`, `areg`, `nscc`: bins/
  packages whose names have no recorded expansion anywhere; root glossary even
  *defers* to "areg vocabulary" that does not exist. Batch naming decision
  candidate.
- **`model-slug` subpath collision** — foundation (model refs) vs capability-kit
  (LM slug derivation): same export name, different concepts; text generation has
  three homes overall (foundation refs, kit request/repair, kernel TextGenerator).
- **"Registry" now has four meanings** — areg, command-backed-skill-registry,
  point-catalog's banned alias, packagechk's npm/PyPI/brew registries.
- **"Runner" now has four meanings** — Objective Runner, Pi Runner subagents,
  vibechk runner adapter, foundation `runner-usage` totals.
- **Domain vocabulary below the SDK** — foundation/terminal `runner-usage` and
  `terminal-presentation` (PrLink), foundation/primitives `skill-lookup`: move-up
  candidates that would shrink any future foundation glossary; `config` is a
  one-module subpackage (collapse candidate).
- **capability-kit `kit` subpackage is a junk drawer** — ~19 subpaths of
  checkpoint/slug/text-gen/shell/xdg/brmem concerns beside the per-domain gateway
  subpackages; the kit-level context decision reduces to deciding what `kit` is.
  Also: git contract lives in `kit/git-contract.ts` while adapters live in `git/`.
- **Machine Envelope split brain** — clinkr constructs envelopes, foundation parses
  them; term defined in no glossary despite being the machine-output contract.
- **Checkpoint vocabulary spans kit and flow** — `CheckpointMessage` limits in
  capability-kit, checkpoint workflow vocabulary in flow; no recorded seam.
- **cmux move-out promise in a comment — resolved: delete.** The stale "Neutral
  cmux substrate ... can move to a dedicated cmux package" promise is deleted.
- **Nine untracked husks under `ts/packages/infra/`** — node_modules leftovers of
  the absorbed standalone-infra split (cli-theme, cli-runtime, exec, time,
  typescript-analysis, domain-primitives-transitional, git, github, graphite);
  extends the physical-cleanup list.
- **Deliberately-thin candidates** — packagechk and vibechk are small, coherent,
  README-documented; likely "deliberately thin" context decisions. Inverse finding:
  foundation and clinkr — the most-imported packages — have no README and no
  context.
- **"Prompt plugin" vs "prompt"** — brmem skill prose vs source vocabulary for
  `exec resolve-prompt` (tier `project | global`); glossary records neither.

## Charting-session finds

- `ts/packages/` on disk is littered with leftover directories from retired
  identities (`address`, `aretro`, `asdl-core`, `autobranch`, `roaster`, `sdl-sdk`,
  `sdlcc`, `slot`, `objective`, `local-pi-tools`, `worktree-status`, ...) — untracked
  residue from moves. Physical cleanup would make the topology legible from `ls`
  alone; candidate small task or part of a layering-reshape spec.
- The four user-named suspect clusters (CCC/orchestration, layering vocabulary,
  source-control lifecycle, review/feedback residue) all involve *meta*-vocabulary as
  much as product vocabulary — a hunch that the ontology's biggest impurity is the
  describing-language, not the domain nouns.
- `cross-harness-parity` orientation ("Pi is additive, never canonical") and
  `extension-descriptor-contract` (typed descriptor modules) are live initiatives whose
  direction constrains the layering reexamination — read their orientations before that
  grilling session.
