# Roadmap

## Work

Phase 0 — durable design baseline

- [x] Create `.asdl/objectives/objective-gt-stacks/` with the agreed Objective thesis, scope, and design-decision document.
- [x] Capture the checkout-local vs Graphite-stack mental model in `design.md`, including TUI follow-up notes.

Phase 1 — checkout-local `objective list`

- [x] Replace branch-projected `objective list` inventory with filesystem-local discovery of `.asdl/objectives/<slug>/` in the current checkout.
- [x] Simplify `objective list` statuses to checkout-local record status and remove `in-flight` from the list command.
- [x] Simplify list renderers to Objective, status, and latest update; remove latest work, work branches, and max slice commit columns.
- [x] Add `(x)` latest-update prefix when an Objective record has outstanding working-tree changes, including staged, unstaged, and untracked paths.
- [x] Update `objective list` JSON and Markdown tests for untracked Objective directories, closed records, active/archive root separation, and lack of branch-wide data.
- [x] Add dirty-marker tests for `(x)` once outstanding-change detection lands.

Phase 2 — structured Graphite graph support

- [x] Extend the Graphite gateway or add a focused Objective-side adapter that returns all Graphite-tracked branches under the current Graphite trunk with parent/child relationships and branch annotations needed by `objective gt stacks`.
- [x] Keep the implementation independent of human `gt ls` output.
- [x] Add fake-driven tests for current-branch-untracked operation, current-trunk scoping, Graphite metadata failures, disconnected branch regions, and branch annotations that are available in v1.

Phase 3 — Objective stack projection model

- [x] Compute branch-local Objective touches from each Graphite branch's parent slice, using only `.asdl/objectives/<slug>/` paths.
- [x] Count active-root deletions as Objective touches while ignoring `.asdl/objective-archive/` entirely.
- [x] Build Objective groups that support one branch touching multiple Objectives and one Objective appearing in multiple disconnected stack segments.
- [x] Include connector branches needed to preserve dependency shape within each segment and mark them separately from Objective-touching branches.
- [x] Attribute latest Objective work from Objective-path touch commits inside branch-local slices, not from branch head timestamps.

Phase 4 — `objective gt stacks` CLI

- [ ] Add an explicit `objective gt` subgroup and `objective gt stacks` command in `asdl-objectives`.
- [ ] Render human output as Objective-grouped segments with `◆` for Objective-touching branches and `◇` for connector branches.
- [ ] Provide structurally complete JSON output for Objectives, segments, branch rows, parent relationships, Objective-touch markers, multi-Objective markers, and latest work branch.
- [ ] Provide simple Markdown output with Objective summaries and fenced segment text.
- [ ] Add scenario tests for many-to-many Objective/branch relationships, disconnected segments, connector rows, archive-root omission, active-root deletion inclusion, Graphite trunk status projection, and Graphite error cases.

Phase 5 — Pi Objective extension

- [x] Rewrite `ts/packages/pi-extensions/src/objective-list.ts` around the new checkout-local `objective list --format json` schema.
- [x] Update `ts/packages/pi-extensions/src/objective-picker.ts` to remove branch-count/latest-work/max-slice labels and present record-oriented picker labels using status and latest update.
- [x] Update `/objective-next`, `/objective-current`, `/objective-update`, and `/objective-stack-impl` selection flows to call `objective list --format json` without `--current` and to use checkout-local candidates.
- [~] Preserve changed-Objective suggestions by combining checkout-local outstanding-change facts with committed Objective diffs versus trunk, while still requiring explicit selection when multiple candidates exist. Committed Objective diff suggestions are preserved; checkout-local outstanding-change facts are now available in the Python CLI, but picker suggestion integration remains future work.
- [x] Change `/objective-list` into a thin checkout-local display wrapper: remove `--current` and `--view`, keep/pass through retained list flags such as `--names` and `--status`, and update usage/completions.
- [ ] Add `/objective-gt-stacks` as a separate thin display wrapper around `objective gt stacks --format markdown`.
- [x] Update TypeScript tests for the new Objective-list schema, picker labels, removed flags, and `/objective-list` display behavior. `/objective-gt-stacks` display tests remain with the wrapper.

Phase 6 — consumers and docs

- [x] Update remaining first-party TypeScript/Pi consumers that parse `objective list` output to the new checkout-local contract or to `objective gt stacks` where branch-stack data is required.
- [~] Update the public `objective` skill to describe `objective list` as checkout-local and `objective gt stacks` as the Graphite Objective stack projection. Checkout-local list language is updated; the Graphite stack projection language waits until the command exists.
- [~] Update any prompt templates or repo docs that currently rely on `objective list` for branch-wide in-flight Objective discovery. Objective docs and selection/closure skills no longer describe `in-flight` candidates; later stack-specific docs still belong with `objective gt stacks`.
- [~] Run package and repo validation appropriate to the changed Python, TypeScript, Markdown, and skill files. The Pi extension TypeScript test and typecheck suite passed for this slice; full repo validation remains for later cross-language slices.

## Parked

- Interactive TUI for Objective stacks — keep the requirements and opportunities in `design.md`, but implement as a follow-up Objective or later phase after the JSON graph contract settles.
- Exact `gt ls` connector-glyph rendering — defer until the semantic model is proven; v1 uses simpler indented segments.
- Cross-trunk Graphite stack inventory — v1 scopes to current Graphite trunk only.
- Non-Graphite branch inventory — out of scope for `objective gt stacks`; revisit only if a separate Git-only command is justified.
- Pending lifecycle summaries such as "closes", "creates", or "archives" — v1 avoids interpretation and lets branch rows/diffs tell the story.
- Slice commit counts, `max slice`, and other size metrics — dropped from v1 unless later user feedback proves they are useful.
- Slot-label integration and Graphite health annotations beyond what is cheap and deterministic in the first implementation slice.
