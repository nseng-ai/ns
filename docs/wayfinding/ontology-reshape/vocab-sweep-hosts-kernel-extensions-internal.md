# Vocabulary sweep: hosts, kernel, extensions, internal

Resolves the ontology-reshape roadmap row "Vocabulary sweep: hosts, kernel,
extensions, internal (research)", 2026-07-10. Question: what domain language lives in
`ts/packages/hosts/*`, `ts/packages/kernel/`, `ts/packages/extensions/*`, and
`ts/packages/internal/*` that no context file records?

Method: as in `vocab-sweep-capabilities.md` — per-package mining of `package.json`
export maps and `ns.*` metadata, READMEs/AGENTS files, and the source modules behind
each export subpath, excluding terms already recorded in the kernel and pi
`CONTEXT.md` files or the root `CONTEXT.md`. Per session steer, this sweep weights its
suspects toward **simplification**: candidates to collapse, retire, or delete, not
just gaps to document.

Baseline note: git-tracking verification confirmed exactly the ten roadmap packages
are tracked. The additional on-disk directories `ts/packages/hosts/jicc`,
`ts/packages/hosts/sdlcc`, and `ts/packages/extensions/flow` are untracked residue,
extending the leftover-directory list already jotted in `ideas.md`.

## Summary

- Only two of the ten packages have contexts (kernel, pi); the other eight carry
  their vocabulary in READMEs, manifests, and source alone. The largest unrecorded
  cluster is not in any one package: it is the **machine-enforced layering
  meta-vocabulary** in `@internal/typescript-style-guard` — a nine-value package-tier
  taxonomy with rank-derived layering, debt edges, topology circles, and
  internal-space admission — none of which any glossary names. This directly
  confirms the record's risk hunch that the describing-language is the biggest
  impurity, and it hands the layering grilling row a ground-truth inventory: the
  style guard's config is the de facto layering ontology.
- **The repo runs two parallel package-classification systems**: role directories
  (`hosts/`, `capabilities/`, `internal/`, …) and `ns.tier` values. They disagree
  twice — `hosts/pi-command-surfaces` is tier `capability`, and
  `extensions/ns-pi-subagents` is tier `internal-pi-tool` — so directory position
  cannot be trusted as classification. A simplification decision (one system, or one
  derived from the other) would remove a whole axis of confusion.
- **Cheap deletions surfaced**: `@nseng-ai/pi-command-surfaces` is a 12-line
  constants module duplicating `@nseng-ai/branch-context/pi` exports, with exactly
  one consumer — a `hosts/pi` dependency declaration that imports nothing;
  `@internal/pi-tools`'s `side-session` subpackage is declared but exports nothing;
  plus the three untracked residue directories above.
- **The `ns` name is spread across three-plus identities**: `@nseng-ai/kernel`
  (bins `ns` from source, self-describes as an "SDL CLI"), `@nseng-ai/ns` in
  directory `hosts/ns-cli` (checkout-free published `ns` bin that absorbs kernel at
  package-preparation time), and unscoped `nscc`. One shipped thing, several names —
  reshaping material for the layering row.
- Retired-identity residue in live prose: kernel's manifest description still says
  "Source Development Lifecycle" (kernel/package.json:4), and `ts/AGENTS.md:3` still
  calls the workspace "ji's first-party TypeScript packages". Decision-free fixes.

## Cross-package themes

- **Manifest keys are unrecorded vocabulary.** `ns.tier`, `ns.subpackages`,
  `ns.remainder` (hosts/ns-cli/package.json:54,
  extensions/ns-pi-subagents/package.json:33), `ns.publicPluginApi`, and
  `ns.internalWorkspaceExports` (kernel/package.json) carry real classification
  semantics; `docs/conventions/subpackage-conventions.md` covers some mechanics, but
  no glossary defines the terms.
- **Shared five-state progress vocabulary has one home, two vocabularies.** Kernel's
  SDK owns `ProgressPhaseState` (`pending | active | done | skipped | failed`,
  kernel/src/sdk/progress-phase-state.ts:7) and flow's Phase Stream / Matrix Progress
  consume it (`capabilities/flow/src/phase-stream/phase-stream-state.ts:5`), yet the
  capabilities sweep recorded flow's cell states as flow vocabulary and neither
  glossary names the kernel service. Good news: shared implementation, only the
  documentation is split.
- **Host packages consume capability `/pi` subpackages wholesale.** The
  command-backed skill registry aggregates provider-contributed registration rows
  spread in from `@nseng-ai/{ccc,flow,handoffs,objectives}/pi`
  (hosts/command-backed-skill-registry/src/index.ts:52,99,105,155) — the
  presentation-ownership seam the capabilities sweep flagged, seen from the host
  side.

## Per-package inventories

### @nseng-ai/kernel — has CONTEXT.md

Context is current on catalog/descriptor/points vocabulary (drift audit: only the
retired `@ns/` scope needs fixing). Unrecorded beyond it:

- **Extension acquisition** — `ExtensionSourceSpec` (`local | npm | git`) and
  `ResolvedExtensionModuleRoot`: resolving a declared extension source to a module
  root. (src/extensions/acquisition.ts:9-24)
- **`ns extension install` / managed extensions npm project** — an install command
  that appends declared extension specs to `ns.toml` and maintains a managed
  `ns-managed-extensions` npm project under a managed descriptor package root.
  Kernel CONTEXT.md mentions `ns extension install` only inside an *Avoid* list.
  (src/extensions/install-command.ts:55,219; CONTEXT.md:89)
- **Pi text generation** — the SDK `TextGenerator` service implemented over the Pi
  AI model registry, self-marked temporary pending Pi's model-registry migration.
  (src/runtime/pi-text-generation.ts:1-17)
- **Progress phase state store** — `ProgressPhaseState`, `ProgressPhaseSpec` /
  `ProgressPhaseView` (with substeps, history, labels), and
  `ProgressPhaseUnknownKeyPolicy` (`ignore | append`).
  (src/sdk/progress-phase-state.ts:7-24)
- **Public-plugin-API vs internal-workspace-export manifest split** —
  `ns.publicPluginApi: ["./sdk"]` against eleven `ns.internalWorkspaceExports`; the
  glossary records the concepts (Public author API, Internal workspace export) but
  not the manifest keys that carry them. (package.json)

Suspects (simplification-weighted):

- **"Emerging customer-facing Source Development Lifecycle CLI"** — the manifest
  description is SDL residue predating the ns identity. Decision-free fix.
  (package.json:4)
- **Two packages bin `ns`** — kernel bins `ns` from source
  (package.json: `"ns": "./src/cli/index.ts"`) while `@nseng-ai/ns` bins the
  prebuilt `bin/ns.js`; the split is deliberate (checkout vs checkout-free) but no
  doc names the pair, and the kernel context never mentions `@nseng-ai/ns`. Feeds
  the layering row.

### @nseng-ai/ns (directory `hosts/ns-cli`) — no CONTEXT.md

Checkout-free npm package for the `ns` CLI: the published bin points at prebuilt
JavaScript assembled by a package-preparation step, and the package owns the public
kernel subpaths for checkout-free consumers (README.md:3-7).

Candidate terms:

- **Checkout-free (distribution)** — the package's defining adjective; also the
  vocabulary of the `checkout-free-sdl-distribution` objective edge in this repo's
  records. (README.md:3, package.json:4)
- **Package preparation step** — assembling `dist/publish/` with prebuilt bin,
  rewritten manifest, and folded kernel subpaths. (README.md:5,20)
- **Kernel subpath folding** — `@nseng-ai/kernel` (private) is folded into
  `@nseng-ai/ns/kernel/*` at preparation time; the workspace exports mirror this as
  `./kernel/cli`, `./kernel/sdk`, etc. (README.md:7, package.json exports)
- **Release qualification commands** — `publish:dry-run`, `pack:local`,
  `smoke:checkout-free`; publication is a separate authorized step.
  (README.md:12-24)
- **`ns.remainder` flag** — manifest metadata marking a remainder subpackage space;
  carried here and by ns-pi-subagents, defined nowhere agent-readable.
  (package.json:54)

Suspects:

- **Three names for one artifact** — npm name `@nseng-ai/ns`, directory `ns-cli`,
  product bin `ns`; plus the kernel's own `ns` bin. A deliberate naming decision
  (and possibly directory rename) would collapse the ambiguity. Feeds the layering
  row.
- **"Checkout-free SDL distribution"** — the objective-side phrase still carries
  `sdl`; this package's own prose does not. Alignment candidate when that edge is
  next touched.

### nscc — no CONTEXT.md

Full-screen OpenTUI stack map for the repository: Graphite branch graph, slot
assignments, and strong cmux tab matches in one branch-oriented surface
(README.md:3). Reads branch data from the sanctioned hidden command
`ns slot gt exec stack-map-branches` (README.md:10) and overlays cmux tabs from
`cmux tree --json --all`.

Candidate terms:

- **Stack map** — the branch-oriented TUI surface itself. (README.md:3-29)
- **Strong tab match** — explicit branch metadata or worktree/cwd metadata mapping
  through slot rows; titles/labels are "diagnostic only" and never activation
  targets. (README.md:46)
- **Scope and query composition** — `all` vs `cmux` scopes composing with the
  branch-name filter; slot assignment alone does not pass cmux scope.
  (README.md:44)
- **Bootstrap reporter** — the non-blocking `cmux report` invocation seeded into new
  cmux workspaces, run from the TUI process's source entrypoint so older worktrees
  still write current metadata. (README.md:50-54)
- **Cmux surface reporting** — `nscc cmux report` writing branch/worktree identity
  into cmux `surface resume` metadata; strict by default, no override flags.
  (README.md:58)
- **Tab modules / objective tab** — the TUI's tab-module seam (`TabModule`,
  `TabIntent`) and an Objective tab consuming `ns objective list` machine envelopes
  through `@nseng-ai/objectives/api`. (src/objective-tab.ts:1-13, src/tabs/)

Suspects:

- **The name `nscc`** — the only unscoped workspace package, expansion recorded
  nowhere in the package or any glossary, and one letter away from CCC while being a
  different thing (observability TUI vs orchestration layer). A rename/absorb
  decision belongs in the CCC/orchestration grilling row. (package.json)
- **Overlap with CCC's cmux vocabulary** — strong-match/workspace/tab language here
  parallels CCC's dispatch and worktree-status vocabulary with no shared recorded
  home. Feeds the CCC row.

### @nseng-ai/command-backed-skill-registry — no CONTEXT.md

One module: the single source of truth mapping repo-local skills to Pi slash-command
surfaces (src/index.ts:20-27).

Candidate terms:

- **Command-backed skill registration / registry** — rows of
  `{skillName, surface, kind}`; the types live in `@nseng-ai/foundation/command`.
  (src/index.ts:15-28)
- **Registration kinds** — `specialized-command` (surface replaces the skill with a
  bespoke command) vs `generic-backing-skill` (surface is a generic alias over the
  skill). (src/index.ts:32,39)
- **Provider-contributed registration rows** — capability `/pi` subpackages spread
  their own rows into the registry (ccc, flow, handoffs, objectives).
  (src/index.ts:52,99,105,155)
- **Visible command-backed replacement surfaces** — the derived list of all mapped
  surfaces. (src/index.ts:203-205)

Suspects:

- **Is a host package warranted for one literal array?** The registry is a single
  data module whose types live in foundation and whose rows half come from
  providers. Folding it into its consumer or foundation would delete a package from
  the topology. Feeds the layering row. Overlaps the `skill-management-subsystem`
  objective — coordinate before reshaping.
- **`enriched-plan-save` row** — the residue name, live in the registry.
  (src/index.ts:90-93)

### @nseng-ai/pi-command-surfaces — no CONTEXT.md

The entire package is six command-name constants plus one formatter for
branch-context/plan Pi surfaces (src/index.ts:1-11) — the same names
`@nseng-ai/branch-context/pi` exports from `src/pi/surfaces.ts` (see capabilities
sweep). Its only workspace consumer is a `hosts/pi` dependency declaration
(hosts/pi/package.json:51) with zero imports in `hosts/pi/src`.

Suspects:

- **Prime deletion candidate** — duplicated constants, dead dependency edge, and a
  tier/directory contradiction (`ns.tier: "capability"` under `hosts/`). Retiring it
  and keeping `@nseng-ai/branch-context/pi` as the one owner is the smallest
  reshaping decision this sweep found. Feeds both the layering row and the
  plan-authoring fifth-cluster suspect.

### @nseng-ai/ns-pi-subagents (directory `extensions/`) — no CONTEXT.md

Pi extension package for dogfooded parallel subagent exploration (README.md:3).
The pi CONTEXT.md records the Runner subagent concept but none of this package's own
surface vocabulary.

Candidate terms:

- **`explore` tool** — parent provides focused read-only scouting tasks; child Pi
  sessions return bounded direct findings plus session-file paths. (README.md:20)
- **Read-only by allowlist** — explorer children get `read`/`grep`/`find`/`ls` only;
  policy is prompt/tool allowlist, not an OS sandbox. (README.md:24,28)
- **Cheap-model policy** — Anthropic-first/Haiku with parent-model fallback.
  (README.md:26)
- **Runtime seam** — subprocess dispatch default plus a non-default in-process
  adapter callers must select explicitly. (README.md:29)
- **Subagent fleet widget / fleet navigator** — the session-local `ns.agents.fleet`
  widget (deliberately not a durable index) and the `/ns:agents:fleet` navigator
  over child session JSONL files. (README.md:33-35)
- **Curated `/api` surface** — the cross-package surface for fleet monitoring,
  runtime injection, runner result/update types. (README.md:39-41)

Suspects:

- **Role-directory vs tier mismatch** — lives in `extensions/` with
  `ns.tier: "internal-pi-tool"`; pi CONTEXT.md's Internal Pi-tool entry already has
  to special-case it ("or, for the subagent tools, under
  `@nseng-ai/ns-pi-subagents/runner-subagents`", pi CONTEXT.md:24). Either the
  directory or the tier is wrong; deciding which deletes a standing exception.
- **`/ns:agents:*` namespace** — pi CONTEXT.md's Pi command namespace rule says
  first-party commands default to `/ns:<extension>:...`; `agents` is not an
  extension or package name. Small rename or documented exception.
  (pi CONTEXT.md:44, README.md:35)

### @internal/ns-dev — no CONTEXT.md

Project-local development workflows for the ns repository (src/cli.ts:27): two
commands, `create-local-ns-project` and `install-local-ns-extension`, over injected
filesystem/command/clock gateways (src/context.ts). This is the package
`CONTEXT-MAP.md` omits entirely (drift audit).

Candidate terms: **local ns project creation** and **local ns extension install** —
the dogfooding loop for exercising kernel extension acquisition against local
checkouts. (src/commands/)

Suspects: none beyond the map omission; the package is small and coherently named.

### @internal/pi-tools — no CONTEXT.md (partial decision noted in ideas.md)

Container package for ten Internal Pi-tool subpackages (package.json `ns.subpackages`);
pi CONTEXT.md names the pattern and four examples but records no per-tool vocabulary.

Candidate terms (per subpackage):

- **backing-skill-commands** — registers the registry's generic-backing-skill rows
  as real Pi commands, with parity metadata. (src/backing-skill-commands/)
- **context-profiler** — context **bundle**, bundle store, analysis model gateway,
  and an **interrogation controller/prompt** for probing context usage.
  (src/context-profiler/)
- **grill** — grill protocol/controller/execution/inline-UI; note the split brain
  with the host's `@nseng-ai/pi/grill/surfaces` export. (src/grill/,
  hosts/pi package.json exports)
- **overlay-kit** — frame/viewport TUI overlay primitives shared by the visual
  tools. (src/overlay-kit/)
- **pr-feedback-watch** — feedback watch/download machinery; coexists with the
  host-resident PR feedback residue pi CONTEXT.md describes.
  (src/pr-feedback-watch/, hosts/pi/src/core/pr/)
- **slash-command-rerank** — reranking slash-command completion. (src/slash-command-rerank/)
- **stack-view** — stack view plus a **compose** family (controller, draft, model,
  prompt, session, transcript). (src/stack-view/)
- **thermo-council** — orchestrator, contract, final-synthesis vocabulary for the
  multi-model council tool. (src/thermo-council/)

Suspects:

- **`side-session` is declared but unexported** — present in `ns.subpackages` and
  `src/side-session/`, absent from the export map: dead or unshipped. Delete or
  ship. (package.json, src/side-session/)
- **Grill ownership split** — grill UI/protocol here, `grill/surfaces` in the pi
  host; one concept, two homes, no recorded seam. Simplification candidate.
- **pr-feedback split** — PR-feedback behavior spans this package
  (`pr-feedback-watch`), host-resident residue (hosts/pi/src/core/pr/), the
  stack-view presentation, and the Address capability. Verify that the
  review/feedback residue row describes those ownership seams accurately.

### @internal/typescript-style-guard — no CONTEXT.md

Consumer-side tested tooling implementing the repo's TypeScript style guard; a
self-described "middle-rung internal package" with an explicit promotion path
(README.md:11-13). Its config modules are the machine-readable layering ontology.

Candidate terms:

- **Package tier taxonomy** — nine tier ids: `capability`, `capability-kit`, `sdk`,
  `neutral-infra`, `host`, `capability-pi`, `standalone-tool`, `internal-pi-tool`,
  `internal-tool`. (src/package-tier-taxonomy.ts:18-29)
- **Rank-derived tier layering** — a tier may depend on itself and every tier below
  it in `tierRank`; supersedes the old hand-curated per-tier target lists.
  (src/package-tier-taxonomy.ts:31-39)
- **Allowed tier debt edge** — a named, reasoned exception to layering.
  (src/package-tier-taxonomy.ts:12-16)
- **Topology circles** — package-level import-cycle/layering analysis over
  TypeScript sources, with **deferred topology-circle cycles** as the debt register.
  (src/topology-circles.ts)
- **Internal space admission** — `@internal/` scope ↔ `ts/packages/internal/` path
  must agree, packages must be private, and runtime dependencies on internal space
  stay inside it (`NS_TS_INTERNAL_SPACE_ADMISSION`). (src/internal-space.ts:7-8,
  README.md:18)
- **Subpackage / exports-subpackage conformance** — enforcement of the
  `ns.subpackages` model against export maps. (src/subpackage-conformance.ts,
  src/exports-subpackage-conformance.ts)
- **Source rules / violations** — the shared violation vocabulary all collectors
  emit. (src/source-rules.ts)
- **Middle-rung internal package / promotion path** — the platform-and-consumer
  vocabulary instantiated: repo-operating machinery between `.ns/*` prototypes and
  platform packages, with a named extraction point. (README.md:11-17)

Suspects:

- **Nine tiers is the layering grilling row's real subject.** The human-facing
  glossaries discuss kernel/host/extension/capability in prose while the enforced
  ontology has nine categories, rank order, and debt edges. Any reshaping decision
  should treat this config as the current-state inventory — and ask whether nine
  is the *decided* number or accreted (e.g. `standalone-tool` vs `internal-tool`
  vs `internal-pi-tool` may be collapsible).
- **Tier names vs role directories** — `capability-pi` and `standalone-tool` have
  no directory; two packages sit in directories that contradict their tier. One
  classification system should be canonical.
