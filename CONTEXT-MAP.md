# Context Map

This map is the repository entry point for domain-language context. It records which context files exist, which context files are planned, and which relationship or ambiguity notes must be carried into later focused context sessions.

## Inventory Baseline

Current checkout facts:

- Python workspace inventory: 12 tracked packages under `packages/`.
- In-scope Python context targets: 11 packages. `asdl-dispatcher` is tracked but remains out of context scope while its CLI group has `operations=[]`.
- TypeScript workspace inventory: two repo-local packages, `asdl-dev` and `@asdl/pi-extensions`.
- Present context files: root `CONTEXT.md`, `packages/asdl-core/CONTEXT.md`, `packages/brmem/CONTEXT.md`, and `ts/packages/pi-extensions/CONTEXT.md`.
- Future drift should be handled by focused rebaseline phases before final readback, not silently folded into unrelated package-context sessions.

## Contexts

### Present

- [ASDL Tools](./CONTEXT.md) — Objective-system vocabulary for checked-in durable narrative roadmap records, Active Objective Root, Objective Archive Root, Archived Objective, Objective Update, Objective Close, Objective Archive, Semantic Update, Tracking Gate, and Closure Marker.
- [asdl-core](./packages/asdl-core/CONTEXT.md) — shared CLI, Git, Graphite, GitHub, session, plugin, repository-config, and presentation vocabulary. Keep this as one context file with H2 sections until a subpackage graduates to a standalone package.
- [brmem](./packages/brmem/CONTEXT.md) — Branch Memory primitive vocabulary. Present terms include Branch Memory System, Branch Memory, Namespace, Base Namespace `base`, Entry, Entry Key, Snapshot, Snapshot Ref, Entry Locator, Namespace Copy, Copy Conflict, and Export. Do not describe prompt resolution as ordinary Branch Memory operation, and do not revive stale `Entry Ref` / `Ref locator` wording.
- [asdl-handoff](./packages/asdl-handoff/CONTEXT.md) — directed handoff artifact vocabulary over Branch Memory storage: continuation focus, handoff slug/key, `handoffs` namespace, Handoff Summary, Branch State, List Scope, all-branches inventory, garbage collection, Handoff Technical Locator, and the boundary between durable handoff artifacts and worker-protocol handoffs.
- [@asdl/pi-extensions](./ts/packages/pi-extensions/CONTEXT.md) — repo-local Pi discovery adapters, engineered extension package, saved-plan/planned-branch/checkpoint/handoff language, runner subagents, command runtime, terminal presentation, and CLI bridge vocabulary. This file exists, but still needs the later refresh against the current extension inventory and `asdl-dev` command mirror boundary.

### Planned Python package contexts

- `packages/areg/CONTEXT.md` — agent-resource bootstrap and skill workflow vocabulary: `areg init`, `areg check`, `update-skills`, `skillx`, target agents, managed instruction blocks, installed skill directories, lockfile source types, skill metadata/issues, and transient skill fetch/cleanup. Current source has a narrow `asdl-core.project_config` dependency plus external `gh` and `npx skills` boundaries.
- `packages/asdl-pr-address/CONTEXT.md` — PR review-thread/comment/addressing vocabulary around `PRReviewThread`, `PRReviewComment`, `PRDiscussionComment`, reactions, feedback, thread resolution, and replies.
- `packages/roaster/CONTEXT.md` — review-harness and finding vocabulary: `Roaster`, review definitions, harness runtime/definition/request, review catalogs/sources/formats, findings, inline commentability, severity, frontmatter, findings comments, and inline finding posting.
- `packages/asdl-slots/CONTEXT.md` — worktree slot vocabulary: slot records/inventory/status, repo context, slot GC/init/resize plans, shell directive files, explicit `slot gt` operations, and downstack-only stack release.
- `packages/asdl-objectives/CONTEXT.md` — Objective CLI package vocabulary, including Objective records/statuses, archive/unarchive, checked-in Markdown storage, hidden `exec` commands, and checkout-local list behavior.
- `packages/packagechk/CONTEXT.md` — standalone package-name availability and claimability vocabulary for PyPI/npm checks, registry results, name normalization/validation, claim project specs, publish gateways, and parked Homebrew support.
- `packages/aretro/CONTEXT.md` — deterministic branch-retrospective evidence vocabulary: `collect-evidence`, branch resolution sources, session query/source/warning DTOs, session summaries, aggregate metrics, `EvidenceItemDto`, and the boundary between evidence collection and recommendation judgment.
- `packages/vibechk/CONTEXT.md` — standalone agent-context evaluation vocabulary: baseline/treatment workdirs, plan source, runner adapter, run id, run bundle/store/status, git provenance, metrics, transcript, diff patch, result branch, run report, comparison report, and local-only publish boundary.

### Planned TypeScript package context

- `ts/packages/asdl-dev/CONTEXT.md` — private repo-local developer CLI vocabulary for the flat command table, `preview-url`, `cp`, `submit`, command-runner boundaries, Vercel preview URL resolution, checkpoint-message generation/validation, Graphite dry-run/restack/current-PR verification, and Pi text-generation gateway boundaries.

### Explicitly out of scope for now

- `packages/asdl-dispatcher/CONTEXT.md` — tracked package, but its dispatcher group currently has no operations.
- `packages/asdl-initiatives/CONTEXT.md` — no tracked package exists in the current workspace.
- `packages/asdl-reviewer/CONTEXT.md` — historical package identity replaced by `roaster`; do not recreate unless the package itself returns as a separate tracked package.
- Per-subpackage `packages/asdl-core/**/CONTEXT.md` files — keep `asdl-core` as one context file for now.

## Candidate Relationships

These are current map seeds, not final readback output. Package-context phases should confirm, refine, or reject them before Phase 16 finalizes the relationship list.

- **ASDL Tools → brmem**: Planning and handoff workflows may use Branch Memory, while Objectives themselves remain checked-in Markdown records.
- **ASDL Tools → @asdl/pi-extensions**: Pi extensions expose Objective, saved-plan, planned-branch, checkpoint, handoff, grill, and source-control workflows to the local agent runtime.
- **areg → asdl-core.project_config + external `gh`/`npx skills`**: `areg` reads shared project config from `asdl-core`, but its skill-management work is bounded by external GitHub and `npx skills` command surfaces.
- **brmem → asdl-core.git + asdl-core.clinkr**: brmem uses shared Git gateways and Clinkr command vocabulary to expose branch-scoped text storage.
- **asdl-handoff → brmem + asdl-core.git + asdl-core.clinkr/console/format/plugin**: handoff artifacts use Branch Memory storage while presenting a user-facing handoff inventory and garbage-collection model.
- **asdl-pr-address → asdl-core.gh + asdl-core.git + asdl-core.clinkr/plugin**: PR addressing consumes shared GitHub review/comment/thread types and current-branch/PR lookup boundaries.
- **roaster → asdl-core.gh + asdl-core.git + asdl-core.project_config + asdl-core.clinkr/plugin**: roaster consumes GitHub PR types, local-diff/git facts, shared project config, and Clinkr/plugin mounting.
- **asdl-slots → asdl-core.git + asdl-core.gh + asdl-core.gt + asdl-core.clinkr/console/plugin**: slots owns worktree slot lifecycle while cross-referencing Git worktree/branch/ref facts, GitHub PR state, and explicit `slot gt` Graphite operations.
- **asdl-objectives → asdl-core.git + asdl-core.clinkr + asdl-core.console/format/plugin**: Objective CLI inventory uses Git path-touch facts for checkout-local list metadata. Do not reintroduce `asdl-objectives → brmem` as a storage edge.
- **packagechk → external package registries**: packagechk is standalone/no-`asdl-core`; it owns package-name availability/claimability checks at registry and publish-gateway boundaries.
- **aretro → asdl-core.sessions + asdl-core.git + asdl-core.clinkr/plugin**: aretro collects deterministic branch/session/git evidence and leaves recommendation judgment to the `branch-retro` skill.
- **vibechk → git + runner/store boundaries**: vibechk is standalone/no-`asdl-core`; it owns local evaluation workdirs, run bundles, result branches, metrics, and reports without folding into `asdl-core.sessions` or aretro evidence collection.
- **asdl-dev → git + Graphite + Vercel + Pi text generation**: the private TypeScript CLI owns command semantics for preview URL resolution, checkpoint commits/messages, and Graphite submission verification.
- **@asdl/pi-extensions → Pi runtime + asdl-dev + repo CLIs**: Pi extensions own discovery adapters, argument restoration/UI behavior, command-output presentation, and runtime CLI bridging over `asdl-dev`, `git`/`gt`/`gh`, `brmem`, `objective`, `slot`, and related repo commands.

## Flagged Ambiguities

Carry these collisions forward to focused package-context phases. Do not finalize them here.

- **Review / Comment**: distinguish GitHub PR reviews, review threads, review comments, discussion comments, roaster reviews, roaster findings, findings comments, and inline finding posting.
- **State / status**: separate Clinkr `ExitStatus`, Git worktree/file status, GitHub PR state, Objective statuses, slot inventory status, package-check status, vibechk run status, and handoff branch state.
- **Active / root**: keep Active Objective Root, Objective Archive Root, repository root, Git common dir, Base Namespace, and Graphite trunk distinct.
- **Branch / ref / start-point / snapshot-ref**: preserve Git Branch, Ref, Start point, brmem Snapshot Ref, Entry Locator, current branch, planned branch, result branch, and Graphite stack node boundaries.
- **Graphite stack operations**: distinguish `asdl-core.gt` Graphite vocabulary, `slot gt` operations, and `asdl-dev submit` Graphite verification.
- **Evidence / finding**: distinguish Objective completion evidence, aretro deterministic evidence items, roaster findings, vibechk metrics/reports, and branch-retro recommendation judgment.
- **Plan / attachment / handoff**: distinguish saved plan, source branch plan file, planned branch, attached plan, Branch Memory attachment, handoff artifact, continuation focus, and handoff technical locator.
- **Skill / agent / resource**: reconcile areg target-agent/resource language, skill-management/skillx public workflow language, and Pi extension skill-expansion helpers.
- **Run / evaluation / metric**: reconcile vibechk run/bundle/status/metric vocabulary with aretro session/evidence vocabulary and roaster review/finding output.
- **Checkpoint / autobranch / submit / preview**: assign CLI command semantics to `asdl-dev` and Pi command mirroring/presentation semantics to `@asdl/pi-extensions`.
