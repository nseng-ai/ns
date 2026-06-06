# Roadmap

## Work

- [x] **Fix `asdl-slots` checkout planning-time mutation.** Make current-checkout planning pure and move redirect mutation into lifecycle execution after preflight. Evidence: local branch diff against Graphite parent `slot-operation-recovery-messaging-helper` makes `plan_current_checkout` and current-worktree redirect planning non-mutating, executes redirect only after allocation preflight succeeds, and adds unit/scenario coverage proving pool-full failures preserve the caller's current branch without checkout or detach calls.
- [ ] **Deepen `asdl-slots` release/free/gc workflow.** Introduce a release-focused module such as `SlotReleaseWorkflow` that owns free/gc target classification, dry-run/execute flow, cleanup policy, dirty/operation checks, PR lookup handling, cleanup result accounting, and partial failure behavior while keeping CLI confirmation/rendering outside the lifecycle interface.
- [ ] **Localize `asdl-core` production gateway construction.** Concentrate production wiring for Git/GitHub/Graphite gateways, repo-root discovery, and trunk resolution so consuming packages receive built gateway interfaces instead of re-deriving real adapter construction at each context site.
- [ ] **Deepen `asdl-objectives` checked-in Markdown storage.** Create an internal storage module for Objective roots, record facts, file reads, update listing, active/archive moves, and relative paths used by git-touch checks. Preserve checked-in Markdown storage and avoid reintroducing Branch Memory as the storage model.
- [ ] **Add domain output converters/readers for `asdl-core` real adapters.** Extract domain-specific conversion locality for Git output, GitHub responses, and Graphite metadata where it reduces raw subprocess/string-shape coupling in tests. Avoid a generic parser dumping ground.
- [ ] **Deepen `roaster` inline findings publication.** Concentrate inline commentability classification, marker/body construction, duplicate suppression, fallback accounting, and PR draft creation behind a publication module while preserving pure classification as a useful test surface.
- [ ] **Deepen `asdl-pr-address` feedback snapshot and prepare-run policy.** Move package-specific feedback fetching, empty-review filtering, resolved-thread policy, contested-thread normalization, and prepare-run setup behind an in-process interface so scenario tests can shrink to CLI contract coverage.
- [ ] **Extract `areg` init planning and managed-block locality.** Move text-file planning, symlink safety, managed instruction block editing, and `[areg]` TOML section planning out of the large init command module into internal modules with direct tests at the planning interface.
- [ ] **Reshape `vibechk` seams around real depth.** Collapse the hypothetical single-adapter GitGateway ABC while deepening the run-store interface so allocation, artifact filenames, bundle writing, prefix lookup, reads, and listing sit behind one coherent module.
- [ ] **Deepen `packagechk` claim orchestration.** Extract the shared PyPI/npm claim decision tree into a claim-flow module with registry-specific recipes for validation, availability checks, dry-run rendering, publish tools, temp project creation, publish execution, and success output.

## Parked

- [ ] **Leave `brmem` broad architecture intact.** The audit treats `brmem` as a negative control: `BranchMemoryGateway` is already a real seam with real and fake adapters. Only small implementation-local cleanup, such as snapshot-tree plumbing extraction, should be considered opportunistically.
- [ ] **Defer `asdl-handoff` cleanup.** Handoff slug/key and branch-resolver cleanup is useful but low-leverage compared with the top ten projects.
- [ ] **Defer `aretro` cleanup.** `gateway_access.py` inlining and compact DTO conversion cleanup are worthwhile but not architecture priorities; preserve the evidence-vs-judgment boundary.
- [ ] **Defer broad `clinkr` authoring-surface redesign.** The current seam is deep and reused; revisit only when a second non-CLI adapter or a clearer interface-width problem justifies it.
