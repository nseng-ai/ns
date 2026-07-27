# ADR 0049: Progressively Disclosed Objective Product

## Status

Accepted

## Context

Objectives are checked-in Markdown records interpreted by agent skills. The repository also ships deterministic Objective mechanics through `ns` and an interactive Objective experience for Pi. Those surfaces currently appear to be one package-owned installation: the Objective skills assume the CLI, `@nseng-ai/objectives` provisions both ordinary and automation skills, and Pi presentation lives inside the Objective extension package.

That shape obscures a useful portable foundation, makes CLI availability look like part of Objective semantics, and violates ADR 0045's host-ownership rule. It also creates an artifact collision: a user may acquire canonical skills with `npx skills` and later install the Objective extension, whose npm-bundled provisioning targets the same flat skill identities.

Portability does not by itself establish a public support warrant. Skill support disposition, npm package release disposition, acquisition channel, Harness Overlay policy, and installed-artifact ownership are independent concerns.

## Decision

Objectives are one progressively disclosed product with three additive layers over one invariant record model.

### 1. Seven portable skills are the foundation

The canonical ordinary-workflow family is exactly:

- `objective`
- `objective-create`
- `objective-list`
- `objective-next`
- `objective-update`
- `objective-refresh`
- `objective-close`

Their single canonical sources live under `skills/incubating/objectives/` and are independently acquirable with `npx skills`. They require no Objective CLI or npm package dedicated only to skills. Each skill has a complete CLI-free procedure over `.ns/objectives/` Markdown records.

The skills use look-before-use capability adaptation. Before invoking an optional `ns objective` operation, a skill probes that concrete operation rather than merely detecting an `ns` executable. When present, the operation may accelerate deterministic work or add a stronger guarantee; when absent, the skill completes its portable procedure and states which guarantee was unavailable. Capability adaptation changes mechanics and evidence, never Objective meaning.

Portable `objective-list` lists direct open record slugs only, labeling each `open` or `blocked`. It omits closed records, titles, summaries, update recency, dirty state, branch attribution, and Git-aware freshness. Portable `objective-next` is record-only and does not claim a Tracking Gate or current Git evidence. Portable frontmatter mutation inspects and updates both edge endpoints best-effort; deterministic structural verification belongs to the enhancement.

`objective-critique` is deleted by clean cutover. `objective-refresh` retains its identity. Objective patterns remain prose available to portable creation, but automatic orientation loading and Objective Runner automation are not portable promises.

### 2. `@nseng-ai/objectives` is the harness-independent enhancement

The incubating ns extension `@nseng-ai/objectives` adds deterministic mechanics over the same records: rich list/show facts, structural checks, Git-aware Tracking Gate facts, orientation loading, machine-readable interfaces, runner begin/finish and recovery boundaries, provenance commits, and bounded parent-only publication mechanics.

ADR 0024's begin/child/finish trust boundary and ADR 0037's separate parent-only publication authorization remain Objective-owned and harness-independent. The extension provisions `objective-runner-step` and `objective-autorun` as separately enhanced incubating skills. Those two are not members of the seven-skill portable family.

The extension exposes only curated in-process behavior through `@nseng-ai/objectives/api`. It does not export Pi entrypoints or runtime-depend on the Pi host.

### 3. Pi integration is a required-`ns` host package

The incubating Pi-owned package `@nseng-ai/pi-ns-objectives` lives under `ts/packages/incubating/hosts/pi/extensions/pi-ns-objectives/`. It requires `@nseng-ai/objectives`, consumes only `@nseng-ai/objectives/api` plus neutral `@nseng-ai/pi-runtime` interfaces, and owns Objective slash-command registration, picker and completion presentation, skill expansion, and Objective Runner orchestration.

Pi is therefore an interactive enhancement over the ns extension, not a direct host for skill-only Objectives and not an Objective domain owner. Objective semantics and deterministic trust boundaries do not move into Pi.

### 4. Records are invariant across layers

Every layer reads and writes the same checked-in `.ns/objectives/<slug>/` shape and the same prose semantics. Installation level is not record metadata or lifecycle state. No layer introduces generated portable/enhanced skill variants, a hidden Objective store, a compatibility record format, or additional Record Frontmatter keys.

### 5. Acquisition and provisioning preserve artifact ownership

The canonical skill content is shared, but installed artifacts have one management owner at a time:

- `npx skills` owns artifacts it acquires and records in `skills-lock.json`;
- `ns skills`, `ns update`, and extension activation own only artifacts recorded in `.ns-harness-artifacts-manifest.json`;
- `ns skill-exposure` owns only exposure-derived Harness Overlays and the command-backed replacement invariant.

When the Objective extension is installed or updated, it must look before provisioning each portable identity. A portable artifact already owned by `npx skills` remains under that channel and is not overwritten, adopted into the ns manifest, or later removed by ns. The extension provisions a portable identity only when it is missing; that artifact then has ns-manifest ownership. The extension independently provisions its enhanced automation skills.

Removal is provenance-bounded. Removing Pi removes only Pi integration. Removing `@nseng-ai/objectives` removes only unchanged artifacts tracked in the ns harness-artifact manifest and preserves `npx skills`-owned portable artifacts, untracked or locally modified files, and all Objective records. `npx skills` removal remains responsible only for its own lock-managed artifacts. An ownership collision or ambiguous pre-existing target fails closed rather than transferring ownership implicitly.

### 6. Portability does not promote support disposition

All nine Objective skills remain incubating: the seven portable skills plus the two enhancement-provisioned automation skills. Checkout-independent evidence gathered here may inform a later support-warrant review, but promotion to `skills/public/objectives/` requires a separate deliberate decision and canonical path move under ADR 0046.

## Consequences

- A user can begin with seven skills and ordinary Markdown, add deterministic `ns` guarantees without migrating records, and add Pi interaction without changing Objective semantics.
- Skills must describe both a complete portable path and optional operation-specific enhancement without duplicating semantic workflows.
- `@nseng-ai/objectives` must remove its Pi exports and Pi runtime edge; extraction blocks on any missing curated package API rather than using private imports.
- Harness-artifact reconciliation must distinguish pre-existing `npx skills` ownership from missing targets and ns-manifest ownership before the installation contract is complete.
- `objective-list` stays intentionally smaller than `ns objective list`; matching names do not imply identical presentation richness.
- Checkout-independent scenarios must prove acquisition, enhancement, Pi use, and reverse removal against unchanged records.

## Alternatives

- **Require `ns` for every Objective workflow:** rejected because record semantics and ordinary lifecycle work do not require deterministic CLI machinery.
- **Publish a skills-only npm package:** rejected because `npx skills` can acquire canonical skill directories directly and another package would create duplicate ownership.
- **Generate portable and enhanced skill variants:** rejected because variants would drift into two Objective systems.
- **Keep Pi inside `@nseng-ai/objectives`:** rejected by ADR 0045's host ownership boundary and because it gives a harness runtime an edge into a domain owner.
- **Let the latest installer take over existing artifacts:** rejected because update and removal would become destructive and provenance would be lost.
- **Promote portable skills immediately to public:** rejected because portability evidence is not an ongoing support warrant.
