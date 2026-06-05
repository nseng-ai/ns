# Roadmap

## Work

Standing operating direction

- [~] Keep `CONTEXT.md`, `CONTEXT-MAP.md`, and `grill-with-docs`-maintained docs up to date.
  - Guidance: Re-derive the next slice from current source/docs, existing context coverage, and unresolved map ambiguities; do not treat old phase numbers as a hidden queue when repo reality has drifted.
  - Policy: recommend exactly one action route. Implement only from a concrete, source-backed plan; if the plan is not yet concrete, ask a yes/no confirmation question so the user can type `yes` to start a `grill-me` planning/readback session. Use confirmed steered `grill-me` planning for manual terminology, context-surface, ambiguity, or scope decisions, without presenting implementation as an option for manual slices; use `grill-with-docs` instead when the confirmed session should update documentation inline.
  - Evidence: changed context/map/docs files cite current source evidence, relevant Markdown formatting passes, and meaningful Objective tracking records durable decisions.

Completed foundation

- [x] Phase 0 — initial `/CONTEXT-MAP.md` scaffold: created the repo ontology entry point, seeded planned contexts, explicit skips, candidate relationships, and candidate ambiguities.
- [x] Phase 0.5 — package inventory rebaseline: added root `CONTEXT.md`, added `packagechk`, removed `asdl-initiatives` as a tracked package slot, kept `asdl-dispatcher` out of scope while operation-less, and removed the stale `asdl-objectives → brmem` storage edge.
- [x] Phase 0.6 — Pi/Objective workflow rebaseline: updated root Objective archive/closure language, added `ts/packages/pi-extensions/CONTEXT.md`, rebaselined the map for Pi runtime CLI edges, and refreshed contradictory Pi docs.
- [x] Phase 0.7 — roaster/aretro inventory rebaseline: replaced the live `asdl-reviewer` context target with `roaster`, added `aretro`, added asdl-core Sessions to the required H2 set, and rebaselined map candidates.
- [x] Phase 1 — `packages/asdl-core/CONTEXT.md`: completed the single-file H2 context for `Clinkr`, `Git`, `Gt`, `Gh`, `Top-level utilities`, and `Sessions`; folded the temporary `asdl_core.gt` context split back into the `## Gt` section.
- [x] Phase 2 — `packages/brmem/CONTEXT.md`: created the Branch Memory context and completed follow-up alignment for Base Namespace copyability, Entry Locator wording, prompt-plugin framing, Namespace ownership wording, empty destination Snapshot copy behavior, and canonical Base Namespace name `base`.

Phase 3 — current-checkout map catch-up

- [x] Update `/CONTEXT-MAP.md` to mark `packages/brmem/CONTEXT.md` as _Present_ and refresh the brmem summary around Branch Memory System, Branch Memory, Namespace, Base Namespace `base`, Entry, Entry Key, Snapshot, Snapshot Ref, Entry Locator, Namespace Copy, Copy Conflict, and Export.
- [x] Rebaseline `/CONTEXT-MAP.md` against current source/package facts: 12 tracked Python workspace packages, `asdl-dispatcher` still out of context scope while operation-less, 11 in-scope Python package contexts, two repo-local TypeScript package contexts (`asdl-dev` and `@asdl/pi-extensions`), no live tracked context slot for `asdl-initiatives` or `asdl-reviewer`, and explicit wording that future drift should be handled by focused rebaseline phases.
- [x] Refresh candidate relationship and ambiguity notes in `/CONTEXT-MAP.md` without finalizing them: keep known-real edges such as `asdl-handoff → brmem` and `@asdl/pi-extensions → asdl-dev`; record current `areg → asdl-core.project_config` source evidence instead of the stale standalone/no-`asdl-core` claim; keep `packagechk` and `vibechk` standalone/no-`asdl-core`; keep `asdl-objectives → brmem` rejected as storage; and carry Review/Comment, State/status, Active/root, branch/ref/snapshot-ref, plan/handoff, skill/agent/resource, run/metric, and evidence/finding collisions forward to the relevant phases.

Phase 4 — post-outstanding-merge Objective rebaseline

- [x] Rerun tracked workspace/package/context inventory after the known outstanding changes reached `master`: current checkout has 12 tracked Python packages, existing context files for root/asdl-core/brmem/`@asdl/pi-extensions`, and two TypeScript workspace packages.
- [x] Update this Objective's closure target so `areg`, `asdl-handoff`, `vibechk`, and `ts/packages/asdl-dev` are in-scope context targets, while `asdl-dispatcher` remains parked because its group still has no operations.
- [x] Add new context phases for the newly merged Python and TypeScript surfaces before final map readback, and renumber the final map/readback phase.

Phase 5 — `areg` context

- [ ] Create `packages/areg/CONTEXT.md` for agent-resource bootstrap and skill workflow vocabulary: `areg init`, `areg check`, `update-skills`, `skillx`, target agents, managed instruction blocks, installed skill directories, lockfile source types, `SkillMeta`, `SkillIssue`, `IssueKind`, `CheckResult`, and transient skill fetch/cleanup results.
- [ ] Record `areg`'s current narrow `asdl-core.project_config` boundary in map relationships; also record its external `gh` and `npx skills` gateway boundaries instead of broadening the package context into general asdl-core CLI/plugin vocabulary.
- [ ] Reconcile skill/agent/resource language against the public skill-management/skillx skills and `@asdl/pi-extensions` skill-expansion helpers; carry any CheckResult/status ambiguity into the final map pass.

Phase 6 — `asdl-handoff` context

- [x] Create `packages/asdl-handoff/CONTEXT.md` for directed handoff artifact vocabulary: Handoff artifact, continuation focus, handoff slug/key, handoff namespace `handoffs`, `HandoffSummary`, branch state (`active`/`deleted`), list scope, all-branches inventory, garbage-collection preview/delete actions, Entry Locator, and updated-at ordering.
      Evidence: `packages/asdl-handoff/CONTEXT.md` exists and currently defines Handoff Artifact, Continuation Focus, Handoff Slug/Key, Handoffs Namespace, Handoff Summary, Handoff Technical Locator, Branch State, List Scope, All-Branches Inventory, Handoff Deletion, and Handoff Garbage Collection with `Avoid:` aliases.
- [ ] Cross-reference `packages/brmem/CONTEXT.md` for Namespace, Entry, Entry Key, Snapshot, and Entry Locator instead of redefining Branch Memory, and cross-reference `asdl-core.git` branch facts plus Clinkr/console/format/plugin helpers.
      Remaining evidence needed: the current `asdl-handoff` context is language-only; add explicit Relationships/cross-reference wording before marking this complete.
- [x] Update map-level plan/attachment/handoff, branch/state, and Branch Memory relationship notes without collapsing handoff artifacts into generic Branch Memory entries.
      Evidence: `CONTEXT-MAP.md` lists `asdl-handoff` as a present context, records the `asdl-handoff → brmem + asdl-core.git + asdl-core.clinkr/console/format/plugin` relationship candidate, and carries handoff branch-state plus plan/attachment/handoff ambiguity notes.

Phase 7 — `asdl-pr-address` context

- [ ] Create `packages/asdl-pr-address/CONTEXT.md` for PR addressing behavior around core `PRReviewThread`, `PRReviewComment`, `PRDiscussionComment`, reactions, feedback, thread resolution, and replies.
- [ ] Cross-reference rather than redefine `asdl-core.gh` review/comment types, and treat `IssueComment` as legacy command/API wording where it remains.
- [ ] Update the map's Review/Comment ambiguity notes only as far as this package's vocabulary is settled; leave roaster-specific review/finding terms for Phase 8.

Phase 8 — `roaster` context

- [ ] Create `packages/roaster/CONTEXT.md` for Roaster review-harness vocabulary: `Roaster`, `ReviewDefinition`, `HarnessRuntime`, `HarnessDefinition`, `HarnessReviewRequest`, `ReviewCatalog`, `ReviewSource`, `ReviewFormat`, findings, inline commentability, severity, frontmatter, findings comments, inline finding posting, and roaster CLI/comment-marker terms.
- [ ] Explicitly disambiguate roaster review/finding/comment terms from `asdl-core.gh.PRReview` and `asdl-pr-address` thread/comment vocabulary.
- [ ] Carry any unresolved Review/Comment or Evidence/finding boundary into the map for Phase 16 rather than broadening the roaster context slice.

Phase 9 — `asdl-slots` context

- [ ] Create `packages/asdl-slots/CONTEXT.md` for worktree slot vocabulary: `SlotRecord`, `SlotInventory`, `InventoryStatus`, `RepoContext`, `SlotGcPlan`, `InitPlan`, `ResizePlan`, shell directive files, explicit `slot gt` operations, and `free-stack --downstack` downstack-only release.
- [ ] Cross-reference `asdl-core.git` worktree/branch/ref terms and `asdl-core.gt` stack terms without redefining them as slots concepts.
- [ ] Update branch/ref/start-point/worktree and State/status ambiguity notes based on the slots context.

Phase 10 — `asdl-objectives` context

- [ ] Create `packages/asdl-objectives/CONTEXT.md` for the Objective CLI package: Objective records, `ObjectiveRecordStatus` (`open`/`closed`), checkout-local list status, archive/unarchive, checked-in Markdown storage, and hidden `exec` command conventions including `read-objective` and `runner-subagent-usage`.
- [ ] Reconcile package-local Objective terms against root `CONTEXT.md` without duplicating root Objective-system documentation; update Active/root, State/status, and plan-term ambiguity notes.

Phase 11 — `packagechk` context

- [ ] Create `packages/packagechk/CONTEXT.md` for standalone package-name availability and claimability vocabulary: `Registry`, `CheckStatus`, `RegistryCheckResult`, `PackageCheckReport`, PyPI normalization, npm validation/scoped-name caveat, claim project specs, publish gateways, and parked Homebrew support.
- [ ] Keep `packagechk` explicitly standalone/no-`asdl-core` in map relationships.
- [ ] Decide whether `CheckStatus` belongs in the final map-level State/status ambiguity entry or is sufficiently package-local after the context lands.

Phase 12 — `aretro` context

- [ ] Create `packages/aretro/CONTEXT.md` for branch retrospective evidence collection: `AretroCliContext`, `collect-evidence`, branch resolution sources, session query/source/warning DTOs, session summaries, aggregate metrics, `EvidenceItemDto`, deterministic evidence item kinds, and the boundary between factual evidence collection and `branch-retro` recommendation judgment.
- [ ] Cross-reference `asdl-core.sessions` normalized session facts and deterministic evidence aggregation rather than redefining session-source vocabulary.
- [ ] Reconcile Evidence/finding language against Objective completion evidence, `vibechk` metrics, and roaster findings before Phase 16 finalizes the map entry.

Phase 13 — `vibechk` context

- [ ] Create `packages/vibechk/CONTEXT.md` for agent-context evaluation vocabulary: baseline/treatment workdirs, plan source, runner adapter, run id, run bundle, bundle store, run status, git provenance, metrics, transcript, diff patch, result branch, run report, comparison report, and local-only publish boundary.
- [ ] Keep `vibechk` explicitly standalone/no-`asdl-core` in map relationships; record its external git and runner-adapter boundaries without folding it into `asdl-core.sessions` or `aretro` evidence collection.
- [ ] Reconcile run/status/metric/evidence wording against `aretro` deterministic evidence, Objective completion evidence, and roaster findings before Phase 16 finalizes ambiguity entries.

Phase 14 — `asdl-dev` TypeScript context

- [ ] Create `ts/packages/asdl-dev/CONTEXT.md` for the repo-local developer CLI: flat command table, `preview-url`, Vercel project/scope resolution, deployment candidate/inspected deployment, `cp`, pending worktree snapshot, checkpoint message generation/validation, text-generation gateway, `submit`, Graphite dry-run/restack/current-PR verification, command runner, and errors-as-values gateway results.
- [ ] Record external/runtime edges to git, Graphite, Vercel, and Pi text generation APIs; keep the package private/repo-local rather than presenting it as a published SDK.
- [ ] Reconcile checkpoint/autobranch/submit/preview terminology against `@asdl/pi-extensions`, planned-branch language, and the code command prefix before the Pi extension context is refreshed.

Phase 15 — `@asdl/pi-extensions` context refresh

- [ ] Refresh `ts/packages/pi-extensions/CONTEXT.md` against the current extension inventory: `.pi/extensions/asdl-dev.ts`, `code.ts`, handoff, objective, planned-branch, runner-subagent, grill-ui, land/land-stack, CLI-command bridge, worktree status, terminal presentation, and command-output rendering/summarization surfaces.
- [ ] Document the `asdl-dev` command mirror boundary: `/dev:preview-url` and `/code:cp`/`/code:submit` are Pi mirrors over `asdl-dev`, while `@asdl/pi-extensions` owns discovery adapters, argument restoration/UI behavior, command-output presentation, and runtime CLI bridging.
- [ ] Update map-level plan/autobranch/checkpoint/code-prefix/terminal-output ambiguities and runtime edges after the TypeScript package boundary is settled.

Phase 16 — final map and readback

- [ ] Populate the final Relationships section of `/CONTEXT-MAP.md` with concrete cross-package and extension edges only: `areg → asdl-core.project_config` plus external `gh`/`npx skills`; `brmem → asdl-core.git + asdl-core.clinkr`; `asdl-handoff → brmem + asdl-core.git + asdl-core.clinkr + asdl-core.console/format/plugin`; `asdl-pr-address → asdl-core.gh + asdl-core.git + asdl-core.clinkr/plugin`; `roaster → asdl-core.gh + asdl-core.git + asdl-core.clinkr/plugin`; `asdl-slots → asdl-core.git + asdl-core.gh + asdl-core.gt + asdl-core.clinkr/console/plugin`; `asdl-objectives → asdl-core.git + asdl-core.clinkr + asdl-core.console/format/plugin`; `aretro → asdl-core.sessions + asdl-core.git + asdl-core.clinkr/plugin`; `vibechk` as standalone/no-`asdl-core` with git/runner/store boundaries; `asdl-dev → git + gt + Vercel + Pi text generation`; `@asdl/pi-extensions → Pi runtime + asdl-dev + git/gt/gh/brmem/objective/slot CLIs`; and `packagechk` as standalone/no-`asdl-core`.
- [ ] Finalize the map's Flagged ambiguities section as resolved one-line entries: Review/Comment, State/status, Active/root, branch/ref/start-point/snapshot-ref, evidence/finding, plan/attachment/handoff terminology, skill/agent/resource language, and run/evaluation metric language.
- [ ] Perform the final readback: confirm an unfamiliar contributor can start at `/CONTEXT-MAP.md`, navigate to each context, and explain the key terms and `Avoid:` aliases without opening source.
- [ ] Decide the deferred map-linking question for `asdl-core` H2 anchors and record the maintenance-cadence follow-up if it remains outside this Objective.

## Parked

- ADRs — write only if the `grill-with-docs` three-criteria bar fires during a session: hard to reverse, surprising without context, and a real trade-off.
- `packages/asdl-dispatcher/CONTEXT.md` — revisit when live operations land; today it is a CLI stub with no operations.
- `packages/asdl-initiatives/CONTEXT.md` — no tracked package exists in the current workspace; revisit only if the package is reintroduced with implementation.
- `packages/asdl-reviewer/CONTEXT.md` — historical package identity replaced by `roaster`; do not recreate unless the package itself is deliberately reintroduced as a separate tracked package.
- Per-subpackage `CONTEXT.md` split for `asdl-core` — revisit only when `clinkr` or another labs subpackage graduates to a standalone package.
- Periodic re-grilling cadence — out of scope for this Objective; address as a separate process question after the sweep closes.
