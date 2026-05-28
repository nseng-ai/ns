# Roadmap

Pure projection-first sequencing: build and fully TDD the deep semantic projection module in isolation against `FakeGtGateway` / `FakeGitGateway` (items 1–8), then wrap thin CLI and rendering adapters (items 9–14). Each item is TDD-shaped: write a failing public-interface test first, implement only enough to pass, then refactor toward locality and leverage. Section/line references point at `docs/specs/objective-gt-stacks.md`.

## Work

### Projection core — the primary semantic surface (unit tests over fakes)

- [ ] **Projection skeleton + empty case.** Define the result data types mirroring §7.3.2 (`objectives` / `segments` / `rows` / `latest_work`) and the single projection entry function over a `GtGateway` + `GitGateway` + trunk ref. First failing unit test: trunk-only branch graph → `trunk_branch` set, `warnings: []`, `objectives: []`. Stand up the shared `FakeGt`/`FakeGit` fixtures.
- [ ] **Branch scope selection (§5.1).** In-scope = Graphite-tracked + locally-present + trunk-connected through locally-present parents; trunk always anchors; untracked branches never in scope; current branch need not be tracked. Dropping a non-local parent severs and drops its descendants with the skipped-branch warning (§9.1). Unit tests over fake branch graphs crossed with fake local-branch sets.
- [ ] **Per-branch touches (§5.2).** Compute each branch's `parent..branch` slice via `path_touches_under` under the **active root only**; deletions and renames count; archive root ignored entirely; record the latest touching commit (`oid`, `committed_iso`) per slug within the slice. Unit tests incl. multi-Objective slices, deletion touches, and archive-root paths that must not register.
- [ ] **Grouping by Objective + also_touches (§5.3).** One group per touched slug; a branch appears under each slug it touches; each row carries a sorted `also_touches` excluding the group's own slug; only touched slugs appear (active-on-trunk-but-untouched belongs to `objective list`, not here).
- [ ] **Segments + connectors (§5.4, §5.6).** Build group membership (touching branches plus their ancestor chains up to but excluding trunk), partition into connected parent/child regions = segments; mark **connectors** (in-segment branches whose own slice does not touch the Objective); exclude connectors from `objective_branch_count`; compute `segment_count`. Anchor on the §10 two-segment `alpha` shape with `feat/connector` inside segment 1.
- [ ] **Projected status (§5.5).** Read the **trunk** ref (not the checkout): active record present + no closed marker → `open`; present + `closed.md` → `closed`; absent on trunk but touched by a branch → `in-flight`; no pending-transition interpretation. Unit tests over fake `list_directories_at_ref` / `path_exists_at_ref` trunk reads.
- [ ] **Latest work (§5.7).** Newest Objective-touching commit across the Objective branches (connectors excluded); deterministic tie-break = timestamp, then branch name, then `oid`; uninterpretable timestamps sort older than any interpretable one; `null` when the group has no touching commit.
- [ ] **Ordering, determinism & warnings (§5.8, §9).** Alphabetical slugs; stable segment order by stack position; rows in stack order with correct `depth` (segment root = 0); sorted `also_touches`; de-duplicated warnings incl. ancestor-walk anomalies (§9.2) and branch-graph pass-through diagnostics (§9.3). Capstone unit test: full projection equals the §10 worked-example `data` object exactly.

### Adapters — thin CLI + renderers (scenario tests over `build_cli()`)

- [ ] **gt context + `objective gt` group + `stacks` skeleton.** Dedicated git+gt context and factory (base `objective` context stays Graphite-free); mount the `gt` `ClinkrGroup` (help "Work with Graphite Objective stack projections") with the `stacks` op (help "Show Objective work across Graphite-tracked branches", no positional args). First failing scenario test: `objective gt stacks --help` shows `Usage: objective gt stacks`, the description, `--format`, and `--json-schema` (§4).
- [ ] **JSON envelope + `--json-schema` (§7.3).** Clinkr Result model mirrors the projection `data` object; success → `{exit_code: 0, data}`; `--json-schema` prints the input/output schema document and exits 0. Scenario test reproduces the §10 JSON envelope verbatim from injected fakes.
- [ ] **Failure taxonomy (§8).** `not_in_repo` (context unavailable), `gt_branch_graph_failed` (branch-graph read failure, message form `Graphite branch graph failed: <detail>`), and stable data-read identifiers for slice / trunk-status failures; exit `2`; JSON failure envelope (§7.3.1) / `error:`-prefixed human stderr; never a partial projection. Scenario + unit tests per `error_type`.
- [ ] **Human renderer (§7.1, §6).** Header + unadorned trunk line; optional `Warnings:` block; status labels `○ open` / `✓ closed` / `◇ in-flight`; pluralized counts; `latest: <branch> (<rel>)` / branch-only / `—`; blank-line-preceded `segment <n>` headers; two-space-per-depth glyph rows (`◆`/`◇`) with parenthesized annotations (`also: …`; `needs restack`; `gt: <result>`); dimmed `No Objective stack work found.` when empty. Renderer tests over the §10 projection assert structure (relative time by shape, not exact duration).
- [ ] **Markdown renderer (§7.2, §6).** `# Objective stacks`, backticked trunk, `##` status+slug headings, three summary bullets, fenced `` ```text `` segment blocks with one-less leading indent and blank-line separators between segments, `latest` as `` `<branch>` at `<iso>` (`<oid>`) `` / `—`, and the empty-state line. Renderer tests over the §10 projection assert exact markdown.
- [ ] **Conformance pass.** Grade against the §13 acceptance checklist (every CLI bullet); verify `objective list` and the base `objective` context remain Graphite-free; run `just check` to green (or record unrelated blockers); leave the Objective open for user inspection and manual closure.

## Parked

- [ ] `/objective-gt-stacks` Pi display wrapper (spec §11) — separate follow-on Objective (scope decision for this build).
- [ ] Live Graphite-stack end-to-end smoke run as a closure prerequisite — fake-driven tests are the closure surface.
- [ ] Any `asdl_core` seam extension — only if a proven gap appears while validating seam reads (contingency, not planned work; would be graduation-style).
- [ ] Vertical steelthread-first sequencing — the considered alternative; not chosen for this build.
- [ ] Interactive graph viewer / TUI over the JSON contract — explicit spec §12 future, enabled by the graph-semantic JSON.
