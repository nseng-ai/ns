# Context Map

This map is the repository entry point for domain-language context. It records which context files exist, which context files are planned, and which relationship or ambiguity notes must be carried into later focused context sessions.

## Inventory Baseline

Current checkout facts:

- Python workspace inventory: no active first-party Python workspace packages remain.
- In-scope Python context targets: none. Former Python capability packages were ported to TypeScript, retired, or deleted as migration reference material.
- TypeScript workspace inventory: 19 repo-local packages under `ts/packages/`. This map's TypeScript package-context coverage is intentionally partial pending a focused rebaseline.
- Present context files: root `CONTEXT.md`, `ts/packages/handoff/CONTEXT.md`, `ts/packages/brmem/CONTEXT.md`, `ts/packages/pi-extension-runtime/CONTEXT.md`, `ts/packages/pi-extensions/CONTEXT.md`, `ts/packages/ccc/CONTEXT.md`, and `ts/packages/sdl/CONTEXT.md`.
- Future drift should be handled by focused rebaseline phases before final readback, not silently folded into unrelated package-context sessions.

## Contexts

### Present

- [SDL Tools](./CONTEXT.md) — Objective-system vocabulary for checked-in durable narrative roadmap records, Active Objective Root, Objective Archive Root, Archived Objective, Objective Update, Objective Close, Objective Archive, Semantic Update, Tracking Gate, and Closure Marker; plus an **Architecture Boundaries** section defining the repo-wide Gateway and Domain logic terms (canonical definitions replicated from the `typescript-fake-driven-testing` skill).
- [@sdl/handoff](./ts/packages/handoff/CONTEXT.md) — active directed handoff artifact vocabulary over Branch Memory storage for the TypeScript standalone `handoff` CLI: continuation focus, Create a Handoff, Pick Up a Handoff, List Handoffs, and Delete a Handoff actions, handoff slug/key, `handoff` namespace, Handoff Summary, Branch State, List Scope, all-branches inventory, garbage collection, Handoff Technical Locator, and the boundary between durable handoff artifacts and worker-protocol handoffs.
- [@sdl/brmem](./ts/packages/brmem/CONTEXT.md) — Branch Memory primitive vocabulary. Present terms include Branch Memory System, Branch Memory, Namespace, Base Namespace `base`, Entry, Entry Key, Snapshot, Snapshot Ref, Entry Locator, Namespace Copy, Copy Conflict, and Export. Do not describe prompt resolution as ordinary Branch Memory operation, and do not revive stale `Entry Ref` / `Ref locator` wording.
- [@sdl/pi-extension-runtime](./ts/packages/pi-extension-runtime/CONTEXT.md) — neutral Pi extension runtime helper vocabulary for command presentation, Branch Memory command discovery/execution helpers, machine-envelope parsing, terminal text shaping, skill expansion, Objective picker/selection helpers, branch-slug normalization, and cmux/Pi runtime types shared below CCC and repo-local Pi extensions.
- [@sdl/pi-extensions](./ts/packages/pi-extensions/CONTEXT.md) — repo-local Pi discovery adapters, engineered extension package, worktree-status/Pi footer lifecycle adapter language, enriched-plan/branch-context/checkpoint/handoff language, runner subagents, CCC command-prefix boundary, SDL command mirrors, and CLI bridge vocabulary. This file exists, but still needs a later focused refresh against the full current extension inventory.
- [@sdl/ccc](./ts/packages/ccc/CONTEXT.md) — CCC (Cmux Command and Control) vocabulary for the private TypeScript orchestration layer that composes Pi, cmux, Graphite, Objective, handoff, branch-context, autobranch/land, and owns worktree-status observability without lower packages importing it.
- [@sdl/sdl](./ts/packages/sdl/CONTEXT.md) — Source Development Lifecycle CLI vocabulary for SDL command surfaces, SDL extensions, SDL command entries, `@sdl/sdl/sdk` as the public SDL extension API, internal migration exports, SDL Pi mirrors, hard cutover, and lower orchestration ownership.

### Planned TypeScript package contexts

These are active TypeScript package context targets for later focused domain-language sessions. Do not recreate deleted Python package paths when authoring them.

- `@sdl/areg` — agent-resource bootstrap and skill workflow vocabulary: `areg init`, `areg check`, `update-skills`, `skillx`, target agents, managed instruction blocks, installed skill directories, lockfile source types, skill metadata/issues, transient skill fetch/cleanup, and external `gh` / `npx skills` boundaries.
- `@sdl/roaster` — CI PR-diff findings vocabulary: `Roaster`, review definitions, Claude Code review execution, review catalogs/sources, findings, inline commentability, severity, frontmatter, findings comments, and inline finding posting.
- `@sdl/slot` — worktree slot vocabulary: slot records/inventory/status, repo context, slot GC/init/resize plans, shell directive files, explicit `slot gt` operations, and downstack-only stack release.
- `@sdl/objective` — Objective CLI package vocabulary, including Objective records/statuses, archive/unarchive, checked-in Markdown storage, hidden `exec` commands, and checkout-local list behavior.
- `@sdl/packagechk` — standalone package-name availability and claimability vocabulary for PyPI/npm checks, registry results, name normalization/validation, claim project specs, publish gateways, and parked Homebrew support.
- `@sdl/aretro` — deterministic branch-retrospective evidence vocabulary: `collect-evidence`, branch resolution sources, session query/source/warning DTOs, session summaries, aggregate metrics, `EvidenceItemDto`, and the boundary between evidence collection and recommendation judgment.
- `@sdl/vibechk` — standalone agent-context evaluation vocabulary: baseline/treatment workdirs, plan source, runner adapter, run id, run bundle/store/status, git provenance, metrics, transcript, diff patch, result branch, run report, comparison report, and local-only publish boundary.

### Explicitly out of scope for now

- `packages/sdl-initiatives/CONTEXT.md` — no tracked package exists in the current workspace.
- `packages/sdl-reviewer/CONTEXT.md` — historical package identity replaced by `roaster`; do not recreate unless the package itself returns as a separate tracked package.

## Candidate Relationships

These are current map seeds, not final readback output. Package-context phases should confirm, refine, or reject them before Phase 16 finalizes the relationship list.

- **SDL Tools → @sdl/brmem**: Planning and handoff workflows may use Branch Memory, while Objectives themselves remain checked-in Markdown records.
- **SDL Tools → @sdl/pi-extension-runtime**: Neutral TypeScript runtime helpers are shared below Pi extension implementations and CCC without owning user-facing workflow policy.
- **SDL Tools → @sdl/pi-extensions**: Pi extensions expose Objective, enriched-plan, branch-context, checkpoint, handoff, grill, and source-control workflows to the local agent runtime.
- **SDL Tools → @sdl/ccc**: CCC is the private TypeScript orchestration layer for repo-opinionated Pi/cmux/Graphite/worktree command-and-control workflows and owns the `ccc` Pi command prefix for cmux/workspace orchestration.
- **@sdl/areg → @sdl/core project config + external `gh`/`npx skills`**: `areg` reads shared project config from `@sdl/core`, but its skill-management work is bounded by external GitHub and `npx skills` command surfaces.
- **@sdl/brmem → @sdl/core + @sdl/clinkr**: brmem uses TypeScript Git helpers and Clinkr command vocabulary to expose branch-scoped text storage.
- **@sdl/handoff → @sdl/brmem CLI + @sdl/core.git + @sdl/clinkr**: handoff artifacts use Branch Memory storage through the public `brmem` CLI while presenting a user-facing handoff inventory and garbage-collection model.
- **@sdl/roaster → GitHub + Git + project config + Clinkr-style command presentation**: roaster consumes GitHub PR types, local-diff/git facts, shared project config, and TypeScript command presentation.
- **@sdl/slot → Git + GitHub + Graphite + shell/worktree boundaries**: slot owns worktree slot lifecycle while cross-referencing Git worktree/branch/ref facts, GitHub PR state, and explicit `slot gt` Graphite operations.
- **@sdl/objective → Git + Clinkr-style command presentation**: Objective CLI inventory uses Git path-touch facts for checkout-local list metadata. Do not reintroduce Objective → brmem as a storage edge.
- **@sdl/packagechk → external package registries**: packagechk is standalone; it owns package-name availability/claimability checks at registry and publish-gateway boundaries.
- **@sdl/aretro → session evidence + Git + Clinkr-style command presentation**: aretro collects deterministic branch/session/git evidence and leaves recommendation judgment to the `branch-retro` skill.
- **@sdl/vibechk → git + runner/store boundaries**: vibechk is standalone; it owns local evaluation workdirs, run bundles, result branches, metrics, and reports without folding into aretro evidence collection.
- **@sdl/pi-extension-runtime → shared neutral helpers**: Runtime helper modules own reusable parsing, formatting, Branch Memory command discovery/execution helpers, skill expansion, Objective picker/selection, and cmux/Pi type contracts without registering commands or importing orchestration packages.
- **@sdl/pi-extensions → Pi runtime + @sdl/sdl + repo CLIs**: Pi extensions own discovery adapters, argument restoration/UI behavior, worktree-status lifecycle/footer plumbing, runtime cmux helpers, and runtime CLI bridging over `sdl`, `git`/`gt`/`gh`, `brmem`, `objective`, `slot`, and related repo commands. For `/sdl:*` and `/sdl:code:*` mirrors, Pi extensions should use thin adapters over SDL-owned command behavior or lower orchestration seams. For `/sdl:code:autobranch`, `/sdl:code:land`, and worktree-status operational presentation, pi-extensions preserves public adapters while delegating repo-opinionated orchestration/observability to CCC where appropriate.
- **@sdl/sdl → @sdl/pi-extensions**: Pi runtime extensions mirror SDL commands as `/sdl:*` through thin adapters; SDL owns command behavior, and Pi owns runtime registration and presentation.
- **@sdl/sdl → @sdl/ccc**: CCC may own project-specific orchestration internals for some workflows, while SDL can still own the public lifecycle command surface.
- **@sdl/ccc → @sdl/pi-extension-runtime + lower capabilities**: CCC owns multi-capability command orchestration behind the `ccc` Pi command prefix, selected repo workflow orchestration behind current non-`ccc` public surfaces such as `/objective:stack-impl`, `/sdl:code:autobranch`, and `/sdl:code:land`, and worktree-status observability facts/presentation. CCC composes injected GitHub/command execution capabilities, SDL checkpoint primitives, Graphite/GitHub/slot landing orchestration policy, passive Graphite metadata facts, and neutral `@sdl/pi-extension-runtime` helpers; lower capabilities such as `@sdl/pi-extension-runtime`, `@sdl/branch-context`, handoff, Objective, brmem, Git, and Graphite must not import `@sdl/ccc`.

## Flagged Ambiguities

Carry these collisions forward to focused package-context phases. Do not finalize them here.

- **Review / Comment**: distinguish GitHub PR reviews, review threads, review comments, discussion comments, roaster reviews, roaster findings, findings comments, and inline finding posting.
- **State / status**: separate Clinkr `ExitStatus`, Git worktree/file status, GitHub PR state, Objective statuses, slot inventory status, package-check status, vibechk run status, and handoff branch state.
- **Active / root**: keep Active Objective Root, Objective Archive Root, repository root, Git common dir, Base Namespace, and Graphite trunk distinct.
- **Branch / ref / start-point / snapshot-ref**: preserve Git Branch, Ref, Start point, brmem Snapshot Ref, Entry Locator, current branch, branch context, result branch, and Graphite stack node boundaries.
- **Graphite stack operations**: distinguish `sdl-core.gt` Graphite vocabulary, `slot gt` operations, `sdl submit` Graphite verification, and CCC-owned landing/autobranch orchestration.
- **Evidence / finding**: distinguish Objective completion evidence, aretro deterministic evidence items, roaster findings, vibechk metrics/reports, and branch-retro recommendation judgment.
- **Plan / attachment / handoff**: distinguish enriched plan, saved plan, source branch plan file, branch context, attached plan, Branch Memory attachment, handoff artifact, continuation focus, and handoff technical locator.
- **Skill / agent / resource**: reconcile areg target-agent/resource language, skill-management/skillx public workflow language, and Pi extension skill-expansion helpers.
- **Extension API**: when a user says "SDL extension API," assume the SDL extension API (`@sdl/sdl/sdk`) unless they mention Pi, TUI, slash commands registered with `pi.registerCommand`, model-visible tools, or `.pi/extensions`; use "Pi runtime extension API" for the Pi surface and "SDL extension API" for SDL.
- **SDK re-export ownership** (logged, future focused session): `@sdl/sdl/sdk` re-exports and treats as its own vocabulary a minimal set of lower-package types — `ExecResult` and `FormatCommandEvidenceOptions` from `@sdl/core/exec`, and `PositionalSpec` from `@sdl/clinkr/raw`. The `@sdl/sdl` "SDL extension API" term's *Avoid* list rules out copying SDK types but is silent on this deliberate re-export-and-own boundary, so the ownership claim is implicit. Candidate clarification: make the term assert that the SDK owns these re-exports as first-party author vocabulary.
- **Run / evaluation / metric**: reconcile vibechk run/bundle/status/metric vocabulary with aretro session/evidence vocabulary and roaster review/finding output.
- **Changes / checkpoint / autobranch / submit / PR regeneration**: distinguish SDL public lifecycle command ownership for workflows such as `changes`, `cp`, `submit`, and `regenerate-pr`, CCC-owned repo source-control orchestration where the flow crosses primitives, and Pi discovery/presentation adapters in `@sdl/pi-extensions`.
