# Skill Tree Design Inventory

## Purpose and boundary

This is the source-backed design packet for roadmap item 1 of
`skill-disposition-and-owner-ontology`. It inventories the baseline first-party skill tree,
identifies every known class of live flat-canonical-path consumer, and frames the family
and classification questions needed to review proposed ADR 0046.

It deliberately is **not** the complete destination map. No disposition or family verdict
in this document authorizes a move. Roadmap item 2 must classify every skill, settle every
final path, and obtain explicit approval of the ADR and map before migration.

Inventory date: 2026-07-26. Baseline: `master` with a clean `master...HEAD` Tracking Gate.

## Baseline facts

- 58 first-party canonical skill directories exist directly under `skills/`; each contains
  `SKILL.md`.
- 58 `.agents/skills/<skill>` entries are first-party symlinks whose targets currently use
  `../../skills/<skill>`.
- Corresponding `.claude/skills/<skill>` entries remain flat and point through
  `../../.agents/skills/<skill>`.
- Additional real directories under `.agents/skills/` are vendored third-party content and
  are outside the first-party map.
- Current policy evidence yields 14 `normal`, 34 `command-backed`, and 10 other
  `invoke-only` first-party skills. Fifteen skills carry `metadata.internal: true`.
  Exposure and internal metadata are evidence, not disposition verdicts.

Commands used for the baseline included bounded `find` inventories, symlink `readlink`,
frontmatter inspection, `.pi/settings.json` exclusion inspection, and repository searches
for flat `skills/<name>` assumptions. The full skill list below is the completeness check
for the later destination map.

## Complete first-party skill inventory

The “cluster clue” is a design aid, not an approved family. “Exposure evidence” describes
the current policy surface and must remain orthogonal to support disposition.

| Current canonical source                       | Exposure evidence | Internal marker | Representative cluster clue           |
| ---------------------------------------------- | ----------------- | --------------- | ------------------------------------- |
| `skills/architecture-topology-report/`         | invoke-only       | yes             | architecture/review tooling           |
| `skills/branch-context/`                       | normal            | no              | branch context and plans              |
| `skills/branch-context-from-plan/`             | command-backed    | no              | branch context and plans              |
| `skills/branch-context-impl/`                  | command-backed    | no              | branch context and plans              |
| `skills/brmem/`                                | normal            | no              | branch memory / durable context       |
| `skills/changelog-update/`                     | command-backed    | no              | repository maintenance                |
| `skills/cli-push-down/`                        | normal            | no              | agent/CLI design standards            |
| `skills/code-fix-gh-stack/`                    | normal            | yes             | source control / stack repair         |
| `skills/code-gh/`                              | normal            | yes             | source control / GitHub               |
| `skills/code-graphite/`                        | normal            | no              | source control / Graphite             |
| `skills/code-gt-linearize-descendants/`        | command-backed    | no              | source control / Graphite             |
| `skills/code-gt-restack-resolve/`              | command-backed    | no              | source control / Graphite             |
| `skills/code-just-fix/`                        | command-backed    | yes             | source control / validation repair    |
| `skills/code-just-the-stack/`                  | command-backed    | no              | source control / stack validation     |
| `skills/code-resolve-merge-conflicts/`         | command-backed    | no              | source control / conflict repair      |
| `skills/code-smush/`                           | invoke-only       | no              | source control / stack shaping        |
| `skills/code-thermostack/`                     | command-backed    | no              | source control / review remediation   |
| `skills/code-workflows/`                       | command-backed    | yes             | source control / rare workflow router |
| `skills/context-bundle-analysis/`              | command-backed    | no              | agent context analysis                |
| `skills/enriched-plan-save/`                   | command-backed    | no              | branch context and plans              |
| `skills/handoff/`                              | normal            | no              | handoffs                              |
| `skills/handoff-create/`                       | command-backed    | no              | handoffs                              |
| `skills/handoff-pickup/`                       | command-backed    | no              | handoffs                              |
| `skills/ns-cli-design/`                        | command-backed    | yes             | agent/CLI design standards            |
| `skills/ns-flow-autobranch/`                   | command-backed    | yes             | Flow workflow wrappers                |
| `skills/ns-flow-branch-latest-commit/`         | command-backed    | yes             | Flow workflow wrappers                |
| `skills/ns-flow-cp/`                           | command-backed    | yes             | Flow workflow wrappers                |
| `skills/ns-flow-submit/`                       | command-backed    | yes             | Flow workflow wrappers                |
| `skills/ns-release/`                           | invoke-only       | yes             | release operations                    |
| `skills/ns-typescript/`                        | normal            | no              | TypeScript standards                  |
| `skills/ns-typescript-style-tripwire/`         | command-backed    | no              | TypeScript review/tripwire            |
| `skills/objective/`                            | normal            | no              | Objectives                            |
| `skills/objective-autorun/`                    | command-backed    | no              | Objectives                            |
| `skills/objective-close/`                      | command-backed    | no              | Objectives                            |
| `skills/objective-create/`                     | command-backed    | no              | Objectives                            |
| `skills/objective-critique/`                   | invoke-only       | no              | Objectives                            |
| `skills/objective-next/`                       | command-backed    | no              | Objectives                            |
| `skills/objective-refresh/`                    | command-backed    | no              | Objectives                            |
| `skills/objective-runner-step/`                | invoke-only       | no              | Objectives                            |
| `skills/objective-update/`                     | command-backed    | no              | Objectives                            |
| `skills/pi-grill-ui/`                          | command-backed    | yes             | Pi structured UI backends             |
| `skills/pi-grill-with-docs-ui/`                | command-backed    | yes             | Pi structured UI backends             |
| `skills/plan-stack-from-findings/`             | normal            | yes             | planning / review synthesis           |
| `skills/pr-address/`                           | normal            | no              | PR feedback                           |
| `skills/pr-make-accountable/`                  | invoke-only       | no              | PR authoring                          |
| `skills/project-setup/`                        | invoke-only       | no              | project scaffolding                   |
| `skills/readme-driven-development/`            | invoke-only       | no              | product/design planning               |
| `skills/refactor-swarm/`                       | command-backed    | no              | code transformation                   |
| `skills/reinvented-abstractions-tripwire/`     | command-backed    | no              | review/tripwire                       |
| `skills/review-code-quality-subagents/`        | invoke-only       | yes             | review orchestration                  |
| `skills/review-dry-but-not-too-dry/`           | command-backed    | no              | review/tripwire                       |
| `skills/review-improve-codebase-architecture/` | command-backed    | no              | review/tripwire                       |
| `skills/review-thermonuclear-review/`          | command-backed    | no              | review/tripwire                       |
| `skills/skill-audit/`                          | command-backed    | no              | skill management                      |
| `skills/skill-management/`                     | command-backed    | no              | skill management                      |
| `skills/slots/`                                | normal            | no              | worktree slots                        |
| `skills/typescript-fake-driven-testing/`       | normal            | no              | TypeScript standards                  |
| `skills/typescript-style/`                     | normal            | no              | TypeScript standards                  |

### User-set classification constraints

The later destination map must preserve these settled inputs from the Objective:

- `public/` may initially be empty.
- The Flow skill family is incubating.
- `cli-push-down`, `reinvented-abstractions-tripwire`,
  `plan-stack-from-findings`, `readme-driven-development`,
  `typescript-fake-driven-testing`, and `typescript-style` are internal.

These constraints demonstrate why current metadata cannot be used mechanically: several
explicitly internal skills do not currently carry `metadata.internal: true`, while some
marked-internal skills still require a skill-level support rationale.

## Live canonical-path consumer inventory

### 1. Harness overlay topology

- `.agents/skills/<skill>` — 58 first-party symlinks currently target
  `../../skills/<skill>` and must be retargeted to approved nested destinations.
- `.claude/skills/<skill>` — flat symlinks point through `.agents`; their shape should
  remain unchanged unless verification discovers a broken chain.
- `.agents/skills/<vendored>/` real directories — remain untouched and are explicitly not
  canonical first-party sources.
- `.pi/settings.json` — command-backed exclusions use `-skills/<skill>`. These are flat
  harness identities and should remain unchanged even though exposure policy is reapplied
  from nested canonical paths.

### 2. Acquisition, lock, exposure, and management

- `skills-lock.json` — every local first-party entry currently records a flat
  `source: "skills/<skill>"`; all sources must move atomically.
- `skills/skill-management/SKILL.md` and
  `skills/skill-management/references/commands.md` — authoritative procedures encode
  flat canonical paths, symlink targets, lock sources, rename checks, and one-level
  inventories.
- `docs/conventions/skill-conventions.md` — mutable repository contract repeatedly defines
  canonical sources and policy paths as `skills/<name>`.
- `ts/packages/incubating/extensions/skill-exposure/src/node-skill-exposure-gateway.ts` —
  `resolveSkillInput` recognizes a first-party canonical source only when the relative path
  has exactly `skills/<skill>` shape. It must accept exactly the approved nested shape and
  continue accepting flat vendored/overlay inputs.
- `ts/packages/incubating/extensions/skill-exposure/src/policy.ts` — sidecars derive from
  canonical `relativePath`, while Pi exclusions derive from skill identity. The former must
  nest; the latter must remain flat.
- Skill Exposure unit and scenario tests under
  `ts/packages/incubating/extensions/skill-exposure/test/` pin flat inputs, canonicalized
  symlink behavior, and sidecar placement.

### 3. Provisioning, package publication, and mirror conventions

- `ts/packages/public/ns/src/harness-artifacts/skill-mirror-conventions.ts` —
  `expectedAgentsSkillSymlinkTarget()` currently synthesizes `../../skills/<skill>`.
  Canonical destinations become data; flat overlay parsing remains valid.
- `ts/packages/public/ns/src/harness-artifacts/first-party-catalog.ts` — the first-party
  Objective provisioning source is explicitly `skills/objective`.
- `ts/packages/public/ns/src/harness-artifacts/first-party-skill-provisioning.ts` and tests —
  provisioning consumes catalog-relative source paths while materializing flat harness
  targets.
- `ts/packages/incubating/extensions/objectives/package.json` — Objective skill publish
  extras use nine flat repository `sourcePath` values. Repository sources must nest while
  package `publishPath` values may intentionally remain flat.
- `ts/packages/internal/dev/ns-dev/src/public-packages/publish-extras.ts` — already accepts
  explicit source paths; tests and fixtures must be updated rather than its abstraction
  changed without evidence.
- Mutable provisioning documentation in
  `ts/packages/public/ns/src/harness-artifacts/README.md` distinguishes canonical sources
  from flat destinations and must state the new topology.

### 4. Runtime lookup and command-backed expansion

- `ts/packages/public/infra/foundation/src/primitives/skill-lookup.ts` — lookup descriptors
  construct `<root>/<skillName>`, including direct `skills/<skill>` lookup.
- `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/kit/skills/lookup.ts` and
  `expansion.ts` — resolve and report exact flat lookup candidates for command-backed
  expansion; their tests pin precedence and diagnostics.
- Flat `.agents/skills/<skill>` overlays provide a stable identity-based lookup surface.
  The migration must explicitly decide whether runtime direct-canonical lookup becomes
  destination-aware or intentionally relies on that overlay, then preserve equivalent
  diagnostics and containment guarantees.
- `ts/packages/internal/hosts/pi/tools/pi-tools/src/backing-skill-commands/` and Skill
  Exposure's `replacement-registry.ts` key command-backed behavior by flat skill identity;
  those keys must not become canonical paths.

### 5. Validation, scripts, and repository automation

- `justfile` — `skill-exposure-check` enumerates `skills/*`, which would enumerate
  disposition containers after migration; another recipe embeds a direct flat skill path.
- `.claude/workflows/refactor-swarm-workflow.js` and `.pi/extensions/just-fix.ts` contain
  live direct skill references that require classification during the cutover.
- TypeScript tests under the packages above, plus `ts/packages/public/ns/test/`, pin
  canonical paths, mirror targets, provisioning sources, and lock behavior.
- `.ns/reviews/*`, package tests, and style-guard tests contain explicit skill paths used as
  live fixtures or configuration; update fixtures only when they describe current behavior.

### 6. Agent instructions, prompts, and mutable docs

- `AGENTS.md` — direct known-skill resolution says `skills/<name>/SKILL.md`; the new rule
  must route through the approved disposition/family path without asking agents to search
  blindly.
- `ts/AGENTS.md` and nested package `AGENTS.md` files — several direct skill references are
  operational instructions.
- `.ns/prompts/branch-context.plans-write.md` — checked-in live prompt references a direct
  canonical skill path.
- Skill-internal references include
  `skills/code-gt-restack-resolve/SKILL.md`,
  `skills/objective-create/references/wayfinding-create.md`,
  `skills/skill-audit/SKILL.md`, and the skill-management files. Relative references that
  stay within a moved skill continue to work; root-relative sibling references must change.
- `docs/pi/README.md`, `docs/patterns/skill-extension-router-pattern.md`,
  `docs/agents/matt-pocock-skills.md`, `docs/README.md`, and other mutable conventions or
  research readbacks describe flat canonical ownership and must be classified as current
  guidance versus historical evidence.

### 7. Historical records and generated/stale evidence

- Accepted ADRs are immutable time-in-place records. Existing flat paths in ADR 0016 and
  other accepted ADRs are not migration targets unless a link is actually broken and a
  factual correction is appropriate.
- Existing files under `.ns/objectives/*/updates/` are immutable Semantic Updates and must
  not be rewritten.
- Closed Objective records, retrospectives, wayfinding artifacts, cutover reports, and
  frozen research may retain historical paths when the prose describes the historical
  state. Each hit requires classification; bulk textual replacement is unsafe.
- `retired website files` remains gated and is out of scope unless a live reference is needed to avoid
  breakage; flat harness-root prose generally remains correct because overlays stay flat.

## Representative family taxonomy for review

These are candidate ownership clusters, not final folder names or destination verdicts.
They test whether the ADR's family rule can describe the current inventory without generic
catch-alls:

- **Objectives:** the `objective` umbrella and eight create/next/update/close/refresh/
  critique/runner workflows form one clear cross-disposition-capable family.
- **Branch context and plans:** `branch-context`, its two execution leaves, and
  `enriched-plan-save` share one workflow boundary; `brmem` may instead remain a lower
  durable-context owner.
- **Handoffs:** umbrella/create/pickup are cohesive and consume Branch Memory without
  necessarily sharing its family.
- **Source control:** Graphite mechanics, stack transforms, conflict repair, GitHub, Flow
  wrappers, stack review remediation, and validation repair have strong relationships but
  may need sub-family boundaries. A single `code` catch-all would hide real owners.
- **Reviews:** review definitions, tripwires, orchestration, and architecture topology are
  related but not identical; the map must decide whether review method, reviewed domain,
  or owning extension is the stable family axis.
- **TypeScript standards:** `typescript-style`, fake-driven testing, the ns overlay, and the
  style tripwire exercise the “one family across dispositions” rule because user-set
  internal verdicts differ from current ambient/public-looking use.
- **Skill system:** management and audit share a skill-system owner even though acquisition
  and content-quality responsibilities remain distinct.
- **Pi UI backends:** the two grill backends are explicitly host-specific and internal;
  family naming should communicate Pi ownership without changing their flat identities.
- **Planning and agent practice:** README-driven development, stack planning, CLI push-down,
  context analysis, project setup, refactor swarm, and changelog work must not be placed in
  a generic `misc` family. Several likely belong with a product domain or repository
  operations instead.

## Questions the destination-map slice must resolve

1. What exact family names distinguish source-control mechanics, Flow-owned wrappers,
   review remediation, PR feedback, and release operations without producing either one
   giant `code` family or one-skill folders?
2. Does Branch Memory own its own family, or a broader durable-context family shared with
   handoffs or branch context? Dependency does not automatically imply ownership.
3. Are review Tripwires grouped by review infrastructure or by the domain they inspect
   (for example TypeScript)?
4. Which non-marked skills are internal because they require ns-only commands,
   repository conventions, or private support surfaces? The user-set six are the minimum,
   not an exhaustive classification.
5. Does any skill have genuine external support intent sufficient for `incubating`, and
   does any have enough warrant for `public`? Portability alone is insufficient.
6. Which runtime lookup design best preserves explicit invocation after canonical sources
   become nested: a generated identity-to-source catalog, canonical lookup through flat
   overlays, or another explicit destination-aware input? Avoid recursive discovery that
   makes identity ambiguous.
7. Which path references are live operational inputs versus historical records? The
   migration should use a classified manifest/checklist rather than blind replacement.
8. What focused verification proves flat discovery, native invocation, command-backed
   expansion, internal handling, exposure checks, lock consistency, provisioning, and
   publish-extra copying after the cutover?

## Design review gate

Reviewers can review or endorse the direction of proposed ADR 0046 while requesting changes
to this inventory, but formal approval remains reserved for the joint ADR-plus-map gate.
Migration remains blocked until the next roadmap item supplies a complete 58-row destination
map, resolves the questions above, revalidates the inventory against then-current trunk,
and receives explicit approval of the ADR and map together.
