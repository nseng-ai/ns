# Roadmap

## Work

Phase 0 — durable design baseline

- [x] Create `.asdl/objectives/objective-gt-stacks/` with the agreed Objective thesis, scope, and design-decision document.
- [x] Capture the checkout-local vs Graphite-stack mental model in `design.md`, including TUI follow-up notes.

Phase 1 — checkout-local `objective list`

- [ ] Replace branch-projected `objective list` inventory with filesystem-local discovery of `.asdl/objectives/<slug>/` in the current checkout.
- [ ] Simplify `objective list` statuses to checkout-local record status and remove `in-flight` from the list command.
- [ ] Simplify list renderers to Objective, status, and latest update; remove latest work, work branches, and max slice commit columns.
- [ ] Add `(x)` latest-update prefix when an Objective record has outstanding working-tree changes, including staged, unstaged, and untracked paths.
- [ ] Update `objective list` JSON and Markdown tests for untracked Objective directories, dirty markers, closed records, active/archive root separation, and lack of branch-wide data.

Phase 2 — structured Graphite graph support

- [ ] Extend the Graphite gateway or add a focused Objective-side adapter that returns all Graphite-tracked branches under the current Graphite trunk with parent/child relationships and branch annotations needed by `objective gt stacks`.
- [ ] Keep the implementation independent of human `gt ls` output.
- [ ] Add fake-driven tests for current-branch-untracked operation, current-trunk scoping, Graphite metadata failures, disconnected branch regions, and branch annotations that are available in v1.

Phase 3 — Objective stack projection model

- [ ] Compute branch-local Objective touches from each Graphite branch's parent slice, using only `.asdl/objectives/<slug>/` paths.
- [ ] Count active-root deletions as Objective touches while ignoring `.asdl/objective-archive/` entirely.
- [ ] Build Objective groups that support one branch touching multiple Objectives and one Objective appearing in multiple disconnected stack segments.
- [ ] Include connector branches needed to preserve dependency shape within each segment and mark them separately from Objective-touching branches.
- [ ] Attribute latest Objective work from Objective-path touch commits inside branch-local slices, not from branch head timestamps.

Phase 4 — `objective gt stacks` CLI

- [ ] Add an explicit `objective gt` subgroup and `objective gt stacks` command in `asdl-objectives`.
- [ ] Render human output as Objective-grouped segments with `◆` for Objective-touching branches and `◇` for connector branches.
- [ ] Provide structurally complete JSON output for Objectives, segments, branch rows, parent relationships, Objective-touch markers, multi-Objective markers, and latest work branch.
- [ ] Provide simple Markdown output with Objective summaries and fenced segment text.
- [ ] Add scenario tests for many-to-many Objective/branch relationships, disconnected segments, connector rows, archive-root omission, active-root deletion inclusion, Graphite trunk status projection, and Graphite error cases.

Phase 5 — Pi Objective extension

- [ ] Rewrite `ts/packages/pi-extensions/src/objective-list.ts` around the new checkout-local `objective list --format json` schema.
- [ ] Update `ts/packages/pi-extensions/src/objective-picker.ts` to remove branch-count/latest-work/max-slice labels and present record-oriented picker labels using status and latest update.
- [ ] Update `/objective-next`, `/objective-current`, `/objective-update`, and `/objective-stack-impl` selection flows to call `objective list --format json` without `--current` and to use checkout-local candidates.
- [ ] Preserve changed-Objective suggestions by combining checkout-local outstanding-change facts with committed Objective diffs versus trunk, while still requiring explicit selection when multiple candidates exist.
- [ ] Change `/objective-list` into a thin checkout-local display wrapper: remove `--current` and `--view`, keep/pass through retained list flags such as `--names` and `--status`, and update usage/completions.
- [ ] Add `/objective-gt-stacks` as a separate thin display wrapper around `objective gt stacks --format markdown`.
- [ ] Update TypeScript tests for the new Objective-list schema, picker labels, removed flags, `/objective-list` display behavior, and `/objective-gt-stacks` display behavior.

Phase 6 — consumers and docs

- [ ] Update remaining first-party TypeScript/Pi consumers that parse `objective list` output to the new checkout-local contract or to `objective gt stacks` where branch-stack data is required.
- [ ] Update the public `objective` skill to describe `objective list` as checkout-local and `objective gt stacks` as the Graphite Objective stack projection.
- [ ] Update any prompt templates or repo docs that currently rely on `objective list` for branch-wide in-flight Objective discovery.
- [ ] Run package and repo validation appropriate to the changed Python, TypeScript, Markdown, and skill files.

## Parked

- Interactive TUI for Objective stacks — keep the requirements and opportunities in `design.md`, but implement as a follow-up Objective or later phase after the JSON graph contract settles.
- Exact `gt ls` connector-glyph rendering — defer until the semantic model is proven; v1 uses simpler indented segments.
- Cross-trunk Graphite stack inventory — v1 scopes to current Graphite trunk only.
- Non-Graphite branch inventory — out of scope for `objective gt stacks`; revisit only if a separate Git-only command is justified.
- Pending lifecycle summaries such as "closes", "creates", or "archives" — v1 avoids interpretation and lets branch rows/diffs tell the story.
- Slice commit counts, `max slice`, and other size metrics — dropped from v1 unless later user feedback proves they are useful.
- Slot-label integration and Graphite health annotations beyond what is cheap and deterministic in the first implementation slice.
