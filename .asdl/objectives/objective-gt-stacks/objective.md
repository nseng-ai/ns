# Objective Graphite Stacks

## Thesis

The Objective CLI currently mixes two different worlds: Objective records that exist in the current checkout, and Objective work projected across local branches. That makes `objective list` surprising because it can show in-flight branch-only Objectives that nearby record-moving commands such as `objective archive` cannot operate on from the current checkout.

This Objective splits the model cleanly. `objective list` becomes a filesystem-local inventory of active Objective records in the current checkout. Graphite-distributed Objective work moves to an explicit Graphite command, `objective gt stacks`, which shows Objective-shaped work across Graphite-tracked branches under the current Graphite trunk.

## Scope

- Redefine `objective list` as a checkout-local active-record inventory over `.asdl/objectives/<slug>/` directories present in the working tree.
- Remove `in-flight` from `objective list`; checkout-local records have only open/closed record status, with `active` remaining as the default open-record filter if still useful.
- Keep `objective list` output simple: Objective, status, and latest committed update. Prefix the latest-update cell with `(x)` when the Objective record has outstanding working-tree changes, including untracked files.
- Include untracked Objective directories in `objective list`; use `—` for latest committed update when no committed history exists.
- Add an explicit Graphite command surface under `objective gt`, with `objective gt stacks` as the v1 command.
- Make `objective gt stacks` Objective-grouped, not a raw `gt ls` clone: each Objective group summarizes objective-branch count, segment count, and latest Objective-touch branch, then shows Graphite segment rows.
- Use Graphite trunk as the status source for `objective gt stacks`; scan all Graphite-tracked local branches under the current Graphite trunk, not all configured trunks.
- Define Objective-stack membership by branch-local slice touches under `.asdl/objectives/<slug>/`, using each branch's Graphite parent as the slice base. Active-root deletions count as touches; `.asdl/objective-archive/` is ignored entirely.
- Support many-to-many Objective/branch relationships: a branch that touches multiple Objectives appears under each touched Objective and is marked with the other touched slugs.
- Support disconnected Objective work by showing one Objective group with multiple stack segments. Segment rows include connector branches needed to preserve Graphite dependency shape.
- Use `◆` for branches whose local slice touches the Objective and `◇` for connector branches that only preserve stack shape.
- Provide human, JSON, and Markdown output for `objective gt stacks`; keep Markdown simple and JSON structurally complete.
- Update first-party tests, skills, docs, and consumers to the new contracts with no backward-compatibility shim for the old branch-wide `objective list` JSON.
- Update the repo-local Pi Objective extension: keep `/objective-list` as a checkout-local display wrapper, migrate Objective picker commands to the new checkout-local JSON schema, and add a separate `/objective-gt-stacks` display wrapper for `objective gt stacks`.
- Preserve a follow-up design record for a richer interactive TUI, without implementing the TUI in this Objective.

## Non-Goals

- Do not retain backward compatibility for old `objective list` branch-wide behavior or JSON fields.
- Do not make `objective list` a branch/status dashboard; branch and stack concepts belong under `objective gt stacks`.
- Do not parse human `gt ls` output. Use structured Graphite metadata through the Graphite gateway.
- Do not require the current branch itself to be Graphite-tracked if Graphite metadata for the current trunk can still be read.
- Do not scan untracked Git branches in `objective gt stacks`; the command is explicitly Graphite-backed.
- Do not scan all configured Graphite trunks in v1.
- Do not render exact `gt ls` connector art in v1. Prefer a correct, simple indented segment layout.
- Do not show slice commit counts or `max slice` metrics in v1.
- Do not infer pending lifecycle summaries such as "closing" or "creating" from branch diffs in v1; let the stack rows tell the story.
- Do not include already archived Objectives or archive-root-only edits in `objective gt stacks`.
- Do not implement the interactive TUI in this Objective.

## Completion Criteria

- `objective list` reads `.asdl/objectives/` from the current working tree, includes untracked Objective directories, omits `.asdl/objective-archive/`, and no longer reports `in-flight` records.
- `objective list --status in-flight` is invalid or removed, while the remaining status filters match checkout-local record status.
- `objective list` human and Markdown output no longer includes branch-only columns such as latest work, work branches, or max slice commits.
- `objective list` latest-update rendering uses latest committed Objective-path history, with `(x)` prefixed when there are outstanding working-tree changes under that Objective record.
- `objective gt stacks` exists under an explicit `objective gt` subgroup and uses a Graphite gateway, not `gt ls` text parsing.
- `objective gt stacks` scans all Graphite-tracked local branches under the current Graphite trunk, computes branch-local Objective touches from Graphite-parent slice ranges, ignores archive-root paths, and includes active-root deletions.
- `objective gt stacks` groups by Objective slug, supports many-to-many branch/Objectives, supports multiple disconnected segments per Objective, and shows connector branches with `◇` while Objective-touching branches use `◆`.
- `objective gt stacks` provides human, JSON, and Markdown outputs with stable tests for many-to-many branches, disconnected segments, connector branches, archive-root omission, active-root deletion inclusion, current-branch-untracked operation, and Graphite failure reporting.
- The Pi Objective extension no longer depends on branch-wide `objective list` fields; `/objective-list` displays checkout-local records, Objective picker commands use the new record-oriented JSON schema, and `/objective-gt-stacks` displays the Graphite stack projection.
- First-party consumers and docs, including the public `objective` skill, describe the new split between checkout-local records and Graphite Objective stacks.
- `.asdl/objectives/objective-gt-stacks/design.md` records the mental model, v1 design decisions, and TUI follow-up notes.

## Assumptions and Risks

Assumptions:

- The clean split between checkout-local records and Graphite stack projection is the right mental model, even though it is a breaking change for existing `objective list` consumers.
- Phase 2 confirmed that the Graphite gateway can expose current-trunk graph metadata for all reachable Graphite-tracked branches without depending on human `gt ls` output.
- Phase 3 confirms the model-level slice: Git path-change queries over `parent..branch` ranges identify Objective touches, including active-root deletions, while archive-root-only edits are ignored before grouping.
- `(x)` is an acceptable compact marker for outstanding working-tree changes in `objective list` latest-update output.
- Markdown and JSON consumers can migrate directly to the new contracts in the same workstream.

Risks:

- The current-branch-centered `GtGateway.stack()` risk is de-risked for Phase 2: `GtGateway.branch_graph(cwd)` now provides a separate repo/trunk-centered graph model while leaving `stack()` stable.
- Phase 3 de-risks model-level segment construction for many-to-many Objective/branch relationships, disconnected regions, and connector rows. The later renderer phase should keep glyphs and terminal layout separate from the semantic segment model.
- Removing old `objective list` JSON fields was a TypeScript Objective picker breakage risk; the Pi Objective extension now consumes the record-oriented schema, removes branch-count/latest-work labels, and verifies the picker/list flows against the new contract. The remaining Pi extension risk is the separate `/objective-gt-stacks` wrapper, which still waits for the Graphite command.
- Dirty-state detection for `(x)` is de-risked for checkout-local `objective list` by path-scoped Git status coverage of staged, unstaged, untracked, and unrelated paths. The Pi picker still needs a separate integration slice before it can use checkout-local outstanding-change facts for suggestions.
- The model-level risk of ignoring archive-root paths while including active-root deletions is de-risked by Phase 3 touch extraction tests. The later CLI phase still needs scenario coverage to preserve that behavior through command wiring and renderers.
- A future TUI may need richer graph data than the first human CLI renderer. Mitigation: design JSON around semantic graph facts rather than terminal glyphs.

## Open Questions

Resolved during Phase 1 checkout-local list core:

- `objective list --status active` remains supported as an alias for open checkout-local records.
- The record-oriented `objective list --format json` schema exposes `trunk_branch`, `root_path`, `status_filter`, `names_only`, and `records[].slug/status/latest_update_iso`. It does not expose formatted latest-update text, dirty state, branch groups, or branch/source projection fields.
- Dirty checkout-local Objective records are presentation-only for `objective list`: human and Markdown output prefix the latest-update cell with `(x)`, while JSON remains raw and dirty-state-free.

Resolved during Phase 2 structured Graphite graph support:

- The gateway shape for repo-level Graphite scanning is `GtGateway.branch_graph(cwd)`, returning a `GtBranchGraph` of `GtTrackedBranch` rows reachable from the configured Graphite trunk.
- `branch_graph()` reads `.graphite_repo_config` and `.graphite_metadata.db` read-only, does not parse `gt ls`, and does not require the current checkout branch to be Graphite-tracked.

Still open:

- What exact JSON schema should `objective gt stacks` expose so both tests and a future TUI can depend on it without freezing human rendering details?
- How much branch annotation belongs in v1 `objective gt stacks` rows beyond Objective touch/connectors and multi-Objective markers, especially Graphite restack health and slot labels?
- Should the future TUI live as a standalone terminal application, a Python CLI subcommand, or a Pi extension surface that consumes the JSON output?
