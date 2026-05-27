# Roadmap

## Work

- [x] Write the first failing tests for Git active-root touch semantics: additions, modifications, deletions, renames/moves, bare record paths, invalid slugs, and archive-root ignores at the existing `GitGateway.path_touches_under()` / Objective slug extraction seam. Evidence: slice `objective-gt-stacks-rewrite/git-touch-seam` added parser, real-gateway, and Objective slug extraction coverage; targeted pytest and ruff/format checks passed.
- [x] Decide from those tests whether the existing Git seam is sufficient; if not, deepen the Git interface with real/fake coverage before writing projection logic against it. Evidence: the existing `PathChangeTouch.paths` seam remained sufficient after switching the real command/parser to `git log --name-status -M`, preserving both active-root sides of renames without adding a richer Git API.
- [ ] Write failing projection tests for the spec worked example using `FakeGtGateway` and `FakeGitGateway`, asserting JSON-semantic facts rather than rendered glyphs.
- [ ] Add failing projection tests for branch scope filtering: current Graphite trunk only, locally present branches only, broken local parent chains, untracked Git branches excluded, trunk included as graph anchor, and current checkout branch not required to be tracked.
- [ ] Add failing projection tests for `parent..branch` slice attribution, many-to-many branch/Objectives, `also_touches`, active-root-only touches, archive-root ignores, Objective status projection from trunk, latest-work tie-breaking, deterministic ordering, and warning de-duplication.
- [ ] Implement and refactor the deep semantic projection module until the projection tests pass with locality: Graphite graph and Git/Objective reads in, semantic Objective stack projection out.
- [ ] Add failing renderer tests for human and Markdown output, then implement renderers over the semantic projection without putting glyphs or annotation strings in JSON models.
- [ ] Add failing CLI scenario tests for `objective gt`, `objective gt stacks`, help, `--json-schema`, all formats, empty output, failure envelopes, and plugin discovery; then wire the command and Graphite-specific context.
- [ ] Add failing TypeScript tests for `/objective-gt-stacks` registration, completions, strict argument rejection, idle-first execution, markdown/default command invocation, help invocation, success, command failure, startup failure, timeout, truncation, and display-message details.
- [ ] Implement `/objective-gt-stacks` inside the existing Objective Pi extension using the `/objective-list` display-wrapper pattern while keeping it a presentation adapter over the CLI.
- [ ] Run the relevant Python, Markdown, and TypeScript validation commands; record meaningful evidence and any changed assumptions through `objective-update`.

## Parked

- [ ] Interactive Objective stack viewer or TUI on top of the JSON contract.
- [ ] Cross-trunk, remote, or network-aware Graphite stack scanning.
- [ ] Graphite behavior in generic Objective commands such as `objective list`.
- [ ] Objective branch attachment, hidden state, registries, UUIDs, or workflow-control semantics.
- [ ] A richer Git path-change interface unless the TDD deletion/rename tests prove the current seam cannot satisfy the spec.
- [ ] A shared Pi display-wrapper helper for `/objective-list` and `/objective-gt-stacks` unless duplication becomes meaningfully shallow.
- [ ] Live local Graphite stack smoke test as optional confidence evidence, not a closure requirement.
- [ ] Automatic PR submission or stack submission.
