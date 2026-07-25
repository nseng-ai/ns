# Capability-to-Extension Blast-Radius Inventory

## Purpose and classification

This inventory bounds the live rename from **capability** to **ns extension**. It classifies occurrences as:

- **Vocabulary sweep** — live prose or domain terminology that should adopt extension vocabulary in this Objective.
- **Code plan** — paths, package identities, tier values, identifiers, literals, tests, generated metadata, or prose that cannot become accurate until those machine-readable surfaces move. The parent `professional-repo-curation` Objective sequences these changes with the demotion commit or an adjacent code slice.
- **Deliberately kept** — immutable history, an external name or quotation, or ordinary English where “capability” means an ability rather than an ns domain/package.

A case-insensitive tracked-file scan found matches across 13 `CONTEXT.md` files, 17 package or repository READMEs, 60 files under `docs/`, 26 files under `skills/`, 401 files under `ts/`, and two project-local Pi adapters. Those counts are discovery evidence, not acceptance criteria: many code hits repeat the same package/path dependency and many Objective hits are immutable historical records.

## Vocabulary sweep

### Canonical contexts and routing

The highest-density live vocabulary is the canonical domain model and context routing:

- `CONTEXT.md` — replace the old construct/feature split at the architecture and glossary sections. The affected concepts include **Capability**, **first-party extension**, **Capability Kit**, **Capability API**, capability-owned **Consumer Gateway**, capability command face, capability dependency edges, Herdr capability, package tiers, and related *Avoid* entries.
- `CONTEXT-MAP.md` — update routes and relationship prose for Handoffs, Herdr, Reviews, Plans, Branch Context, Objectives, Slots, and Flow; update capability-owned/API/dependency wording. Physical `capabilities/` and `capability-kit/` links remain code-plan literals until the move.
- Nested live contexts:
  - `ts/packages/capabilities/{branch-context,flow,handoffs,herdr,objectives,plans,reviews,slots}/CONTEXT.md`
  - `ts/packages/hosts/pi/CONTEXT.md`
  - `ts/packages/sdk/CONTEXT.md`
  - `ts/packages/infra/foundation/CONTEXT.md`
  - `ts/packages/capability-kit/src/graphite/CONTEXT.md`

The curated `/api` surface currently called **Capability API** is the **extension package API**: the public in-process API of one particular extension package, typically imported through an exported `/api` subpath such as `@nseng-ai/plans/api`. In prose, prefer **the extension’s package API** or a qualified form such as **Plans extension package API**. This is distinct from both the author-facing `@nseng-ai/sdk` API and Pi’s runtime `ExtensionAPI`; do not call either of those an extension package API.

This preserves the verdict’s qualification rule without inventing a second noun for feature areas. It requires an explicit glossary edit during the vocabulary layer; it is not a code rename by itself.

### Live READMEs and conventions

Primary prose-sweep targets:

- `docs/north-star.md`
- `ts/packages/hosts/ns/README.md`
- `ts/packages/sdk/README.md`
- `ts/packages/capabilities/{flow,handoffs,pr-feedback,slots}/README.md`
- `docs/pi/README.md`
- `docs/pi/extension-command-checklist.md`
- `docs/conventions/{adversarial-reviews,consumer-gateways-and-command-shape,platform-and-consumer,subpackage-conventions,upstream-skill-melding}.md`
- `docs/herdr/command-catalog.md` where prose describes current ownership rather than former-cmux history
- `docs/follow-ups/objective-context-management-and-compaction.md` where it states current Objective-extension ownership

Mixed files must separate prose from code literals: update the explanation now, but leave or explicitly describe old package/path/tier strings until the code slice changes them.

### Skills

Live ns-domain prose to sweep:

- `skills/architecture-topology-report/SKILL.md`
- `skills/architecture-topology-report/references/HTML-REPORT.md` presentation labels (its tier IDs and script keys are code-plan items)
- `skills/ns-typescript/SKILL.md` — SDK/capability values and Capability API guidance; preserve the unrelated `RenderCapabilities` identifier
- `skills/typescript-fake-driven-testing/SKILL.md` — only “capability-owned `*Context`”; its external/runtime capability language is generic
- `skills/skill-management/references/umbrella-families.md` — replace the overloaded placeholder `skills/<capability>/` with skill-family/workflow wording rather than mechanically writing “extension”

### Active Objective records

- `.ns/objectives/professional-repo-curation/references/root-readme-positioning.md` is the required taxonomy target: objectives/handoffs/flow/pr-feedback become **the core**; slots/reviews/plans/branch-context become **extensions**.
- Active parent/parallel records (`professional-repo-curation` and `foundation-readme-driven-pass`) intentionally describe sequencing through the rename. Keep explicit `capability→extension` historical/transition phrases, but adopt `extension-kit` for target-state prose after the code plan is settled.
- `professional-repo-curation/orientation.md` intentionally describes both direction and what agents currently see. Its old vocabulary remains while true and should shrink as the migration lands.
- `standing-test-performance-boundaries` has path evidence such as `capability-kit` integration-test locations; treat those as code-plan path updates, not prose sweep.
- This Objective’s own thesis, risks, roadmap, and Semantic Updates intentionally name the source term and remain intelligible as rename records.

## Code plan

### Package topology and published identity

The code rename is load-bearing, not merely a folder cleanup:

- Rename physical role directory `ts/packages/capabilities/` (11 package manifests) to its extension-based destination unless the parent demotion moves those packages directly into the flat incubator first.
- Rename `ts/packages/capability-kit/` and published package `@nseng-ai/capability-kit` to `extension-kit` / `@nseng-ai/extension-kit`.
- The 11 current capability-tier packages are `branch-context`, `flow`, `handoffs`, `harness-artifacts`, `herdr`, `ns-init`, `objectives`, `plans`, `pr-feedback`, `reviews`, and `slots`.
- `@nseng-ai/capability-kit` is marked public, has roughly 34 exports, appears in 18 package manifests including the workspace root and its own manifest, and participates in public package-set/publish-order metadata at `ts/packages/internal/ns-dev/src/public-packages/package-set.ts`.
- `ts/pnpm-lock.yaml` contains importers and workspace links for the kit and all packages under `capabilities/`; regenerate it after package/path changes.
- `ts/pnpm-workspace.yaml` already uses generic workspace globs and does not itself require a role-name change.

Because ns is private and unreleased, the package rename can be a hard cutover, but release metadata and every workspace consumer must move atomically.

### Tier schema and architecture enforcement

The exact machine-readable tier values `capability` and `capability-kit` are enforced architecture schema:

- `ts/packages/internal/typescript-style-guard/src/package-tier-taxonomy.ts` — tier IDs, rank, labels, and dependency matrix
- `ts/packages/internal/typescript-style-guard/src/tier-directory-projection.ts` — hard tier-to-directory mapping
- `ts/packages/internal/typescript-style-guard/src/config.ts` and `source-rules.ts` — package sets, boundary rules, diagnostics, and command-surface catalogs
- `ts/packages/internal/typescript-style-guard/test/typescript-style-guard/typescript-style-guard.test.ts` — tier, projection, boundary, and diagnostic fixtures
- `skills/architecture-topology-report/scripts/{extract-graph,synthesize-spec,example-spec}.mjs` and `references/HTML-REPORT.md` — tier keys, defaults, labels, and report examples
- all 11 extension manifests currently declare `"ns": { "tier": "capability" }`; the kit declares `"capability-kit"`

The code plan must choose and apply the target tier IDs consistently. Recommended target state is `extension` and `extension-kit`, even if incubator-destined packages temporarily stop projecting to a role directory; the parent’s two-zone invariant must define how tier metadata and flat incubator placement interact.

### Imports, path literals, and adapters

High-risk consumers include:

- imports of `@nseng-ai/capability-kit` throughout extension packages, hosts, SDK, internal Pi tools, and standalone tools
- `.pi/extensions/claude.ts` and `.pi/extensions/objective-autorun.ts`, which deep-import through physical `ts/packages/capabilities/...` paths
- SDK extension fixtures under `ts/packages/sdk/test/helpers/*-extension.ts` and extension-point scenario/integration tests
- local-install scenarios under `ts/packages/internal/ns-dev/test/`
- package-local scripts and snapshots that encode `packages/capability-kit` or `packages/capabilities`
- all code snippets and links in live docs, contexts, READMEs, AGENTS files, and skills after the physical move

The workspace scan found no user CLI flag beginning `--capabilit`; there is no CLI flag migration cluster.

### Exported identifiers and literals

Rename ns-domain symbols and their pinned tests, including:

- style-guard rule IDs and symbols such as `BAN_CAPABILITY_PRIVATE_PEER_IMPORT`, `BAN_LOWER_LAYER_CONCRETE_CAPABILITY_SURFACE`, `ConcreteCapabilityCommandSurface`, `concreteCapabilityCommandSurfaces`, and `capabilityPackageNames`
- Flow land API symbols `LAND_CAPABILITY_ID`, `LandCapabilityMetadata`, and `LAND_CAPABILITY_METADATA`
- the serialized Flow identity `@nseng-ai/flow:land:capability` and its API-boundary expectations
- comments/headings such as “Capability API” in source modules where they denote the curated extension consumer seam

Do not mechanically rename unrelated identifiers such as terminal `RenderCapabilities`/`renderCapabilities`.

### Required sequencing

The safe order is:

1. Land the vocabulary/docs layer without pretending old code paths already moved; settle the API-surface names.
2. In the parent’s demotion design, decide whether packages move directly from `capabilities/<name>` into flat `incubator/<name>` and whether `extension-kit` remains clean-zone top-level. Avoid an intermediate `extensions/` move that would immediately be undone.
3. Execute package identity, tier schema, architecture rules, imports, path literals, release metadata, tests, and lockfile changes atomically in the demotion commit or one immediately adjacent hard-cutover commit.
4. Sweep mixed documentation literals after the final paths exist, then run package/style/full validation.

This inventory does not settle whether step 3 is inside or adjacent to the demotion commit; it shows that a standalone early directory rename would create double-move churn.

## Deliberately kept

### Immutable and historical material

Do not rewrite:

- existing Semantic Updates under `.ns/objectives/**/updates/`
- closed Objective records and their roadmaps/references
- ADR bodies and titles, including ADRs 0009, 0017–0021, 0023, 0029, 0032–0034, 0038–0040, and later records that capture the architecture in force when written
- dated wayfinding, reshape specs, drift audits, completed migration records, research snapshots, and retrospective/follow-up accounts when they describe then-current paths or quote prior terminology
- explicit transition phrases such as `capability→extension` in the active rename and parent records

`docs/adr/README.md` may continue reproducing immutable ADR titles. Historical documents may receive a non-invasive supersession pointer later, but not a mechanical terminology rewrite.

### Generic or external meanings

Keep “capability/capabilities” where it means an ability or supported behavior rather than the ns package/domain term, including:

- terminal `RenderCapabilities`
- process, harness, backend, runtime, provider, or text-generation capabilities
- generic TypeScript examples and capability flags
- research discussing third-party products’ capability surfaces or gates
- Pi host execution capability language
- external fixture URLs or quoted text containing `capability-kit`

Review mixed sentences manually. The acceptance test is semantic—no live ns-domain use remains—not a repository-wide zero-match grep.

## Inventory conclusion

The prose blast radius is broad but mechanically approachable now that **extension package API** is settled as the replacement for **Capability API**. The code blast radius is bounded to one published kit identity, 11 extension packages, two tier values, architecture enforcement/reporting, exported Flow metadata, path/import consumers, release metadata, tests, and the lockfile. It is nevertheless load-bearing enough that package, tier, and path renames must be one coordinated cutover aligned with the parent’s direct-to-incubator move.
