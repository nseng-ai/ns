# Context Map

This map is the repository entry point for domain-language context. It records which context files exist, which context files are planned, and which relationship or ambiguity notes must be carried into later focused context sessions.

## Inventory Baseline

Current checkout facts:

- Python workspace inventory: no active first-party Python workspace packages remain.
- In-scope Python context targets: none. Former Python capability packages were ported to TypeScript, retired, or deleted as migration reference material.
- TypeScript workspace inventory: 19 repo-local packages under `ts/packages/`. This map's TypeScript package-context coverage is intentionally partial pending a focused rebaseline.
- Present context files: root `CONTEXT.md`, `ts/packages/handoff/CONTEXT.md`, `ts/packages/brmem/CONTEXT.md`, `ts/packages/pi/CONTEXT.md`, `ts/packages/ccc/CONTEXT.md`, `ts/packages/sdl/CONTEXT.md`, `ts/packages/roaster/CONTEXT.md`, `ts/packages/graphite/CONTEXT.md`, `ts/packages/plans/CONTEXT.md`, `ts/packages/branch-context/CONTEXT.md`, and `ts/packages/slot/CONTEXT.md`.
- Future drift should be handled by focused rebaseline phases before final readback, not silently folded into unrelated package-context sessions.

## Contexts

### Present

- [SDL Tools](./CONTEXT.md) — Objective-system vocabulary for checked-in durable narrative roadmap records, Active Objective Root, Objective Archive Root, Archived Objective, Objective Update, Objective Close, Objective Archive, Semantic Update, Tracking Gate, and Closure Marker; plus an **Architecture Boundaries** section defining the repo-wide Gateway and Domain logic terms (canonical definitions replicated from the `typescript-fake-driven-testing` skill) and an **Extension Layering** cluster (Above-SDK Substrate, Domain-Package Layer, Capability Package, Command Face, Peer API, Domain Core, Orchestrator Extension, Presentation Host) whose layering diagram and domain-placement rule live in `docs/adr/0012-domain-package-layer-above-extension-kit.md` (refining ADR 0009).
- [@sdl/handoff](./ts/packages/handoff/CONTEXT.md) — active directed handoff artifact vocabulary over Branch Memory storage for the TypeScript standalone `handoff` CLI: continuation focus, Create a Handoff, Pick Up a Handoff, List Handoffs, and Delete a Handoff actions, handoff slug/key, `handoff` namespace, Handoff Summary, Branch State, List Scope, all-branches inventory, garbage collection, Handoff Technical Locator, and the boundary between durable handoff artifacts and worker-protocol handoffs.
- [@sdl/brmem](./ts/packages/brmem/CONTEXT.md) — Branch Memory primitive vocabulary. Present terms include Branch Memory System, Branch Memory, Namespace, Base Namespace `base`, Entry, Entry Key, Snapshot, Snapshot Ref, Entry Locator, Namespace Copy, Copy Conflict, and Export. Do not describe prompt resolution as ordinary Branch Memory operation, and do not revive stale `Entry Ref` / `Ref locator` wording.
- [@sdl/pi](./ts/packages/pi/CONTEXT.md) — unified private Pi package vocabulary for neutral helper subpaths, project-local discovery adapters, engineered Pi extension domains, command acknowledgement, branch slug/runtime parsing helpers, Objective selection, Branch Context/Handoff/grill/runner-subagent/PR/worktree-status adapters, terminal presentation, and the CCC orchestration delegation boundary.
- [@sdl/ccc](./ts/packages/ccc/CONTEXT.md) — CCC (Cmux Command and Control) vocabulary for the private TypeScript orchestration layer that composes Pi, cmux, Graphite, Objective, handoff, branch-context, autobranch/land, and owns worktree-status observability without lower packages importing it.
- [@sdl/graphite](./ts/packages/graphite/CONTEXT.md) — reusable Graphite support vocabulary for direct `gt` command adapters, Graphite metadata DB parsing, topology/status/stack facts, submit support, testing fakes, and the direct `gt` invocation boundary.
- [@sdl/sdl](./ts/packages/sdl/CONTEXT.md) — Source Development Lifecycle CLI vocabulary for SDL command surfaces, the SDL kernel, project-local and future bundled SDL extensions, SDL command entries, `@sdl/sdl/sdk` as the public SDL extension API, the command-first SDK promotion rule, internal migration exports, SDL Pi mirrors, hard cutover, and lower orchestration ownership.
- [@sdl/roaster](./ts/packages/roaster/CONTEXT.md) — PR-diff findings vocabulary for Roaster, review definitions, Tripwires, deep reviews, findings, findings comments, inline findings, and Branch Memory review logs.
- [@sdl/plans](./ts/packages/plans/CONTEXT.md) — saved-plan vocabulary for Saved Plans, the Local Plan Store, Source Branch Plan Files, Saved-Plan Selection, Plan Store Directory Evidence, the Plans Command Face, the Plans Peer API, and Plans Core boundaries.
- [@sdl/branch-context](./ts/packages/branch-context/CONTEXT.md) — branch-context vocabulary for Branch Context, Attached Plan, Branch Context Creation, Branch Context Attach, the Branch Context Command Face, the Branch Context Peer API, and Branch Context Core boundaries.
- [@sdl/slot](./ts/packages/slot/CONTEXT.md) — worktree slot vocabulary for Slots, Slot Pool, Slot Records/Inventory, Slot Repo Context, Slot Checkout Target, the `sdl slot ...` Command Face, the `@sdl/slot/api` Peer API, checkout side-effect policy, SDL-owned parent-shell navigation/shell mounts, and `sdl slot gt` command helpers.

### Planned TypeScript package contexts

These are active TypeScript package context targets for later focused domain-language sessions. Do not recreate deleted Python package paths when authoring them.

- `@sdl/areg` — agent-resource bootstrap and skill workflow vocabulary: `areg init`, `areg check`, `update-skills`, `skillx`, target agents, managed instruction blocks, installed skill directories, lockfile source types, skill metadata/issues, transient skill fetch/cleanup, and external `gh` / `npx skills` boundaries.
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
- **SDL Tools → @sdl/pi**: The unified Pi package exposes repo-local Pi commands/tools and neutral helper subpaths for command acknowledgement, runtime parsing, branch slug normalization, Objective selection, runner subagents, terminal presentation, and project-local discovery adapters.
- **SDL Tools → @sdl/ccc**: CCC is the private TypeScript orchestration layer for repo-opinionated Pi/cmux/Graphite/worktree command-and-control workflows and owns the `ccc` Pi command prefix for cmux/workspace orchestration.
- **@sdl/areg → @sdl/core project config + external `gh`/`npx skills`**: `areg` reads shared project config from `@sdl/core`, but its skill-management work is bounded by external GitHub and `npx skills` command surfaces.
- **@sdl/brmem → @sdl/core + @sdl/clinkr**: brmem uses TypeScript Git helpers and Clinkr command vocabulary to expose branch-scoped text storage.
- **@sdl/handoff → @sdl/brmem CLI + @sdl/core.git + @sdl/clinkr**: handoff artifacts use Branch Memory storage through the public `brmem` CLI while presenting a user-facing handoff inventory and garbage-collection model.
- **@sdl/roaster → GitHub + Git + project config + Clinkr-style command presentation**: roaster consumes GitHub PR types, local-diff/git facts, shared project config, and TypeScript command presentation.
- **@sdl/slot → Git + GitHub + @sdl/graphite + SDL shell/worktree boundaries**: slot owns worktree slot lifecycle and the `sdl slot gt` command surface while asking `@sdl/graphite` for Graphite stack/navigation facts; Slot exposes in-process checkout composition through `@sdl/slot/api`, while SDL owns `sdl shell ...` and the compatibility `sdl slot shell ...` mount over neutral `@sdl/core/shell-support` helpers.
- **@sdl/objective → Git + Clinkr-style command presentation**: Objective CLI inventory uses Git path-touch facts for checkout-local list metadata. Do not reintroduce Objective → brmem as a storage edge.
- **@sdl/packagechk → external package registries**: packagechk is standalone; it owns package-name availability/claimability checks at registry and publish-gateway boundaries.
- **@sdl/aretro → session evidence + Git + Clinkr-style command presentation**: aretro collects deterministic branch/session/git evidence and leaves recommendation judgment to the `branch-retro` skill.
- **@sdl/vibechk → git + runner/store boundaries**: vibechk is standalone; it owns local evaluation workdirs, run bundles, result branches, metrics, and reports without folding into aretro evidence collection.
- **@sdl/pi → neutral helper consumers**: Sibling packages may import curated neutral `@sdl/pi/...` helper subpaths for runtime parsing, command acknowledgement, branch slug normalization, cmux/Pi types, skill expansion, Objective selection, terminal presentation, and runner-subagent usage. They should not import project-local extension entrypoints as helpers.
- **@sdl/pi → Pi runtime + @sdl/sdl + repo CLIs**: Pi owns discovery adapters, argument restoration/UI behavior, worktree-status lifecycle/footer plumbing, runtime cmux helpers, and runtime CLI bridging over `sdl`, `git`/`gt`/`gh`, `brmem`, `objective`, `slot`, and related repo commands. For SDL mirrors, Pi uses thin adapters over SDL-owned command behavior or lower orchestration seams; for selected orchestration-heavy surfaces such as land and worktree-status, Pi adapters delegate repo policy to CCC.
- **@sdl/sdl → @sdl/pi**: Pi runtime extensions mirror SDL commands as `/sdl:*` through thin adapters; SDL owns command behavior, and Pi owns runtime registration and presentation.
- **@sdl/sdl → @sdl/ccc**: CCC may own project-specific orchestration internals for some workflows, while SDL can still own the public lifecycle command surface.
- **@sdl/ccc → @sdl/pi + @sdl/graphite + lower capabilities**: CCC owns multi-capability command orchestration behind the `ccc` Pi command prefix, selected repo workflow orchestration behind current non-`ccc` public surfaces such as `/objective:stack-impl`, `/sdl:flow:autobranch`, and `/sdl:flow:land`, and worktree-status observability facts/presentation. CCC composes injected GitHub/command execution capabilities, SDL checkpoint primitives, `@sdl/graphite` facts/mutations, GitHub/slot landing orchestration policy, and neutral `@sdl/pi` helpers. The unified Pi package may delegate selected project-local adapters back to CCC, so this is an intentional private package cycle rather than a public API promise.
- **@sdl/plans → Git/local plan store**: plans owns saved-plan path/evidence/selection semantics over repository identity and source-branch directory facts, using Git gateways to derive plan-store keys at the command or Peer API edge.
- **@sdl/branch-context → @sdl/plans + @sdl/brmem + @sdl/graphite**: branch-context owns plan attachment, Branch Memory namespace/key policy, and branch-context creation semantics while consuming saved-plan sources from `@sdl/plans`, storing attachments through `@sdl/brmem`, and using `@sdl/graphite` for branch tracking and parent checks.
- **Sibling capability packages → @sdl/branch-context/api + @sdl/plans/api + @sdl/slot/api**: sibling in-process consumers should use curated Peer API subpaths rather than package roots or private source imports when composing branch-context, plans, or Slot behavior.
- **@sdl/sdl/core → @sdl/graphite**: SDL submit flows use `@sdl/graphite/submit` for Graphite submit/restack/current-PR/metadata-prewrite support while generic PR description and GitHub gateway helpers remain in core/SDL owners.

## Flagged Ambiguities

Carry these collisions forward to focused package-context phases. Do not finalize them here.

- **Review / Comment**: distinguish Tripwires, Deep reviews, generic Roaster review definitions/runs, GitHub PR reviews, review threads, review comments, discussion comments, Roaster findings, Roaster findings comments, and inline finding posting.
- **State / status**: separate Clinkr `ExitStatus`, Git worktree/file status, GitHub PR state, Objective statuses, slot inventory status, package-check status, vibechk run status, and handoff branch state.
- **Active / root**: keep Active Objective Root, Objective Archive Root, repository root, Git common dir, Base Namespace, and Graphite trunk distinct.
- **Branch / ref / start-point / snapshot-ref**: preserve Git Branch, Ref, Start point, brmem Snapshot Ref, Entry Locator, current branch, branch context, result branch, and Graphite stack node boundaries.
- **Graphite stack operations**: distinguish `@sdl/graphite` as the support package for Graphite command adapters/facts, `sdl slot gt` as the slot-owned command surface, SDL submit as a public workflow using Graphite submit support, and CCC-owned landing/autobranch orchestration.
- **Evidence / finding**: distinguish Objective completion evidence, aretro deterministic evidence items, roaster findings, vibechk metrics/reports, and branch-retro recommendation judgment.
- **Plan / attachment / handoff**: distinguish enriched plan, saved plan, source branch plan file, branch context, attached plan, Branch Memory attachment, handoff artifact, continuation focus, and handoff technical locator.
- **Skill / agent / resource**: reconcile areg target-agent/resource language, skill-management/skillx public workflow language, and Pi extension skill-expansion helpers.
- **Extension API**: when a user says "SDL extension API," assume the SDL extension API (`@sdl/sdl/sdk`) unless they mention Pi, TUI, slash commands registered with `pi.registerCommand`, model-visible tools, or `.pi/extensions`; use "Pi runtime extension API" for the Pi surface and "SDL extension API" for SDL. Keep this distinct from a capability's **Peer API** (`@sdl/<cap>/api`, in-process sibling consumption) and **Command Face** (kernel-loaded commands) defined in the root **Extension Layering** cluster.
- **Domain placement / layer**: capability domain logic lives only in the **Domain-Package Layer** (Capability Packages above `@sdl/extension-kit`); the `@sdl/pi` **Presentation Host**, the `@sdl/extension-kit` **Above-SDK Substrate**, and the `@sdl/sdl` kernel are not domain homes. Domain stranded in `@sdl/pi/*` (e.g. `@sdl/pi/objectives` selection rules consumed by `ccc`) is relocated into its owning capability and re-consumed via the Peer API. The SDK boundary is permeable downward over time but gated on proven generality, and opinionated above-SDK patterns such as gateways are expected to stay above the SDK (ADR 0012).
- **SDK re-export ownership**: `@sdl/sdl/sdk` re-exports and treats as its own vocabulary a minimal set of lower-package types and helpers, including `ExecResult` and `FormatCommandEvidenceOptions` from `@sdl/core/exec`, `PositionalSpec` from `@sdl/clinkr/raw`, schema builder `z`, and command-evidence helpers. The authoritative export list remains `ts/packages/sdl/docs/sdk-reference.md`; the context term records the ownership boundary, not a duplicate export inventory.
- **Run / evaluation / metric**: reconcile vibechk run/bundle/status/metric vocabulary with aretro session/evidence vocabulary and roaster review/finding output.
- **Changes / checkpoint / autobranch / submit / PR regeneration**: distinguish SDL public lifecycle command ownership for workflows such as `changes`, `cp`, `submit`, and `regenerate-pr`, CCC-owned repo source-control orchestration where the flow crosses primitives, and Pi discovery/presentation adapters in `@sdl/pi`.
