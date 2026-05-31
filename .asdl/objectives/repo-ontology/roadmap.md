# Roadmap

## Work

Completed foundation

- [x] Phase 0 — initial `/CONTEXT-MAP.md` scaffold: created the repo ontology entry point, seeded planned contexts, explicit skips, candidate relationships, and candidate ambiguities.
- [x] Phase 0.5 — package inventory rebaseline: added root `CONTEXT.md`, added `packagechk`, removed `asdl-initiatives` as a tracked package slot, kept `asdl-dispatcher` out of scope while operation-less, and removed the stale `asdl-objectives → brmem` storage edge.
- [x] Phase 0.6 — Pi/Objective workflow rebaseline: updated root Objective archive/closure language, added `ts/packages/pi-extensions/CONTEXT.md`, rebaselined the map for Pi runtime CLI edges, and refreshed contradictory Pi docs.
- [x] Phase 0.7 — roaster/aretro inventory rebaseline: replaced the live `asdl-reviewer` context target with `roaster`, added `aretro`, added asdl-core Sessions to the required H2 set, and rebaselined map candidates.
- [x] Phase 1 — `packages/asdl-core/CONTEXT.md`: completed the single-file H2 context for `Clinkr`, `Git`, `Gt`, `Gh`, `Top-level utilities`, and `Sessions`; folded the temporary `asdl_core.gt` context split back into the `## Gt` section.
- [x] Phase 2 — `packages/brmem/CONTEXT.md`: created the Branch Memory context and completed follow-up alignment for Base Namespace copyability, Entry Locator wording, prompt-plugin framing, Namespace ownership wording, empty destination Snapshot copy behavior, and canonical Base Namespace name `base`.

Phase 3 — intermediate current-checkout map catch-up

- [ ] Update `/CONTEXT-MAP.md` to mark `packages/brmem/CONTEXT.md` as _Present_ and refresh the brmem summary around Branch Memory System, Branch Memory, Namespace, Base Namespace `base`, Entry, Entry Key, Snapshot, Snapshot Ref, Entry Locator, Namespace Copy, Copy Conflict, and Export.
- [ ] Rebaseline `/CONTEXT-MAP.md` against current source/package facts as an intermediate snapshot before package sessions resume: 9 tracked Python workspace packages, `asdl-dispatcher` still out of context scope while operation-less, 8 in-scope Python package contexts, `@asdl/pi-extensions` as the repo-local TypeScript context, no live tracked context slot for `asdl-initiatives`, `asdl-reviewer`, or `vibechk`, and explicit wording that outstanding changes are expected to expand this inventory before closure.
- [ ] Refresh candidate relationship and ambiguity notes in `/CONTEXT-MAP.md` without finalizing them: keep known-real edges such as `asdl-objectives → asdl-core.gt`, keep `packagechk` standalone/no-`asdl-core`, keep `asdl-objectives → brmem` rejected as storage, and carry Review/Comment, State/status, Active/root, branch/ref/snapshot-ref, plan, and evidence/finding collisions forward to the relevant package phases.

Phase 4 — post-outstanding-merge rebaseline

- [ ] After the known outstanding changes merge, rerun tracked workspace/package/context inventory and update this Objective if new packages, extension surfaces, or substantial repo-local domain-language surfaces become in scope.
- [ ] Refresh `/CONTEXT-MAP.md` relationships and flagged ambiguities against the post-merge source/import/runtime evidence, preserving only real edges and explicitly rejecting any tempting speculative edges.
- [ ] Add new context phases for any newly merged surfaces before final map readback. If this changes phase numbering, update `roadmap.md` rather than treating the current Phase 5–11 numbering as immutable.

Phase 5 — `asdl-pr-address` context

- [ ] Create `packages/asdl-pr-address/CONTEXT.md` for PR addressing behavior around core `PRReviewThread`, `PRReviewComment`, `PRDiscussionComment`, reactions, feedback, thread resolution, and replies.
- [ ] Cross-reference rather than redefine `asdl-core.gh` review/comment types, and treat `IssueComment` as legacy command/API wording where it remains.
- [ ] Update the map's Review/Comment ambiguity notes only as far as this package's vocabulary is settled; leave roaster-specific review/finding terms for Phase 5.

Phase 6 — `roaster` context

- [ ] Create `packages/roaster/CONTEXT.md` for Roaster review-harness vocabulary: `Roaster`, `ReviewDefinition`, `HarnessRuntime`, `HarnessDefinition`, `HarnessReviewRequest`, `ReviewCatalog`, `ReviewSource`, `ReviewFormat`, findings, inline commentability, severity, frontmatter, findings comments, inline finding posting, and roaster CLI/comment-marker terms.
- [ ] Explicitly disambiguate roaster review/finding/comment terms from `asdl-core.gh.PRReview` and `asdl-pr-address` thread/comment vocabulary.
- [ ] Carry any unresolved Review/Comment or Evidence/finding boundary into the map for Phase 11 rather than broadening the roaster context slice.

Phase 7 — `asdl-slots` context

- [ ] Create `packages/asdl-slots/CONTEXT.md` for worktree slot vocabulary: `SlotRecord`, `SlotInventory`, `InventoryStatus`, `RepoContext`, `SlotGcPlan`, `InitPlan`, `ResizePlan`, shell directive files, explicit `slot gt` operations, and `free-stack --downstack` downstack-only release.
- [ ] Cross-reference `asdl-core.git` worktree/branch/ref terms and `asdl-core.gt` stack terms without redefining them as slots concepts.
- [ ] Update branch/ref/start-point/worktree and State/status ambiguity notes based on the slots context.

Phase 8 — `asdl-objectives` context

- [ ] Create `packages/asdl-objectives/CONTEXT.md` for the Objective CLI package: Objective records, `ObjectiveStatus` (`open`/`closed`/`in-flight`), `ObjectiveRecordStatus`, status sources, branch slices/path-touch attribution, archive/unarchive, checked-in Markdown storage, and hidden `exec` command conventions including `read-objective` and `runner-subagent-usage`.
- [ ] Include the opt-in `objective gt` stack-projection surface: `ObjectiveGtStacksRequest`, `ObjectiveGtStacksResult`, `ObjectiveGtStacksRow`, `ObjectiveGtStacksSegment`, `ObjectiveGtStacksObjective`, `ObjectiveBranchTouch*`, stack projection/scope/render, and the `asdl-core.gt` branch-graph vocabulary it consumes.
- [ ] Reconcile package-local Objective terms against root `CONTEXT.md` without duplicating root Objective-system documentation; update Active/root, State/status, Graphite stack-projection, and plan-term ambiguity notes.

Phase 9 — `packagechk` context

- [ ] Create `packages/packagechk/CONTEXT.md` for standalone package-name availability and claimability vocabulary: `Registry`, `CheckStatus`, `RegistryCheckResult`, `PackageCheckReport`, PyPI normalization, npm validation/scoped-name caveat, claim project specs, publish gateways, and parked Homebrew support.
- [ ] Keep `packagechk` explicitly standalone/no-`asdl-core` in map relationships.
- [ ] Decide whether `CheckStatus` belongs in the final map-level State/status ambiguity entry or is sufficiently package-local after the context lands.

Phase 10 — `aretro` context

- [ ] Create `packages/aretro/CONTEXT.md` for branch retrospective evidence collection: `AretroCliContext`, `collect-evidence`, branch resolution sources, session query/source/warning DTOs, session summaries, aggregate metrics, `EvidenceItemDto`, deterministic evidence item kinds, and the boundary between factual evidence collection and `branch-retro` recommendation judgment.
- [ ] Cross-reference `asdl-core.sessions` normalized session facts and deterministic evidence aggregation rather than redefining session-source vocabulary.
- [ ] Reconcile Evidence/finding language against Objective completion evidence and roaster findings before Phase 11 finalizes the map entry.

Phase 11 — final map and readback

- [ ] Populate the final Relationships section of `/CONTEXT-MAP.md` with concrete cross-package and extension edges only: `brmem → asdl-core.git + asdl-core.clinkr`, `asdl-pr-address → asdl-core.gh + asdl-core.git + asdl-core.clinkr/plugin`, `roaster → asdl-core.gh + asdl-core.git + asdl-core.clinkr/plugin`, `asdl-slots → asdl-core.git + asdl-core.gh + asdl-core.gt + asdl-core.clinkr/console/plugin`, `asdl-objectives → asdl-core.git + asdl-core.gt + asdl-core.clinkr + asdl-core.console/format/plugin`, `aretro → asdl-core.sessions + asdl-core.git + asdl-core.clinkr/plugin`, `@asdl/pi-extensions → Pi runtime + git/gt/gh/brmem/objective/slot CLIs`, and `packagechk` as standalone/no-`asdl-core`.
- [ ] Finalize the map's Flagged ambiguities section as resolved one-line entries: Review/Comment, State/status, Active/root, branch/ref/start-point/snapshot-ref, Graphite stack projection, evidence/finding, and plan terminology.
- [ ] Perform the final readback: confirm an unfamiliar contributor can start at `/CONTEXT-MAP.md`, navigate to each context, and explain the key terms and `Avoid:` aliases without opening source.
- [ ] Decide the deferred map-linking question for `asdl-core` H2 anchors and record the maintenance-cadence follow-up if it remains outside this Objective.

## Parked

- ADRs — write only if the `grill-with-docs` three-criteria bar fires during a session: hard to reverse, surprising without context, and a real trade-off.
- `packages/asdl-dispatcher/CONTEXT.md` — revisit when live operations land; today it is a CLI stub with no operations.
- `packages/asdl-initiatives/CONTEXT.md` — no tracked package exists in the current workspace; revisit only if the package is reintroduced with implementation.
- `packages/asdl-reviewer/CONTEXT.md` — historical package identity replaced by `roaster`; do not recreate unless the package itself is deliberately reintroduced as a separate tracked package.
- `packages/vibechk/CONTEXT.md` — no tracked workspace package exists in the current ground truth; revisit only if tracked implementation returns.
- Per-subpackage `CONTEXT.md` split for `asdl-core` — revisit only when `clinkr` or another labs subpackage graduates to a standalone package.
- Periodic re-grilling cadence — out of scope for this Objective; address as a separate process question after the sweep closes.
