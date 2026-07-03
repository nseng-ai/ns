# Objective Graphite Stacks Design

## Mental Model

There are two separate Objective worlds:

1. **Objective records in the current checkout.** These are directories physically present under `.asdl/objectives/<slug>/`. Commands that move or edit records, such as `objective archive`, operate in this world.
2. **Objective work distributed across Graphite stacks.** This is branch-local work in Graphite-tracked branches whose slices touch Objective records. This is a stack projection, not a checkout-local record inventory.

The current confusion comes from `objective list` mixing those worlds. It can show an Objective that exists only on another local branch, but `objective archive <slug>` then fails because no record exists in the current checkout.

The new model is:

```text
objective list
# Objective records in the current checkout

objective gt stacks
# Objective work across Graphite-tracked stacks
```

`in-flight` is not a record status. It is a Graphite-stack projection status: the Objective is absent from the Graphite trunk status source but has branch-local Objective work in Graphite-tracked branches.

## `objective list` Contract

`objective list` becomes a filesystem-local inventory:

- Discover `.asdl/objectives/<slug>/` directories in the working tree.
- Include untracked Objective directories.
- Ignore `.asdl/objective-archive/` completely.
- Status is derived from files in the current checkout:
  - `closed.md` exists: `✓ closed`
  - otherwise: `○ open`
- `in-flight` is removed from `objective list`.
- Output columns are simplified to:
  - Objective
  - Status
  - Latest update

The latest-update cell combines durable history with a small pending-change signal:

```text
Objective                  Status     Latest update
pi-extension-deepening     ✓ closed   (x) 12m ago
repo-ontology              ○ open     6m ago
new-objective              ○ open     (x)
```

Meaning:

- `(x)` means this Objective record has outstanding working-tree changes in the current checkout.
- A trailing age is the latest committed Objective-path touch, if any.
- `(x)` alone means outstanding changes with no committed history yet.
- `—` means no committed history and no outstanding changes.

Outstanding changes include staged, unstaged, and untracked paths under `.asdl/objectives/<slug>/`.

## `objective gt stacks` Contract

`objective gt stacks` is explicitly Graphite-backed. The command path includes `gt` because runtime package code should only depend on Graphite when Graphite is part of the user-facing contract.

V1 semantics:

- Use Graphite trunk as the status source.
- Scan all Graphite-tracked local branches under the current Graphite trunk.
- Do not scan all configured Graphite trunks.
- Do not include untracked Git branches.
- Do not require the current branch itself to be Graphite-tracked if Graphite metadata for the repo/trunk can still be read.
- Use structured Graphite metadata through the Graphite gateway; do not parse `gt ls` text.
- Use each branch's Graphite parent as the slice base. Objective touches are computed from `parent..branch`, not `trunk..branch`.
- Consider only paths under `.asdl/objectives/<slug>/`.
- Ignore `.asdl/objective-archive/` entirely.
- Active-root deletions count as Objective touches, because deleting or moving an active record is Objective lifecycle work.
- Archive-root-only edits do not count, because archived Objectives should pretend not to exist in this command.

Objective status in `objective gt stacks`:

- `○ open`: active Objective record exists on Graphite trunk and is not closed.
- `✓ closed`: active Objective record exists on Graphite trunk and has `closed.md`.
- `◇ in-flight`: active Objective record is absent from Graphite trunk but at least one Graphite branch slice touches `.asdl/objectives/<slug>/`.

V1 deliberately avoids pending-state interpretation. For example, if a branch adds `closed.md`, the group header does not say "closing". The full stack rows tell the story; richer summarization can come later.

## Objective Grouping and Non-Bijections

Objective-stack membership is many-to-many:

- One branch may touch multiple Objective records.
- One Objective may have work in multiple disconnected Graphite stack regions.
- One Graphite stack may contain work for multiple Objectives.
- Some branches are only connectors for dependency shape and do not touch the Objective.

Rules:

- A branch appears under every Objective whose active-root paths it touches in its local slice.
- If a branch touches multiple Objectives, duplicate it under each relevant Objective and mark the other slugs with an `also` annotation.
- If an Objective has touched branches in disconnected Graphite regions, render one Objective group with multiple segments.
- Within each segment, include connector branches needed to preserve the dependency path between Objective-touching branches.
- Connector branches do not count as Objective branches and do not participate in latest Objective-work attribution.

## Segment and Row Rendering

The command is not beholden to `gt ls` connector art. It should borrow the idea of branch-shape visualization, but v1 prioritizes semantic correctness over exact glyph fidelity.

Human output is Objective-grouped with simple indented segments:

```text
Objective stacks
Graphite trunk: master

◇ vibechk-v1  3 objective branches  1 segment  latest: add-vibechk-runs-listing

  segment 1
  ◆ add-vibechk-cli-package
    ◇ prepare-shared-cli-helper
      ◆ prioritize-vibechk-walking-skeleton-first-run-show
        ◆ add-vibechk-runs-listing

○ repo-ontology  1 objective branch  1 segment  latest: rebaseline-pi-objective-context-map

  segment 1
  ◆ rebaseline-pi-objective-context-map
```

Iconography:

- `◆`: this branch's local slice touches the Objective.
- `◇`: connector branch included only to show Graphite dependency shape.
- Existing Objective status icons remain for group headers: `○ open`, `✓ closed`, `◇ in-flight`.

Branch annotations can include multi-Objective markers and deterministic Graphite health facts if they are cheap in v1. Slice commit counts and `max slice` are intentionally omitted.

## Latest Work

Latest Objective work is based on Objective-path touch commits within branch-local slices, not branch head timestamps.

For an Objective group:

1. Look only at branches whose local slice touches the Objective.
2. Find the newest commit timestamp among Objective-path touches for that Objective.
3. Report that branch as `latest`.

Connector branches are ignored for latest-work attribution.

## Pi Objective Extension Plan

The repo-local Pi Objective extension has two different responsibilities today, and this Objective should update both deliberately.

### `/objective-list` display command

Keep the slash command name `/objective-list`, but change its meaning to match the new CLI contract:

```text
/objective-list
# shows checkout-local Objective records by running objective list --format markdown
```

Planned argument changes:

- Remove `--current`; checkout-local is now the only `objective list` mode.
- Remove `--view list|detail`; the checkout-local list has one simple view.
- Keep `--names` if the Python CLI keeps it.
- Add or pass through `--status active|open|closed|all` if the Python CLI keeps those filters.
- Continue rejecting `--format` and `--json-schema` because the extension owns the presentation format.
- Update completions and usage text to the new arguments.

`/objective-list` should stay a thin display wrapper over the Python CLI. It should not learn Graphite stack semantics and should not grow a `--gt` or `--stacks` mode.

### Objective picker commands

The same extension also powers Objective selection for:

- `/objective-next`
- `/objective-current`
- `/objective-update`
- `/objective-stack-impl`

Those picker flows should move to the new checkout-local `objective list --format json` schema. They should no longer parse branch arrays, latest work branches, or slice commit counts from `objective list`.

Picker labels should be record-oriented, for example:

```text
repo-ontology — open — latest update 6m ago
pi-extension-deepening — closed — latest update (x) 12m ago
objective-gt-stacks — open — latest update (x)
```

The picker should still support explicit slug/path bypass: if the user invokes `/objective-next some-slug`, the extension should not run `objective list`.

Changed-Objective suggestions should remain, but use the new model:

- Use structured `objective list` JSON to know the active checkout-local candidate set and per-record outstanding-change marker.
- Keep `git diff --name-status -M <trunk>...HEAD -- .asdl/objectives` or an equivalent git-gateway-backed fact to detect committed Objective changes relative to trunk.
- Treat Objectives with `(x)`/outstanding checkout changes as changed candidates too.
- Suggest a single Objective only when exactly one active checkout-local Objective is changed by these facts; otherwise present changed candidates first and require explicit selection.

To support this, `objective list --format json` may still expose the repository trunk branch as metadata for picker diffing, but it should not expose status-source or branch-projection fields such as `branches`, `latest_work_branch`, `filtered_to_current`, or `slice_commits`.

### Graphite stacks command in Pi

Add a separate Pi slash command for the new stack projection rather than overloading `/objective-list`:

```text
/objective-gt-stacks
# shows objective gt stacks --format markdown
```

This command should be a thin display wrapper like `/objective-list`:

- Run `objective gt stacks --format markdown`.
- Present the output as a custom Pi message.
- Support `--help`.
- Defer rich interactive graph exploration to the future TUI.

This keeps the Pi command model aligned with the CLI model:

```text
/objective-list       -> objective list
/objective-gt-stacks  -> objective gt stacks
```

### TypeScript module consequences

Expected TypeScript changes:

- Rewrite `objective-list.ts` around the new checkout-local JSON schema.
- Remove `ObjectiveBranchEntry`, `latestWorkBranch`, and `sliceCommits` from the Objective picker model.
- Update `objective-picker.ts` labels and changed-candidate logic.
- Update `objective.test.ts`, `objective-list.test.ts`, and `objective-picker.test.ts` fixtures away from branch-wide `objective list` JSON.
- Add tests for `/objective-list` rejecting removed flags and accepting any retained `--status`/`--names` flags.
- Add tests for `/objective-gt-stacks` command registration, markdown execution, help, failure presentation, and argument rejection/forwarding policy.

## Output Formats

V1 includes human, JSON, and Markdown.

Human output is optimized for reading in a terminal and may evolve visually.

JSON should be structurally complete enough for tests and future consumers. It should expose stable semantic facts rather than terminal glyph decisions, including:

- Graphite trunk branch.
- Objective groups and projected Objective status.
- Objective branch count.
- Segment count.
- Latest Objective-work branch and timestamp, when known.
- Segments with branch rows.
- Branch row name, parent, children or depth/path information, Objective-touch boolean, connector boolean, and `also_touches` slugs.
- Graphite warnings or non-ideal states.

Markdown can stay simple: Objective summaries plus fenced text for segment rows.

There is no backward-compatibility requirement for old `objective list --format json` branch-wide fields. First-party consumers should migrate directly.

## Testing Requirements

Important scenario coverage:

- `objective list` includes active working-tree Objective directories, including untracked records.
- `objective list` omits archive-root records.
- `objective list` reports open/closed only and rejects or removes `in-flight`.
- `objective list` prefixes latest update with `(x)` for staged, unstaged, deleted, and untracked changes under a record.
- `objective gt stacks` groups by Objective slug with Graphite trunk status projection.
- Branch slice `parent..branch` avoids inherited lower-stack Objective touches.
- Active-root deletion counts as an Objective touch.
- Archive-root-only changes do not count.
- One branch touching multiple Objectives appears under each with an `also` marker.
- One Objective split across disconnected Graphite regions renders one Objective group with multiple segments.
- Connector branches appear with `◇` and do not count as Objective branches.
- Current branch untracked by Graphite does not fail if graph metadata for current trunk can still be read.
- Graphite metadata failures produce clear command failures.

## TUI Follow-Up Notes

A TUI is a natural follow-up because the hard part of this domain is interactive graph exploration, not static text rendering.

Static CLI is awkward for:

- **Many-to-many cross-highlighting.** A branch can touch multiple Objectives and an Objective can span multiple stack segments. Static output duplicates branches; a TUI can select a branch and highlight every Objective it touches, or select an Objective and highlight every relevant branch.
- **Switching orientation.** Users sometimes want Objective-grouped output and sometimes want a full Graphite-tree-first overlay. Static CLI has to choose one. A TUI can toggle between Objective-first and graph-first views over the same data.
- **Disconnected segments.** Static output repeats segment headers and connector rows. A TUI can show a minimap, collapse distant segments, and jump between them.
- **Connector branches.** Static output can mark connectors with `◇`, but a TUI can dim them, collapse them, or reveal why they are included in the dependency path.
- **Long branch names and annotations.** Static tables wrap poorly. A TUI can use horizontal scrolling, side panels, truncation with detail panes, and search.
- **Branch detail inspection.** A TUI can show a selected branch's Objective paths, diff summary, latest Objective-touch commits, PR link, Graphite parent/children, slot label, and restack state without cluttering every row.
- **Lifecycle facts without premature summarization.** V1 CLI avoids interpreting "closing" or "archiving". A TUI could show raw path facts in a detail pane, such as "deleted `.asdl/objectives/foo/closed.md`" or "deleted active Objective record", without putting semantic labels in the group header.
- **Filtering and focus.** A TUI can filter by Objective status, current branch ancestry, slot, restack health, dirty checkout records, Objective slug, branch name, or latest-work recency.
- **Live refresh.** Graphite and git state can change quickly during stack work. A TUI can refresh the graph and preserve selection, while a static command requires reruns.
- **Navigation actions.** A future read/write TUI could offer guarded actions such as checkout branch, open Objective file, run `objective list`, run `objective-update`, or invoke `gt restack`. V1 TUI should probably be read-only until the display model is trusted.

Data-model recommendations for TUI readiness:

- Keep `objective gt stacks --format json` graph-semantic, not renderer-semantic. The TUI should not parse human glyphs.
- Include enough parent/child/depth data for the TUI to choose its own layout.
- Preserve many-to-many facts explicitly (`touches_objective`, `also_touches`, and per-Objective segment membership).
- Preserve connector status as data, not just as the `◇` glyph.
- Include warnings and non-ideal states in structured form.
- Consider exposing raw Objective-path touch summaries later, but keep v1 focused on branch/objective membership.

Likely TUI product questions for a follow-up Objective:

- Should the TUI be a standalone Python command, a Textual/Rich application, or a Pi extension surface?
- Should v1 TUI be read-only, or include branch checkout/navigation actions?
- Should it consume `objective gt stacks --format json`, call Python internals directly, or share a library model with the CLI?
- Should it render Objective-first by default, graph-first by default, or persist the user's last orientation?
- How should it handle Graphite metadata refreshes, stale branches, and worktree changes while preserving the user's selection?
