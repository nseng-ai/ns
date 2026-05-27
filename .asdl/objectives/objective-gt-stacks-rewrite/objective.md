# Objective GT Stacks Rewrite

## Thesis

Build the production implementation of `objective gt stacks` and `/objective-gt-stacks` as a spec-first, fake-driven TDD rewrite.

The observable contract in `docs/specs/objective-gt-stacks.md` is authoritative. The implementation should be the simplest clean design that satisfies that contract: a deep semantic projection module with a small interface, backed by explicit Graphite and Git seams, and thin CLI/rendering/Pi adapters around it.

The JSON projection is the primary semantic test surface. Human and Markdown output are renderers over that projection, not sources of truth. Graphite belongs only behind the explicit `objective gt` command path; generic Objective workflows such as `objective list` must remain checkout-local and Graphite-free.

Every implementation slice should be TDD-shaped: write a failing public-interface test first, implement only enough to pass, then refactor toward locality and leverage.

## Scope

This Objective covers the full v1 feature specified in `docs/specs/objective-gt-stacks.md`:

- Add `objective gt stacks` under an explicit `objective gt` group whose help advertises Graphite Objective stack projections.
- Use `GtGateway.branch_graph()` for Graphite stack metadata; do not parse human-readable `gt` command output.
- Use a Graphite-specific Objective command context for this command: repository root, Git gateway, and Graphite gateway, with the Graphite trunk taken from `GtBranchGraph.trunk` rather than requiring the generic Objective Git-trunk precondition.
- Compute a trunk-scoped projection over locally present, trunk-connected Graphite-tracked branches, independent of whether the current checkout branch is itself Graphite-tracked.
- Compute Objective touches from each branch slice `parent..branch`, active root only, including additions, modifications, deletions, and renames while ignoring `.asdl/objective-archive/` entirely.
- Group by Objective slug, support many-to-many branch/Objectives, include `also_touches`, split disconnected stack regions into segments, include connector branches for shape, and exclude connectors from branch count and latest-work attribution.
- Project Objective status from the trunk as `open`, `closed`, or `in-flight` without interpreting pending lifecycle transitions.
- Produce deterministic latest-work attribution, ordering, warning de-duplication, and JSON semantic facts matching the spec.
- Provide `human`, `json`, `markdown`/`md`, `--json-schema`, help, stable failure envelopes, and non-fatal warnings.
- Add `/objective-gt-stacks` to the existing Objective Pi extension as a thin idle-first Markdown display wrapper with strict arguments, 30-second timeout, failure presentation, and structured display-message details.
- Reuse existing Objective path/status helpers, `GitGateway`, `GtGateway`, `FakeGitGateway`, `FakeGtGateway`, and the existing `/objective-list` Pi display-wrapper pattern where they provide leverage.
- Add deletion/rename tests at the existing `GitGateway.path_touches_under()` seam before introducing any richer Git path-change interface.

## Non-Goals

This Objective does not include:

- Changing `objective list` into a branch projection command or adding Graphite to generic Objective workflows.
- Any Objective branch attachment mechanism, hidden registry, UUID, workflow controller, task database, or state machine.
- Parsing Markdown Objective prose in CLI code to infer meaning.
- Parsing human-readable `gt` output for stack structure.
- Scanning non-current Graphite trunks, untracked Git branches, remote-only branches, or network state.
- Adding an interactive TUI/viewer; the JSON contract may support one later, but v1 only renders text formats and the Pi display wrapper.
- Preserving prototype internal structure when it conflicts with locality, depth, or the spec.
- Adding a richer Git path-change interface unless TDD evidence shows the current seam cannot satisfy deletion/rename semantics.
- Requiring a live Graphite stack smoke test before closure; live smoke is useful optional evidence, not the closure bar.
- Automatic PR submission or Graphite stack submission.

## Completion Criteria

The Objective is complete when:

- Tests are written TDD-style for each slice: projection semantics, Git touch semantics, CLI behavior, rendering, scenario/plugin wiring, and Pi wrapper behavior.
- The semantic projection tests cover the worked example from the spec and edge cases for branch scoping, missing local parents, `parent..branch` slices, active-root-only touches, archive-root ignores, deletions/renames, many-to-many Objective touches, connector branches, disconnected segments, status projection, latest-work tie-breaking, deterministic ordering, and warning de-duplication.
- The production projection module exposes semantic facts without glyphs or rendering decisions in JSON.
- `objective gt stacks --format json` matches the specified envelope and result shape, including stable failure envelopes with exit code `2` for repository, Graphite metadata, and underlying data-read failures.
- `objective gt stacks` human and Markdown output satisfy the spec's visual vocabulary, empty-state behavior, annotations, and summary fields.
- `objective gt stacks --json-schema` and `objective gt stacks --help` work, and the `objective gt` group is visible under `objective --help` with the specified Graphite-oriented help text.
- Scenario tests cover the standalone CLI through `build_cli()`, and plugin smoke tests cover plugin discovery for the new subgroup.
- `/objective-gt-stacks` is registered in the existing Objective Pi extension, rejects unsupported arguments before running anything, runs `objective gt stacks --format markdown` by default, runs help with `objective gt stacks --help`, waits for idle, and reports success/failure/startup/timeout details through the display-message envelope.
- Relevant Python and TypeScript checks pass (`just` plus the `ts/packages/pi-extensions` test/check commands), or unrelated blockers are recorded in an Objective update.
- Meaningful discoveries, assumptions disproven, risk de-risking, or scope changes are recorded through `objective-update` rather than only in branch discussion.

## Assumptions and Risks

Assumptions:

- `docs/specs/objective-gt-stacks.md` is stable enough to treat as the observable contract for this rewrite.
- `GtGateway.branch_graph()` is the right Graphite seam: it already represents trunk-scoped Graphite metadata and avoids human `gt` output parsing.
- A command-specific Graphite Objective context is acceptable and cleaner than reusing the generic `ObjectiveCliContext` when that context adds Git-trunk requirements not present in the spec.
- `GitGateway.path_touches_under()` is sufficient for active-root additions, modifications, deletions, and renames when backed by `git log --name-status -M`; tests now preserve both active-root sides of renames while ignoring archive-root paths at slug extraction.
- Fake-driven tests over `FakeGtGateway` and `FakeGitGateway` are the right primary validation level for projection logic; a live Graphite stack smoke test can be optional follow-up evidence.
- The existing Objective Pi extension is the right locality for `/objective-gt-stacks` because `/objective-list` already provides the same display-wrapper pattern.
- JSON semantic facts are the correct deep interface for tests and future consumers; renderers should remain thin adapters.

Risks:

- Git rename and deletion behavior has been de-risked at the existing `GitGateway.path_touches_under()` seam. The real gateway now uses `git log --name-status -M <range> -- .asdl/objectives`, so the projection can consume `PathChangeTouch.paths` without a richer Git path-change API for v1.
- Graphite metadata inconsistencies and missing local parent chains can be subtle. The projection must preserve enough warnings for users without aborting valid partial projections.
- Full spec conformance plus strict TDD may require more small slices than a prototype rewrite, but this is accepted to keep behavior deterministic and reviewable.
- Rendering details could leak into projection logic if glyphs or text annotations are introduced too early. The JSON model should stay semantic to protect locality.
- Context wiring could accidentally reintroduce generic Objective Git-trunk resolution or current-branch Graphite tracking assumptions; scenario tests should pin the intended preconditions.
- The Pi wrapper may duplicate some `/objective-list` helper structure. This is acceptable for v1 unless duplication becomes shallow enough to justify a later display-wrapper module.

## Open Questions

- Which Graphite validation result strings should be considered routine and therefore quiet in text annotations beyond the examples `OK`, `VALID`, and trunk-like states?
- Should skipped-branch warnings be emitted for every tracked branch missing locally, only for branches that sever otherwise local descendants, or exactly according to the branch-scope filtering tests that emerge?
- Deletion/rename testing confirmed the existing Git touch seam is adequate for v1 when implemented with name-status rename detection; no deeper Git interface is currently needed.
- After the wrapper lands, should `/objective-list` and `/objective-gt-stacks` share a small display-wrapper module, or is the duplication below the deletion-test threshold?
- Is a live local Graphite smoke test worth running before user inspection even though it is not required for closure?
