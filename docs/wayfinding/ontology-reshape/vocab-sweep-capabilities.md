# Vocabulary sweep: capabilities

Resolves the ontology-reshape roadmap row "Vocabulary sweep: capabilities (research)",
2026-07-10. Question: what domain language lives in `ts/packages/capabilities/*`
(12 packages) that no context file records?

Method: per-package mining of `package.json` export maps, READMEs/AGENTS files, and the
source modules behind each export subpath — exported types and functions naming domain
concepts, CLI command surfaces, Branch Memory namespaces, storage paths, artifact
names, and result/status vocabulary. Terms already recorded in the package's
`CONTEXT.md` or in the root `CONTEXT.md` are excluded; every claim carries a source
citation, and a sample of load-bearing citations was independently re-verified.
Baseline: the drift audit (`drift-audit.md`, same folder) and its verified 29-package /
13-context-file inventory.

## Summary

- The four context-less packages (`pr-feedback`, `retros`, `harness-artifacts`,
  `ns-init`) each carry a full unrecorded vocabulary — 12–17 domain-bearing terms
  apiece. `harness-artifacts` even ships its own README vocabulary section that no
  `CONTEXT.md` mirrors.
- The eight packages with glossaries all have unrecorded clusters, ranging from small
  (plans, handoffs) to large coherent subsystems: Flow's checkpoint/phase-stream/land
  vocabulary, Objectives' entire runner-step vocabulary (gate checks, step facts,
  provenance trailers), Reviews' convergence layer, Slots' checkout-planning and
  Graphite quiescence vocabulary, CCC's dispatch family.
- The loudest cross-package suspect is **two-name capabilities**: package `pr-feedback`
  vs capability "Address"; package `plans` vs durable CLI/store name `enriched-plan`;
  package `retros` vs CLI group `retro`; package `reviews` vs retired doc-side brand
  "Roaster". Each pair is exactly the naming residue the reexamination rows exist to
  decide.
- A candidate **fifth suspect cluster** surfaced: plan-authoring ownership. The
  `ns:plan:*` Pi surfaces and the `write_saved_plan_file` tool are registered by
  branch-context while plans owns the tool name and the store, and user-facing errors
  still teach `enriched-plan exec save`. Neither glossary records the seam. Jotted in
  `ideas.md`; row creation deferred to the triage row.
- One shipped-surface vs root-glossary contradiction: root `CONTEXT.md` lists
  "Wayfinding Objective" as an *Avoid* alias for Ideation Objective, while the create
  surface ships `ns:objective:create:wayfinding` / `objective-create-wayfinding`
  (`CONTEXT.md:29`; `ts/packages/capabilities/objectives/src/core/objective-command-specs.ts:31`).

## Cross-package themes

- **Result/status unions are where domain vocabulary hides.** Nearly every package
  encodes its real ontology in discriminated-union status vocabulary (slot checkout
  plans, land maintenance modes, runner gate checks, provision file decisions,
  handoff GC actions). Glossaries mostly record nouns and miss these verbs/outcomes.
- **Pi-subpackage surfaces are systematically under-documented.** Command names,
  command-backed skills, and launch workflows living in `./pi` subpackages
  (handoff-tab, handoff self, upstack-impl launch, smart restack, stack squash,
  dispatch family) are absent from every glossary, and in branch-context's case
  contradict the recorded Presentation Boundary.
- **Retired-identity residue in live code**: `SLOT_CD_DIRECTIVE_FILE` env var,
  `enriched-plan` bin/store/file names, `nsInitHarnessesSettingsSchema` inside
  harness-artifacts, `fake-*` filenames exporting `InMemory*` classes.

## Per-package inventories

### @nseng-ai/pr-feedback — no CONTEXT.md

Implements the **Address** capability: the `ns address exec ...` command face and
in-process Capability API for downloading and acting on GitHub PR feedback
(README.md:3). Deliberately small contract: one report operation, two batch plumbing
operations, seven read primitives, three review-thread mutation primitives, all
mounted as a hidden agent-only `exec` group under the `address` CLI group
(src/ns-extension.ts:4-57). The old addressing workflow engine is retired and deleted
(README.md:5).

Candidate terms:

- **PR Address / Address** — the capability-facing seam name for PR-feedback
  consumption; ADR 0016 keeps it as the projection over the kit's canonical
  `GithubPrFeedbackGateway`. (src/api.ts:17-19, README.md:25)
- **`ns address exec` operation** — an `ExecOperation`: a named, Zod-schema'd,
  agent-only command leaf on the hidden exec subgroup. (src/exec-operation.ts:27-34)
- **Read primitives / mutation primitives** — the README's classification of the exec
  leaves: reads (`pr-details`, `branch-pr`, `open-prs`, `pr-reviews`,
  `pr-review-threads`, `pr-discussion-comments`, `pr-checks`) vs mutations
  (`reply-review-thread`, `resolve-review-thread`, `close-review-threads`).
  (README.md:14-15, src/primitive-commands.ts:78)
- **PrAddressGithubGateway / PrAddressGitGateway** — the capability's narrowed gateway
  seams. (src/api.ts:84-99)
- **PR target / PrTargetResolution** — resolving which PR an operation acts on, from
  `--pr-number` or the current branch; outcomes `found` / `miss` / `git_failure` /
  `pr_feedback_failure` / `detached_head`. (src/core/pr-target.ts:10-18)
- **Feedback snapshot** — one parallel fetch of a PR's reviews + review threads +
  discussion comments. (src/core/feedback-snapshot.ts:13-18)
- **PR feedback report** — the Markdown artifact `download-feedback` emits, carried as
  `bodyMarkdown`/`markdown` in `DownloadFeedbackPayload`.
  (src/core/download-feedback.ts:35-41, 188-226)
- **Included/excluded counts** — the report's filter accounting (excluded resolved
  threads, empty reviews, automation comments; flags `--include-resolved`,
  `--include-automation`, `--include-empty-reviews`).
  (src/core/download-feedback.ts:26-33, 53-61)
- **Automation-like discussion comment** — a discussion comment classified as
  bot/automation and excluded by default. (src/core/download-feedback.ts:15, 147)
- **Branch→PR mapping** — `map-branch-prs` output: `branchPrs` plus
  `missingBranches` / `ambiguousBranches` and a requested/matched/missing/ambiguous
  summary. (src/core/branch-pr-mapping.ts:14-31)
- **Branch PR checks** — `branch-pr-checks` batched result with per-branch status
  `found` / `missing` / `ambiguous` and normalized check entries; one GraphQL request
  for all branches. (src/core/branch-pr-checks.ts:21-48, README.md:13)
- **Close review threads** — the compound mutation (reply then resolve per thread)
  with per-entry `stage` (`reply` | `resolve`) error attribution.
  (src/core/review-thread-mutations.ts:28-51)
- **Check/status DTO vocabulary through the seam** — `GithubStatusChecks`,
  `GithubStatusCheckEntry`, `GithubCheckTally`, `GithubCheckBucket`,
  `GithubStatusCheckKind`, stable only via the Address API. (src/api.ts:69-75)

Suspects:

- **"Address" vs package name `pr-feedback`** — domain prefix, CLI group, context, and
  API are all Address (`PrAddressContext`, group `address`, error label "Unknown
  Address ... operation") while the package is named for feedback. The two-name split
  needs a deliberate decision. Feeds the review/feedback residue row. (src/context.ts:6,
  src/ns-extension.ts:4, src/exec-operation.ts:43)
- **Retired-engine residue** — README documents the deleted addressing workflow engine
  (payload sessions, classification, checkpoints, finalization); none of that
  vocabulary survives in src/, so any external doc still using it is stale.
  (README.md:5)
- **`./ns-command` export inconsistency** — pr-feedback exposes `./ns-command`
  (package.json:8) while sibling capabilities keep the command factory private.

### @nseng-ai/retros — no CONTEXT.md

Deterministic branch-retrospective **evidence collection** for the `branch-retro`
skill: `ns retro exec collect-evidence` gathers compact factual session evidence, and
`ns retro exec read-evidence-detail` reads one JSON-pointer-targeted value from a
sanitized payload artifact (README.md:3-11, src/ns-extension.ts:4-22). Retro emits
factual observations only; semantic diagnosis belongs upstream (README.md:25). The
standalone `retro` command is retired; there is deliberately no `/api` subpath
(README.md:12).

Candidate terms:

- **Evidence / evidence item** — a factual, aggregated observation over parsed
  sessions (`SessionEvidenceItem` / `EvidenceItemDto`). (src/sessions/evidence.ts:13-21,
  src/contracts.ts:126-136)
- **Evidence kinds** — the fixed ordering `tool-usage-count`, `failed-tool-result`,
  `repeated-file-read`, `repeated-shell-command`, `token-usage-observed`,
  `large-output-observed`. (src/sessions/evidence.ts:23-30)
- **Evidence envelope** — the whole `collect-evidence` result: repo context, query,
  source info, aggregate metrics, session summaries, warnings, evidence items, output
  bounds. (src/contracts.ts:168-187)
- **Session source** — the gateway querying harness session logs; current real adapter
  is `pi-jsonl`, reading the default Pi session root `~/.pi/agent/sessions`.
  (src/sessions/pi-jsonl-source.ts:22-26, 59-60)
- **Session association / confidence** — how a session is tied to a repo/branch:
  `unknown` / `query-repo-root` / `cwd` / `repo-cwd` / `cwd-mismatch` plus supporting
  evidence strings. (src/sessions/types.ts:13-21, 38-44)
- **Branch source** — where the target branch came from: `explicit` /
  `git-current-branch` / `detached` / `unresolved`. (src/contracts.ts:9)
- **Payload mode** — `inline` (compact summaries) vs `payload` (write raw detail to a
  payload artifact for drill-down). (src/operations/collect-evidence.ts:44, 213-232)
- **Payload artifact / PayloadStore** — a private on-disk artifact store rooted at
  `NS_PAYLOAD_ROOT` (default `<tmpdir>/ns`), keyed by `NS_PAYLOAD_SESSION_ID`, laid out
  as `<root>/sessions/<sessionId>/payloads/`; artifacts carry a **descriptor**
  (e.g. `retro-collect-evidence`) and **role** (`raw` / `summary` / `log`).
  (src/payloads/store.ts:36-79, src/payloads/root.ts:11-16, src/payloads/models.ts:7-25)
- **PayloadReference** — the pointer returned to the caller (payloadPath, sessionId,
  descriptor, role, sequence, payloadBytes, contentType). (src/payloads/models.ts:13-25)
- **Output bounds / continuation** — result-truncation vocabulary with continuation
  kinds `increase-max-sessions` / `narrow-session-root` and detail guidance.
  (src/contracts.ts:138-166)
- **Detail locator hints** — canonical `/data/...` JSON Pointers advertised for
  `read-evidence-detail`. (src/operations/collect-evidence.ts:126-134)
- **Value bounds** — `read-evidence-detail`'s per-value metadata (valueKind,
  childCount, estimatedJsonBytes, `isBroadPointer`, narrowingGuidance); pointers must
  target under `/data`. (src/operations/read-evidence-detail.ts:15-23, 71-76)
- **Bounded command subject** — truncation of long shell commands into `subject` +
  sha256 prefix for evidence grouping. (src/command-subject.ts:10-38)
- **Session summary / aggregate metrics** — per-session message/tool/usage counters
  and their roll-up. (src/contracts.ts:97-124)

Suspects:

- **README pointer drift** — README's example uses
  `--json-pointer /data/evidence_items/0` (README.md:21) but the payload document's
  actual key is camelCase `evidenceItems` (src/payloads/evidence-payload.ts:142); the
  documented example would not resolve. Decision-free fix.
- **retros vs retro** — package name plural `retros`, CLI group and README noun
  singular `retro`, retired standalone `retro` command as a third historical surface.
  (src/ns-extension.ts:4, README.md:7, 12)
- **Dual casing boundary** — internal session types are snake_case, DTOs camelCase
  with explicit converters; a glossary should say which spelling is canonical in
  prose. (src/sessions/types.ts:1-11 vs src/contracts.ts:35-57)

### @nseng-ai/harness-artifacts — no CONTEXT.md

Owns the shared catalog, harness path table, provision plan, and local materialization
logic for ns-owned harness artifacts — the substrate behind the `ns skills` command
family, `ns update --extensions` reconcile, and ns-init's SkillMaterializer seam
(README.md:3-5). The README carries its own explicit domain vocabulary section
(README.md:7-13) that no context file mirrors.

Candidate terms:

- **Harness artifact kind** — `skill` | `agent` | `extension-bundle`; only `skill` is
  provisionable today. (src/artifact-catalog.ts:1-3, src/provision-plan.ts:20)
- **Harness id / alias / scope** — target harnesses `claude-code` (alias `claude`),
  `codex`, `pi` (alias `pi-dev`), each with `project` and `user` scoped skill roots;
  README bans "platform" for this domain. (README.md:11, 21-28)
- **First-party catalog** — `NS_FIRST_PARTY_HARNESS_ARTIFACT_CATALOG` (catalogId
  `ns-first-party`), currently one entry: the `objective` skill, artifact id
  `objective-skill`. (src/first-party-catalog.ts:7-24)
- **Artifact source / source type** — `first-party` vs `npm-module` provenance.
  (src/artifact-catalog.ts:5-52)
- **Provision name** — the kind-specific target name via `artifactProvisionName`.
  (src/artifact-catalog.ts:60-69)
- **Provision plan** — a sorted file-level copy plan with per-file content hashes.
  (src/provision-plan.ts:52-62)
- **Prepared provision / preview / apply** — the three-stage flow `prepareProvision` →
  `previewFromPrepared` → `applyPreparedProvision`. (README.md:40-42, src/api.ts:129-145)
- **Provision file decision** — per-file LBYL classification: `fresh-write` |
  `unchanged` | `locally-edited-conflict`; conflicts refuse to clobber without
  `--force`. (src/provision-plan.ts:110-116, README.md:45)
- **Install manifest** — `.ns-harness-artifacts-manifest.json` at the target root,
  entries keyed `<harness>:<scope>:<kind>:<artifactId>` with per-file hashes.
  (README.md:42-43, src/provision-plan.ts:101-104)
- **Reconcile** — converging installed state with desired state: `DesiredHarnessArtifact`,
  `HarnessManifestSnapshot`, `ReconcilePair` (origin `declared` | `manifest`),
  `OrphanedManifestEntry`, `SkippedArtifactCollision`, `ReconcileReport`.
  (src/reconcile.ts:62-109)
- **ns.toml harness/extension selection** — parsing and planned writes of top-level
  `harnesses` and `extensions` in project `ns.toml`; write outcomes `created` |
  `appended` | `replaced` | `unchanged`. (src/ns-toml.ts:13-38)
- **Module artifact discovery/declaration** — finding harness artifacts declared by
  extension npm modules' package manifests. (src/api.ts:109-127)
- **Skill mirror** — the symlink convention mirroring a repo skill into
  `.agents/skills/<name>` and `.claude/skills/<name>`; `SkillMirrorKind` = `agents` |
  `claude`. (src/skill-mirror-conventions.ts:5-33)
- **Skills lockfile** — `SkillsLockfile` mapping skill names to source, sourceType
  (`local` | `github` | `git` | `gitlab`), computedHash. (src/skills-lockfile.ts:8-31)
- **CLI surface** — `ns skills list|path|install` plus top-level `ns update` (`--self`
  | `--extensions` | `--all`, `--target`, `--dry-run`, `--force`).
  (src/ns/extension.ts:7-29, src/ns/update.ts:12-28)

Suspects:

- **README calls reconcile "deferred breadth"** (README.md:63) but reconcile is
  implemented, API-exported (src/api.ts:92-108), and wired into shipped
  `ns update --extensions` (src/ns/update.ts:6-8, 30, 66), which the README's CLI
  section omits. README drift.
- **`ns update --self` / `--all` mounted but unimplemented** — they return "not
  implemented" failures; the surface implies more than exists. (src/ns/update.ts:55-56)
- **`nsInitHarnessesSettingsSchema`** — the harnesses ns.toml schema inside
  harness-artifacts is named after ns-init; naming residue from where the setting
  originated. (src/ns-toml.ts:40-47)
- **"Skills" noun vs "harness artifact" model** — the model spans three kinds but the
  CLI noun, lockfile, mirror, and materializer vocabulary are skill-only; README
  frames this as steelthread scoping (README.md:10, 13) — a live distinction a
  glossary should record.

### @nseng-ai/ns-init — no CONTEXT.md

The `ns init` capability: activating ns Objectives in a repository. Resolves repo and
trunk, writes the managed `ns:objectives` instruction block into `AGENTS.md` (plus a
`CLAUDE.md → @AGENTS.md` import line), creates `.ns/objectives/`, records harness
selection in `ns.toml`, and materializes the `objective` skill via the
harness-artifacts provisioning seam (src/activate-objectives.ts:46-52,
src/ns/extension.ts:4-9).

Candidate terms:

- **Activation / activate Objectives** — the central verb: `activateObjectives`
  producing an `ObjectiveActivationReport`. (src/activate-objectives.ts:30-44)
- **Instruction file** — `AGENTS.md` or `CLAUDE.md` (`InstructionFileName`), accessed
  through the `ActivationFilesGateway`. (src/activation-files.ts:3-8, 40-48)
- **Objective instruction block** — the versioned managed region
  `<!-- ns:objectives:begin v1 --> ... <!-- ns:objectives:end -->`; applying yields
  `appended` | `replaced` | `unchanged` or `malformed`. (src/instruction-block.ts:3-24)
- **Claude agents import line** — the `@AGENTS.md` reference ensured in CLAUDE.md.
  (src/instruction-block.ts:50-60)
- **Harness source** — where harness selection came from: `explicit` (`--harness`
  flags, persisted) vs `ns-toml` (read from project config).
  (src/init-objectives.ts:43-44, 88-161)
- **SkillMaterializer / RealSkillMaterializer** — ns-init's gateway seam for
  provisioning Objective skills (results `materialized` | `unavailable` | `error`),
  with the real adapter a thin wrapper over harness-artifacts'
  `provisionFirstPartySkill`. (src/skill-materializer.ts:5-17,
  src/real-skill-materializer.ts:23-53)
- **ActivationFilesGateway** — the file I/O seam with `InMemory*` fakes exported via
  `./testing`. (src/activation-files.ts:40-48, src/testing/index.ts:1-4)
- **Trunk branch / resolved activation repository** — activation requires resolvable
  repo root and detectable trunk (failures `not-a-git-repo`, `trunk-undetectable`).
  (src/activate-objectives.ts:13-22)
- **File change status** — shared result vocabulary `created` | `appended` |
  `replaced` | `unchanged`. (src/init-objectives.ts:33-46)
- **ns-init error codes** — `ns-init-not-a-git-repo`, `ns-init-trunk-undetectable`,
  `ns-init-agents-block-malformed`, `ns-init-activation-failed`, config read/invalid/
  write failures, `harness-selection-empty`. (src/init-objectives.ts:116-196)

Suspects:

- **"Init" vs "activate" vs scope** — the extension says "Activate ns in a repository"
  (src/ns/extension.ts:4) but every domain function is Objectives-specific and human
  output says "Activated ns Objectives in ..." (src/init-objectives.ts:214). Whether
  `ns init` activates *ns* or *ns Objectives* is an unresolved naming tension.
- **Import-line wording drift** — the constant writes "agent instructions for this
  repository" while this repo's actual CLAUDE.md says "agent onboarding", and
  detection is a loose `includes("@AGENTS.md")`, so variants silently coexist.
  (src/instruction-block.ts:50, 58)
- **`fake-*` filenames vs `InMemory*` exports** — two names for the test-double
  convention. (src/testing/index.ts:1-4)

### @nseng-ai/branch-context — has CONTEXT.md

Unrecorded terms:

- **Branch Creation Method** — `plain-git` (default) or `graphite` (`git branch` +
  `gt track --parent`, explicitly not `gt create`).
  (src/core/branch-context-creation.ts:17-23)
- **Target Branch Selection (exact vs auto-suffixed)** — creation probes up to 100
  `-N` suffixed candidates, recording selection type and collisions.
  (src/core/branch-context-creation.ts:51-53, 303-349)
- **Target Branch Occupancy** — per-candidate collision facts; a "stale Branch Memory
  attachment" (plan key present, branch absent) blocks creation and points at
  `brmem gc`. (src/core/branch-context-creation.ts:411-449, 505-517)
- **Branch Context Evidence** — the structured success record returned by creation;
  the glossary mentions it only in passing inside the Capability API entry.
  (src/core/branch-context-creation.ts:55-67; CONTEXT.md:26)
- **Branch Context Output Message** — the Pi session artifact with
  `customType: "branch-context-output"` and statuses `usage | dry-run | success |
  loaded-plan | reuse | failure | cancelled`, scanned newest-first for session
  evidence. (src/core/session-artifact.ts:8-17, 87-97)
- **Existing Branch Context Reuse** — reuse sources `explicit-branch |
  session-output | current-branch`. (src/core/existing-branch-reuse.ts:9-18, 45-109)
- **Supported vs Legacy Plan Key** — `<slug>.md` supported; `plan.md` is the named
  legacy key loading refuses. (src/core/constants.ts:4-19,
  src/core/attached-plan.ts:432-443)
- **Saved-Plan Fallback** — plan loading falls back to the local plan store
  (`source: "saved"`, pseudo-namespace `"local-plan-store"`).
  (src/core/attached-plan.ts:29, 156-179, 251-280)
- **Plan Content Slug** — model-derived slug generated from plan content only.
  (src/core/plan-content-slug.ts:20-29)
- **Safe Implementation Branch** — load-time guard refusing detached HEAD and trunk.
  (src/core/attached-plan.ts:386-426)
- **Plans-Write Point / write_saved_plan_file tool** — the `branch-context.plans-write`
  prompt point, the phased tool flow, and the plan-authoring Pi commands
  `/ns:plan:save`, `/ns:plan:grill-and-save`, `/ns:plan:impl-saved-plan`. The
  implementation command accepts an explicit Saved Plan or session-first/latest-store
  fallback selection.
  (src/ns/extension.ts:7-13, src/pi/enriched-plan-save.ts:55-68, src/pi/surfaces.ts:5-7)
- **Upstack Impl Launch** — checkout of a just-created branch context plus a
  replacement implementation session running `/ns:branch-context:impl-attached-plan`.
  (src/pi/gt/upstack-impl-launch.ts:34-80, src/pi/surfaces.ts:2-4)
- **Plan Contract Trial** — README-only vocabulary: the "branch-context plan contract
  protocol", a trial-shaped prompt-policy change with a single-revert rollback path.
  (README.md:5-9)

Suspects:

- **Presentation Boundary contradiction (confirms drift-audit finding)** — the
  glossary says command names like `/ns:branch-context:impl-attached-plan` are "owned
  by Pi/CCC presentation code, not by `@nseng-ai/branch-context`", yet those exact
  constants live in the package at src/pi/surfaces.ts:1-7 and the package declares
  `@nseng-ai/pi` as an optional peer for its `pi` subpackage. (CONTEXT.md:30)
- **Plan-namespaced surfaces defined in branch-context** — `ns:plan:*` commands are
  registered here, not in plans; the ownership seam is undocumented in either
  glossary. (src/pi/surfaces.ts:5-7) → candidate fifth suspect cluster.
- **Enriched-plan residue in user guidance** — the no-entries error teaches "Create a
  saved plan with `enriched-plan exec save`". (src/core/attached-plan.ts:60-66)
  File/test names also still use `enriched-plan` (src/pi/enriched-plan-save.ts).

### @nseng-ai/plans — has CONTEXT.md

Unrecorded terms:

- **Enriched Plan** — the package's own CLI defines it ("An enriched plan is any plan
  saved into ns"); the durable bin is `enriched-plan` and the store root segment is
  `enriched-plan`. The glossary uses the phrase only as a path fragment.
  (src/cli.ts:100, package.json:13-15, src/saved-plan-file.ts:129)
- **Plan Slug** — validated kebab-case, word-count-bounded identifier naming a saved
  plan file. (src/content-slug-derivation.ts:10, 73-77, src/cli.ts:181-183)
- **Repo Plan Store Key** — encoded repo directory name: `gh--<owner>--<repo>` for
  GitHub identities, else sanitized identity. (src/saved-plan-file.ts:136-147)
- **Repo Identity Source** — `origin-url` vs `repo-root` fallback.
  (src/saved-plan-file.ts:25, 526-546)
- **Branch Key / Branch Path Segment** — the encoded source-branch directory segment.
  (src/saved-plan-file.ts:149-154, src/cli.ts:327)
- **Content Slug Derivation / Variant Seed** — model-backed slug derivation
  parameterized by a `PlanContentSlugVariantSeed`, 32k-char truncation, `-plan` suffix
  strip. (src/content-slug-derivation.ts:12-20, 49-57)
- **Saved Plan File Evidence** — the structured save record, distinct from the
  recorded Plan Store Directory Evidence. (src/saved-plan-file.ts:92-101, 192-207)
- **Session Saved-Plan Validation** — validating a `write_saved_plan_file` session
  tool-result as `valid | stale | unsafe`. (src/saved-plan-selection.ts:19-33, 108-160)
- **No-Saved-Plan Reasons** — typed negative outcomes `missing-directory |
  no-plan-files`. (src/saved-plan-file.ts:108-124)
- **Plan Store Gateway** — the filesystem seam (`writeTextFileExclusive`, …).
  (src/index.ts:12-20)
- **Plans exec surface** — `enriched-plan exec save` (exactly one of `--stdin` /
  `--content-file`) and `exec resolve` (explicit vs latest), plus public `list`.
  (src/cli.ts:113-141)

Suspects:

- **Dual naming: Saved Plan vs enriched plan** — glossary says "plans"/"Saved
  Plan"/"Local Plan Store" but the durable public CLI binary and store path segment
  are `enriched-plan`, and the CLI mints its own definition the glossary never
  reconciles. (package.json:13-15, src/cli.ts:100) → candidate fifth suspect cluster.
- **Tool/surface split with branch-context** — `write_saved_plan_file` is exported
  from plans but registered by branch-context's Pi extension; the seam is undocumented
  in both glossaries. (src/saved-plan-selection.ts:19;
  branch-context src/pi/enriched-plan-save.ts:23-29)

### @nseng-ai/handoffs — has CONTEXT.md

Unrecorded terms:

- **Semantic Slug Derivation** — deriving a handoff slug from the Continuation Focus
  text (lowercase, dash-joined, ≤8 words). (src/core/identity.ts:12-22)
- **Content-Derived Slug** — the Pi tool `derive_handoff_slug_from_content` deriving
  the slug from session content instead. (src/pi/command-constants.ts:22,
  src/pi/tab.ts:44-47)
- **Handoff Tab** — the `/ns:ccc:handoff-tab` workflow: create a directed handoff,
  then launch a pickup Pi in a new cmux tab (tool `handoff_tab_launch`).
  (src/pi/command-constants.ts:15-23, src/pi/tab.ts:32-79)
- **Handoff Self (self-handoff)** — `/ns:handoff:self`: create a handoff and queue its
  own pickup as a session replacement (`handoff_self_queue_pickup`,
  `self-handoff-ready`, 10-minute timeout). (src/pi/command-constants.ts:20-30,
  src/pi/self.ts:32-69)
- **Handoff Launch Flow** — the shared launch machinery (launch request, prompt copy,
  launch tool, prepared create-launch). (src/pi/launch-flow.ts via src/pi/self.ts:5-14)
- **Create Focus Question** — the mandatory "What should the future session continue
  from this handoff?" gate. (src/pi/command-constants.ts:34, src/pi/create-focus.ts:14-27)
- **Command-backed skills handoff-create / handoff-pickup** — skill registrations
  bound to the create/pickup surfaces. (src/pi/command-backed-skills.ts:5-8)
- **Interactive Claude Pickup Spawn** — running a continuation by spawning the
  `claude` CLI with inherited stdio (`spawn-failed | exited`).
  (src/pi/interactive-spawn.ts:10-33)
- **GC report vocabulary** — per-entry actions `wouldDelete | deleted | keptActive |
  error` with counts. (src/core/gc-core.ts:16-44)
- **Handoff gateway family** — per-operation narrowed gateway shapes
  (`HandoffCreateBrmemGateway`, `HandoffDeleteStorageDeps`, targets…).
  (src/api/index.ts:26-47)
- **Handoff Picker** — pickup with no selector: auto-pickup when exactly one exists,
  picker when several; selector accepts `semantic-slug|search words`.
  (src/pi/pickup-list.ts:33-41)

Suspects:

- **`ns:ccc:handoff-tab` namespace exception** — deliberately minted in the ccc
  namespace while "owned end-to-end by handoff", documented only in a code comment.
  (src/pi/command-constants.ts:15-19)
- **Command Face wider than recorded** — glossary enumerates
  `ns handoff list|pickup|create|delete|gc`, but the Pi action vocabulary adds `self`
  and the tab workflow. (CONTEXT.md:67-69, src/pi/command-constants.ts:6, 19-20)

### @nseng-ai/flow — has CONTEXT.md

Unrecorded terms:

- **Checkpoint / [cp] Checkpoint Commit** — the `ns flow cp` workflow: capture the
  pending worktree, refuse trunk/clean worktrees, model-author a validated `[cp]`
  commit message, stage and commit; backed by a `CheckpointGateway`.
  (src/ns/commands/cp.ts:24-31, src/checkpoint/checkpoint.ts:26-41)
- **Phase Stream** — Flow's live multi-phase progress driver: ordered `PhaseSpec`
  lists (`CP_PHASES`, `SUBMIT_PHASES`, `LAND_PHASES`), typed phase events, and the
  sole `flow → clinkr` edge. (src/phase-stream/phase-stream.ts:1-58)
- **Matrix Progress** — grid-shaped submit/land progress with cell states `pending |
  active | done | skipped | failed`. (src/phase-stream/matrix-progress-core.ts:30-46)
- **Failure Catalog** — typed exhaustive map from failure-union `kind` to message
  formatter. (src/phase-stream/failure-catalog.ts:1-13)
- **Submit Detection** — output-sniffing predicates for Graphite submit semantics
  (`detectRestackNeeded`, `detectTrunkOutOfDate`, …). (src/submit/submit-detect.ts:25-51)
- **Autobranch Transaction / Latest-Commit Autobranch** — the dirty-worktree
  transaction over a `PendingWorktreeSnapshot` and the `ns flow branch-latest-commit`
  variant with `CreatedBranchRecovery` / `SourceResetFailureRecovery`.
  (src/autobranch/dirty-worktree.ts:29-44, src/autobranch/latest-commit.ts:24-43)
- **Autoslot / Slot Checkout** — autobranch-then-checkout-into-a-managed-slot
  (`checkoutSlot`, `SlotClient`). (src/autoslot/autoslot.ts:13-27, 45-70)
- **Land Backup Refs** — pre-land SHAs under `refs/ns/flow-land-backup/<branch>` with
  one previous generation under `refs/ns/flow-land-backup-prev/<branch>`.
  (src/land/stack/constants.ts:13-14)
- **Single-Branch Fast Path** — the land shortcut when the snapshot is exactly one landing
  branch with no descendants. (src/land/single-branch-fast-path.ts:43-50)
- **Post-Landing Slot Cleanup** — after-land decisions `not-needed | approved |
  declined`. (src/land/post-landing-slot-cleanup.ts:22-41)
- **Graphite Maintenance Mode** — per-landing maintenance vocabulary `required-next-
  landing | optional-descendants | none | skip-descendant` with severity and
  checked-out-conflict handling. (src/land/stack/graphite-maintenance-plan.ts:11-28)
- **External Call Telemetry** — `flow_land.external_call` events with transport and
  category plus a static GitHub quota estimate.
  (src/land/stack/external-call-telemetry.ts:6-40)
- **Changes Model Summary** — the `ns flow changes` model output contract (1–4
  bullets, explicitly not a `[cp]` message). (src/changes/changes-model-summary.ts:14-40)
- **Smart Restack / Stack Squash** — Pi Graphite commands with cross-harness parity:
  `code:gt-restack-resolve` (portable skill `code-gt-restack-resolve`) and
  `gt:squash-stack` (`squashed | already_one_commit`). (src/pi/smart-restack.ts:19-45,
  src/pi/stack-squash.ts:14-42)
- **Flow Submit Points** — extension points `flow.submit.pre` and
  `flow.submit.pr-description`. (src/ns/extension.ts:7-19)

Suspects:

- **Glossary misreads `cp` as "copy"** — the Flow entry lists workflows as "changes,
  copy, autoslot, …" but `ns flow cp` is a checkpoint commit; the list also omits the
  registered `branch-latest-commit` command. Decision-free fix candidate.
  (CONTEXT.md:7-9, src/ns/commands/cp.ts:24)
- **Stack Landing Target vs `LandingShape`** — the glossary term corresponds to code
  type `LandingShape`; neither references the other. (CONTEXT.md:39-41,
  src/land/single-branch-fast-path.ts:12, 32)
- **Stack Snapshot unrecorded** — the fact shape the recorded Stack Landing Plan is
  planned from. (src/land/single-branch-fast-path.ts:17, 43-50)
- **Exec naming residue** — command registered as `read-graphite-branch-metadata`
  while module/subpath are `exec-read-graphite-branch-metadata`.
  (src/ns/extension.ts:69-77)

### @nseng-ai/ccc — has CONTEXT.md

Unrecorded terms:

- **Prompt dispatch** — `/ns:ccc:workspace:dispatch-prompt`: stage a prompt into
  Branch Memory namespace `ccc-dispatch` (key `prompt.md`), create a tracked Graphite
  branch, open it in a cmux slot with Pi launched on the prompt.
  (src/cmux/dispatch-prompt.ts:36-38, src/cmux/command-surfaces.ts:19-22)
- **Trunk dispatch** — `/ns:ccc:workspace:dispatch-from-trunk`: refresh Graphite trunk
  and create a branch "intentionally unrelated to the caller's current stack".
  (src/cmux/dispatch-from-trunk.ts:16-25, 41-44)
- **Dispatch destination** — the `"workspace" | "surface"` split behind the paired
  dispatch-plan commands. (src/cmux/slot-dispatch-plan.ts:43-49,
  src/cmux/command-surfaces.ts:7-14)
- **Plan dispatch** — dispatching the latest session-saved plan into a branch-context
  on a freshly checked-out slot branch. (src/cmux/slot-dispatch-plan.ts:1-31)
- **Claude plan tab** — `/ns:ccc:claude-plan-tab`: seed a cmux terminal tab running
  Claude from the session's last assistant message via a timestamped prompt file.
  (src/cmux/claude-plan-tab.ts:11-53)
- **Timestamped prompt file** — the staging artifact handing prompt content to
  launched tabs/sessions. (src/api/handlers.ts:36-42)
- **Sidebar summary commands / CCC sidebar controller** —
  `/ns:ccc:sidebar:{session-summary,branch-state-summary,objective-summary}` plus
  `createCccSidebarController`; validates objective selectors against
  `.ns/objectives/` and renders sidebar title/description.
  (src/cmux/command-surfaces.ts:28-39, src/cmux/objective-sidebar.ts:20-49)
- **Cmux workspace summary** — hidden `ccc exec cmux-workspace-summary` applying
  title/description to the caller workspace and clearing the `pi-summary` status key.
  (src/cmux/workspace-summary.ts:11-12, src/ns/cli.ts:95-96)
- **Autoslot result vocabulary** — result kinds `success | refusal | failure` (a
  declined guardrail renders as refusal). (src/ns/autoslot-presentation.ts:1-33)
- **Branch slug generation** — model-generated branch slugs from `task | plan` content
  with sanitize/trim/finalize helpers. (src/cmux/branch-slug.ts:19-40)
- **Command-backed skill `ccc-sidebar`** — the registration backing the sidebar
  branch-state summary. (src/pi/command-backed-skills.ts:5-7)

Suspects (largely confirming and extending the drift audit):

- **Subpackage-list drift confirmed** — CONTEXT.md names `core`, `autobranch`, `cmux`
  (+`pi`), but `ns.subpackages` is `["api", "cmux", "ns", "pi"]` and no `src/core/` or
  `src/autobranch/` exists. (CONTEXT.md:3, package.json)
- **Worktree-status ownership drift confirmed** — no `worktree-status` reference in
  ccc src/test; implementation lives in `@nseng-ai/pi/worktree-status`
  (hosts/pi src/parity/worktree-status.ts:3-8), yet CONTEXT.md defines it as
  CCC-owned. (CONTEXT.md:59-65)
- **Retired `/ns:objective:stack-impl` residue confirmed** — appears twice in
  CONTEXT.md, nowhere in src/test. (CONTEXT.md:40, 44)
- **AGENTS.md stale reference paths** — cites `src/autoslot.ts`, `src/land.ts`,
  `src/land-stack.ts`, `src/land-stack/command-stream.ts`; real files are
  `src/ns/autoslot.ts` / `src/ns/land.ts`, and no land-stack file exists.
  (AGENTS.md:18-19)
- **Flow-facade residue** — `./land`, `./trunk-pull`, `./autoslot` subpaths are pure
  re-export shims over `@nseng-ai/flow/api`, sitting oddly under the glossary's
  "Flow land consumption" framing. (src/ns/land.ts:1-17, src/ns/trunk-pull.ts:1-2)

### @nseng-ai/objectives — has CONTEXT.md

Real exec roster (src/ns/extension.ts): `list-candidates`, `load-orientations`,
`read-objective`, `runner-begin`, `runner-finish`, `runner-subagent-usage`,
`tracking-gate` — the glossary lists only three (confirms drift-audit undercount).

Unrecorded terms (the runner subpackage carries the richest cluster):

- **Runner bookends (runner-begin / runner-finish)** — the decomposed ADR 0024 flow:
  begin runs LBYL preconditions and emits step facts plus the subagent prompt (no
  child dispatch); finish, run by the parent and never the subagent, validates facts
  and report fail-closed. (src/runner/begin.ts:1-6, src/runner/finish.ts:1-12)
- **Step facts** — parent-held output of begin (slug, mode, baseBranch,
  headAtDispatch, reportPath, …) replayed verbatim to finish.
  (src/runner/begin.ts:42-51, src/runner/finish.ts:52-58)
- **Runner report (child report)** — subagent-written JSON with statuses
  `ready-for-parent-commit | stop | blocked` and five mandated narrative sections.
  (src/runner/report.ts:7-25)
- **Verification gate / gate checks** — ten deterministic pre-commit check ids
  (`branch-not-trunk`, `moved-off-base`, `same-branch-as-attempt`,
  `branch-matches-report`, `graphite-tracked`, `worktree-dirty`, `head-unchanged`,
  `index-clean`, `stage-candidate`, `diff-check`), each `passed | failed | skipped`,
  collected into a `GateOutcome`. (src/runner/gate.ts:7-27, 57-60)
- **Runner Checkpoint statuses / two-zone rendering** — statuses `committed | stop |
  blocked | verification-failed | malfunction`; verified runner-attested facts zone
  followed by labeled unverified child narrative. (src/runner/checkpoint.ts:4-15, 30-38)
- **Provenance trailers** — `Objective-Runner-Step:` / `Objective-Runner-Mode:` commit
  trailers (ADR 0022). (src/runner/commit.ts:12-22)
- **Recover mode** — `RunnerStepMode` `default | recover`; `--recover` repairs the
  dirty tree a failed step left, with the recover branch as dispatch base.
  (src/runner/begin.ts:25-28, src/runner/preconditions.ts:8-9)
- **At-prefixed value** — the flag convention where `@`-prefixed values are file paths
  (`--facts`, `--report`, `--guidance`). (src/runner/guidance.ts:20-27,
  src/runner/finish.ts:39-50)
- **Parent guidance** — parent-supplied text woven verbatim into the subagent prompt.
  (src/runner/begin.ts:29-33)
- **Runner forbidden-actions rule** — no write-capable external action may leave the
  machine from a runner step. (src/core/objective-runner-rules.ts:1-2)
- **Runner subagent usage** — session-usage JSONL parsed into token/USD totals with
  per-file statuses. (src/core/operations/runner-subagent-usage.ts:16-39)
- **Objective autorun** — the `ns:objective:autorun` command / `objective-autorun`
  skill: repeated verified runner steps with continue/recover/stop decisions, a step
  budget, standing guidance. (src/core/objective-command-specs.ts:4, 194-202)
- **Objective create patterns** — `ns:objective:create` plus per-pattern commands
  `ns:objective:create:{wayfinding, steelthread, standing, umbrella, autoobjective,
  readme-driven-development}`. (src/core/objective-command-specs.ts:30-43)
- **Changed-active-objective selection** — diff-derived picker vocabulary: changed
  slugs vs trunk, change basis label, selection modes `compact-diff-suggestion |
  advancement`, "View other active Objectives…" escape.
  (src/core/objective-picker.ts:5-18, src/core/objective-selection.ts:3-9)

Suspects:

- **Exec roster undercount confirmed** — glossary lists 3 of 7 mounted exec leaves.
  (CONTEXT.md:28, src/ns/extension.ts:23-65)
- **`runner` subpackage never named** — declared in `ns.subpackages` yet carrying the
  richest unrecorded vocabulary. (package.json)
- **Wayfinding naming contradiction** — root CONTEXT.md lists "Wayfinding Objective"
  as an *Avoid* alias for Ideation Objective (CONTEXT.md:29), yet the shipped surface
  is `ns:objective:create:wayfinding` / skill `objective-create-wayfinding`.
  (src/core/objective-command-specs.ts:31)
- **Internal doc drift** — finish.ts header says "five-part verification gate";
  gate.ts defines ten check ids. (src/runner/finish.ts:4, src/runner/gate.ts:7-18)

### @nseng-ai/reviews — has CONTEXT.md

Roaster check: "Roaster" appears nowhere in the package (src, test, README, CONTEXT,
package.json); it survives only doc-side in ADRs.

Unrecorded terms (the convergence layer is the largest coherent cluster):

- **Review convergence** — the ADR 0027 umbrella mechanism preventing the
  resolve→resubmit treadmill of stateless whole-diff reviews. (README.md:112-114)
- **Generation-time semantic suppression** — the primary layer: gathering assembles
  Prior-findings context and Last-reviewed head as prompt inputs, with an anchoring
  guard limiting suppression to the same underlying issue. (README.md:116-118)
- **Exact-match publication dedupe / comment marker** — sha256-derived inline markers
  and a `<!-- reviews:<key> -->` summary-comment key; publication skips byte-identical
  repeats. (src/core/findings-comment.ts:147-148, 223, README.md:119)
- **`reviews-state:v1` block** — the machine-readable state block in the Findings
  comment (last-reviewed head, base ref, merge-base, capped cumulative finding
  union); GitHub is the durable convergence store. (src/core/findings-comment.ts:18,
  README.md:121, src/core/prior-findings-context.ts:88)
- **PR-delta changed-since semantics** — changed-since uses merge-base semantics so a
  content-preserving restack/force-push does not read as churn. (README.md:118)
- **Review applicability (`applies_to`)** — frontmatter include/exclude globs driving
  `ns reviews list --applicable`. (README.md:36-39, src/core/models.ts:27-33)
- **Local-only review / CI discovery** — `local_only: true` never runs in CI;
  `ns reviews list --ci` feeds the review matrix. (README.md:35, 86-101)
- **Review display role** — `tripwire | deep_review` derived from model profile.
  (src/core/review-display.ts:1-8)
- **Input coverage / prompt-sized diff** — token-capped review input (90k prompt cap,
  40k per-file) with omitted files recorded under reasons `file-exceeds-cap |
  diff-budget-exhausted`. (src/gateways/review-runner-diff-cap.ts:9-10,
  src/core/models.ts:4-7)
- **Inline commentability classification** — inlineable vs fallback-only with reasons
  `missing-path | missing-line | file-not-changed | patch-unavailable |
  line-not-in-diff` and posting outcomes `posted | skipped-duplicate | fallback-only |
  api-error`. (src/core/inline-commentability.ts:8-18, src/core/models.ts:8-20)
- **Record findings** — hidden `ns reviews exec record-findings`: same-session
  findings from stdin JSON into the Branch Memory review log, no GitHub publication.
  (src/commands/exec-record-findings.ts:10-13)
- **Claude Code review runner** — the gateway executing a review through the Claude
  Code CLI with a JSON-schema-constrained findings payload.
  (src/gateways/claude-code-review-runner.ts:28-40)
- **Skill reviews surface** — `./skill-reviews` mapping definitions to command-backed
  skills (`skill:<key>` for `*-tripwire` keys, else `skill:review-<key>`).
  (src/core/skill-reviews.ts:25-39)
- **Reviews bot login** — publication identity pinned to `github-actions[bot]`.
  (src/core/reviews-bot.ts:1)

Suspects:

- **Roaster residue is doc-side only** — ADR 0007 speaks of "the TypeScript roaster
  package" in present tense; the then-current ADR 0015 taught `roaster exec publish-findings` (the current raw-exit authority is ADR 0010); the
  glossary retires the standalone binary but never names Roaster as the retired
  brand, leaving no recorded bridge from ADR vocabulary to Reviews. Feeds the
  review/feedback residue row. (docs/adr/0007-roaster-shared-diff-parser.md:1-22,
  historical ADR 0015, line 53; current locator ADR 0010)
- **Convergence cluster unrecorded** — glossary records two inputs (Prior-findings
  context, Last-reviewed head) but not the umbrella term, the suppression/dedupe
  split, or the `reviews-state:v1` store. (CONTEXT.md:67-77 vs README.md:112-123)

### @nseng-ai/slots — has CONTEXT.md

Unrecorded terms:

- **Checkout plan** — the discriminated planning result: `reuse_assignment |
  branch_in_main_worktree | assign_to_slot | branch_in_use | pool_full`.
  (src/core/planning.ts:15-20)
- **Pool full** — the refusal when no slot is available; remedied by `ns slot free` or
  `ns slot resize`. (src/core/planning.ts:20, README.md:28)
- **Current-worktree redirect** — when `--current`/claim moves the current branch into
  a slot, the vacated worktree checks out previous or trunk (`role: "previous" |
  "trunk"`) or detaches HEAD. (src/core/planning.ts:22-29)
- **Claim** — the `ns slot claim` lifecycle verb. (src/lifecycle/operations/claim.ts:8-25)
- **Freed slot / release-target failures** — `slot-not-assigned |
  operation-in-progress | dirty-worktree | detach-failed`.
  (src/lifecycle/release-target.ts:4-25)
- **Slot GC action vocabulary** — PR-state-driven outcomes `freed | would-free |
  kept-open-pr | kept-no-pr | skipped-dirty | skipped-operation | error`.
  (src/lifecycle/gc.ts:19-27)
- **Foreach** — `ns slot foreach -- <argv>`: run a command in every managed slot in
  slot order with capped output tails. (src/lifecycle/operations/foreach.ts:15-40)
- **Quiescence** — `ns slot gt exec quiescence`: a stack snapshot (scope `downstack |
  full`) plus blockers `checked-out-elsewhere | rebase-in-progress |
  slot-rebase-in-progress | ref-drift` for judging whether a stack is safe to mutate.
  (src/lifecycle/operations/gt/exec/quiescence.ts:14-50)
- **Free-stack** — `ns slot gt free-stack [--downstack]` with noop reasons `on-trunk |
  no-slots`. (src/lifecycle/operations/gt/free-stack.ts:16-26)
- **Stack walk / metadata warnings** — Graphite-metadata ancestor/descendant walks
  with cycle/missing warnings and children-corruption rendering.
  (src/lifecycle/operations/gt/exec/metadata-warnings.ts:8-30)
- **Slot operation (in-progress git operation)** — the `SlotRecord.operation` fact
  that makes a slot assigned-but-untouchable. (src/core/inventory.ts:12-31)
- **Destructive result block** — the shared presentation shape for destructive slot
  operations. (src/lifecycle/operations/destructive-presentation.ts)

Suspects:

- **Legacy env-var residue** — cd-directive lookup checks `SLOT_CD_DIRECTIVE_FILE`
  before `NS_CD_DIRECTIVE_FILE`; docs describe only the ns-owned wrapper.
  Standalone-`slot`-era naming in live code. (src/core/shell/cd-directive.ts:6-7, 35-39)
- **"cd directive" vs recorded "Shell Directive"** — code and env vars say
  cd-directive; the glossary term is Shell Directive with no alias bridging them.
  (src/core/shell/cd-directive.ts:9-12, CONTEXT.md:45-47)
- **CONTEXT.md formatting nit** — missing blank line before the
  `**Slot Graphite Command Group**` entry. (CONTEXT.md:51-52)
- **Possibly stale transition note** — README's "extension-contract transition"
  wording about `@nseng-ai/kernel/sdk` command metadata reads temporary; re-verify.
  (README.md:44)
