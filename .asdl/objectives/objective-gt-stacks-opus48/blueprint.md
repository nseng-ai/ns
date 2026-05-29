# Blueprint: `objective gt stacks`

Authoritative, self-contained implementation plan. Downstream TDD agents read ONLY this file.
Authoritative spec: `/Users/schrockn/.slots/repos/asdl-tools/worktrees/slot-04/docs/specs/objective-gt-stacks.md`.

This is a read-only command that projects Objective-record work across a Graphite stack: it groups
Graphite-tracked branches by which Objective(s) their `parent..branch` slice touches, splits each
group into connected "segments," orders branches as a depth-indented tree, derives each Objective's
`open`/`closed`/`in-flight` status from the trunk ref, and reports the newest Objective-touching
commit per Objective.

**Design mandate:** small interface, deep module. ONE projection entry function. ONE projection
result dataclass tree. ONE thin wire-model mapper at the serialization boundary. Do NOT recreate the
deleted prototype's flat `gt_stack_models.py` / `gt_stack_projection.py` / `gt_stack_touches.py`
split, its dual model hierarchies, or its wide keyword-argument plumbing. Hold graph state in a small
internal context object built once, not threaded through 8 functions.

---

## 1. Final file layout

All paths absolute. Source under
`/Users/schrockn/.slots/repos/asdl-tools/worktrees/slot-04/packages/asdl-objectives/src/asdl_objectives/gt/`,
tests under `/Users/schrockn/.slots/repos/asdl-tools/worktrees/slot-04/packages/asdl-objectives/tests/`.

### Source files (`packages/asdl-objectives/src/asdl_objectives/gt/`)

| File            | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `__init__.py`   | Empty (docstring only). Per repo rule: no re-exports, no `__all__`.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `projection.py` | THE deep module. Holds the projection result dataclass tree (§2 here / spec §7.3.2), the single entry function `project_objective_stacks(gt, git, *, trunk_ref, cwd)`, and ALL algorithm internals (scope selection, touch extraction, grouping, segmentation, status, latest-work, ordering, warnings) as private module-level helpers + one small internal `_GraphContext`. No Click, no Pydantic, no rendering here. Depends only on `asdl_core.gt`, `asdl_core.git`, and `objective_paths`.                      |
| `models.py`     | Thin Clinkr wire layer. `ObjectiveGtStacksRequest` (empty request: only `--format`/`--json-schema` auto-injected) and the `ClinkrModel` result mirror `ObjectiveGtStacksResult` (+ nested `ObjectiveGtStackObjective`, `ObjectiveGtStackSegment`, `ObjectiveGtStackRow`, `ObjectiveGtLatestWork`). Plus `result_from_projection(projection) -> ObjectiveGtStacksResult` — the ONE serialization-boundary mapper (a structural copy; it does NOT recompute any field — e.g. `connector` is copied, never re-derived). |
| `context.py`    | `ObjectiveGtContext` frozen dataclass composing the Graphite-free base + a `GtGateway`; `build_objective_gt_context()` and `load_objective_gt_context(ctx)`. Mirrors `SlotGtContext`.                                                                                                                                                                                                                                                                                                                                |
| `stacks.py`     | The `@clinkr_operation(name="stacks", ...)` `run_stacks`. Loads context, matches gateway sum-type arms → `Ensure.fail(...)`, calls `project_objective_stacks(...)`, wraps in `result_from_projection` + `ClinkrExit.ok`. No graph massaging here (pushed into `projection.py`).                                                                                                                                                                                                                                      |
| `render.py`     | `render_stacks_human(result)` and `render_stacks_markdown(result)`. Pure presentation over `ObjectiveGtStacksResult`. Glyphs, indentation, annotations, status labels, relative-time.                                                                                                                                                                                                                                                                                                                                |
| `group.py`      | `build_gt_group() -> ClinkrGroup` mounting `run_stacks`.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Wiring edit (existing file, NOT new)

`packages/asdl-objectives/src/asdl_objectives/group.py`: add `outer.add_command(build_gt_group())`.

### Test files (`packages/asdl-objectives/tests/`)

| File                                                              | Purpose                                                                                                                                                                                                        |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/test_gt_projection.py`                                | All projection-core unit tests (roadmap items 1–8) over `FakeGtGateway` + `FakeGitGateway`. Capstone: full §10 `data` equality.                                                                                |
| `tests/unit/test_gt_render.py`                                    | Renderer unit tests (items 12–13) over a constructed `ObjectiveGtStacksResult`; assert exact markdown and structural human output (relative time asserted by shape, not exact duration).                       |
| `tests/scenario/test_gt_stacks_cli.py`                            | Scenario tests (items 9–11, 14) over `build_cli()` with injected `ObjectiveGtContext(base=..., gt=FakeGtGateway(...))`: `--help`, `--json-schema`, the §10 JSON envelope verbatim, every failure `error_type`. |
| `tests/scenario/test_plugins.py` (existing, top-level `asdl` pkg) | Out of scope for this objective unless a plugin smoke gap is found; the standalone `build_cli()` path is the test surface.                                                                                     |

There is intentionally NO separate `tests/unit/test_gt_touches.py` / `test_gt_segments.py` split —
the projection is one deep module, tested through its one public entry function.

---

## 2. Projection result dataclass tree (frozen dataclasses, `X | None` typing)

Lives in `projection.py`. Mirrors spec §7.3.2 EXACTLY (field names + types). These are plain frozen
dataclasses (NOT Pydantic) so the projection is pure and gateway-facing, testable without the CLI
layer. The Clinkr wire model in `models.py` is a structural mirror.

```python
from __future__ import annotations
from dataclasses import dataclass

@dataclass(frozen=True)
class ObjectiveStackRow:
    branch: str
    parent: str | None            # null ONLY for a segment root with no in-scope parent
    depth: int                    # segment root = 0; +1 per step toward children
    touches_objective: bool       # True iff this branch's slice touches THIS objective
    connector: bool               # EXACT inverse of touches_objective
    also_touches: tuple[str, ...] # other slugs this slice touches, sorted; () when none
    validation_result: str | None # Graphite validation result if known, else None
    needs_restack: bool

@dataclass(frozen=True)
class ObjectiveStackSegment:
    index: int                            # 1-based within the objective
    rows: tuple[ObjectiveStackRow, ...]   # parents before children (stack order)

@dataclass(frozen=True)
class ObjectiveStackLatestWork:
    branch: str
    committed_iso: str                    # ISO-8601 commit timestamp
    oid: str

@dataclass(frozen=True)
class ObjectiveStackGroup:
    slug: str
    status: str                                  # "open" | "closed" | "in-flight"
    objective_branch_count: int                  # distinct touching branches; connectors excluded
    segment_count: int
    latest_work: ObjectiveStackLatestWork | None # None when no objective-touching commit
    segments: tuple[ObjectiveStackSegment, ...]  # stable stack order

@dataclass(frozen=True)
class ObjectiveStackProjection:
    trunk_branch: str
    warnings: tuple[str, ...]                     # de-duplicated; () when none
    objectives: tuple[ObjectiveStackGroup, ...]   # alphabetical by slug; () when no branch work
```

### Single projection entry function signature

```python
def project_objective_stacks(
    gt: GtGateway,
    git: GitGateway,
    *,
    trunk_ref: str,
    cwd: Path,
) -> ObjectiveStackProjection | GtCommandFailure | GitCommandFailure:
    ...
```

- `gt: GtGateway` from `asdl_core.gt.gateway`; `git: GitGateway` from `asdl_core.git.git_gateway`.
- `trunk_ref` is the ref used for trunk status reads. Pass the trunk branch ref string the trunk
  status reads expect — for the fake-seeded scenario tests this is `refs/heads/<trunk>` (the
  `branch_ref` convention; see §5). The trunk _name_ (for `trunk_branch` in the result and for the
  scope walk) is taken from the `GtBranchGraph.trunk` returned by `gt.branch_graph(cwd)`.
- `cwd: Path` is passed to `gt.branch_graph(cwd)` (the only `GtGateway` call site).
- Return is a **sum type**. On a hard gateway-read failure the function returns the failure value
  (`GtCommandFailure` for the branch-graph read, `GitCommandFailure` for a slice/trunk-status read);
  the operation layer (§7) translates these to `Ensure.fail(...)`. Non-fatal anomalies are NOT
  returned as failures — they accumulate into `ObjectiveStackProjection.warnings`. There is NEVER a
  partial projection: any hard read failure aborts the whole computation.

> Why a sum-type return instead of raising: keeps `projection.py` free of Clinkr (`ClinkrFailure`)
> imports and lets unit tests assert the failure value directly. The operation layer owns the
> Clinkr translation. (If implementers prefer, raising `ClinkrFailure` from `projection.py` is
> permitted, but then `projection.py` gains a Clinkr dependency; the sum-type return is preferred for
> a clean deep module. Pick one and be consistent.)

---

## 3. Output format specifications

### 3.1 JSON `data` object schema (spec §7.3.2) — field-by-field

JSON exposes **semantic facts, not rendering** — there are NO glyphs anywhere in JSON. `status`
carries the bare word.

```
data
├─ trunk_branch        : string                     current Graphite trunk the projection roots on
├─ warnings            : string[]                    empty [] when none (never null, never omitted)
└─ objectives          : object[]                    alphabetical by slug; empty [] when no branch work
   ├─ slug                   : string
   ├─ status                 : string                "open" | "closed" | "in-flight" (no glyph)
   ├─ objective_branch_count : integer               distinct touching branches; connectors EXCLUDED
   ├─ segment_count          : integer
   ├─ latest_work            : object | null         null when no objective-touching commit
   │  ├─ branch              : string
   │  ├─ committed_iso       : string                ISO-8601, e.g. "2026-05-20T12:00:00Z"
   │  └─ oid                 : string
   └─ segments               : object[]              stable stack order
      ├─ index               : integer               1-based within the objective
      └─ rows                : object[]               parents before children (stack order)
         ├─ branch            : string
         ├─ parent            : string | null         null ONLY for a root with no in-scope parent
         ├─ depth             : integer               segment root = 0, +1 toward children
         ├─ touches_objective : boolean               true iff this slice touches THIS objective
         ├─ connector         : boolean               EXACT inverse of touches_objective
         ├─ also_touches      : string[]              other slugs this slice touches, sorted; [] when none
         ├─ validation_result : string | null         e.g. "OK", "VALID", or null
         └─ needs_restack     : boolean
```

Envelope (spec §7.3.1):

- **Success:** `{"exit_code": 0, "data": { ... }}`. No `error_type`, no `message`.
- **Failure:** `{"exit_code": 2, "error_type": "<stable id>", "message": "<detail>"}`. No `data`.
- `exit_code` is ALWAYS present and mirrors the process exit code.

> Note on `ClinkrExit.to_envelope_dict()` behavior (load-bearing): it emits `data` only when
> `self.data is not None`. The success result object is always non-None, so `data` is always present
> on success. `warnings: []` and `objectives: []` are emitted as empty arrays by Pydantic
> serialization of the tuple fields — they are NOT dropped.

### 3.2 Shared text vocabulary (spec §6) — human + markdown only, NEVER JSON

- Branch glyphs (§6.1): `◆` = Objective branch (`touches_objective`); `◇` = connector branch.
- Status labels (§6.2), used verbatim in both text formats: `○ open`, `✓ closed`, `◇ in-flight`.
  (The `◇` in `in-flight` is a status glyph in the group header, distinct from the connector glyph
  on a branch row — same character, different role.)
- Branch row annotation (§6.3): when present, follows the branch name with **two leading spaces**,
  form `(item; item; …)`, items separated by `;`. Items in order:
  1. Also-touches: `also: <slug>, <slug>` — other touched slugs, comma+space separated, alphabetical.
  2. Restack health — exactly one of:
     - `needs restack` — when Graphite reports the branch needs restacking (`needs_restack` true, or a
       validation result indicating it).
     - `gt: <result>` — for any OTHER non-trivial validation result.
     - (nothing) — when the branch is valid/trunk. Routine "valid"/"trunk"/"OK" states produce NO
       annotation. (In the §10 example, `validation_result="OK"` and `"VALID"` produce no `gt:`
       annotation; `needs_restack=true` produces `needs restack`.)
  - If no items apply, the row has no annotation.

**Restack-health decision rule (concrete):** emit `needs restack` if `needs_restack` is true.
Else if `validation_result` is one of the routine/healthy values `{None, "OK", "VALID", "TRUNK"}`,
emit nothing. Else emit `gt: <validation_result>`.

### 3.3 Human format (spec §7.1) — default

Skeleton:

```
Objective stacks
Graphite trunk: <trunk>

[Warnings:
  - <warning>
  - <warning>]

<status-label> <slug>  <N> objective branch[es]  <M> segment[s]  latest: <latest>

  segment 1
    <glyph> <branch>[<annotation>]
    ...

  segment 2
    ...

<status-label> <next slug>  ...
```

- Line 1: literal `Objective stacks`.
- Line 2: `Graphite trunk: <trunk>` — trunk name UNADORNED (no backticks).
- Warnings block appears ONLY when warnings exist. Header line literal `Warnings:`; each warning a
  bullet indented two spaces: `- <warning>`.
- Group header line, fields separated by **two spaces**:
  `<status-label> <slug>  <N> objective branch[es]  <M> segment[s]  latest: <latest>`
  - Pluralize: `1 objective branch` / `3 objective branches`; `1 segment` / `2 segments`.
- `latest:` forms (human): `feat/b (3h ago)` (branch + relative time in parens); branch-only when no
  relative time; `—` (em-dash U+2014) when no latest work.
- Each `segment <index>` header is PRECEDED BY A BLANK LINE and indented two spaces: `segment 1`.
- Branch rows: depth-0 row at 4-space lead (`◆ feat/a`); each additional depth level adds two
  spaces. Glyph then space then branch name then optional annotation. (See §6 worked example for the
  canonical indentation: depth 0 and depth 1 in the example both render at the 4-space base because
  the rule is "two spaces per depth level beneath the segment" applied to the segment's 2-space base
  — implementers MUST reproduce the §10.3 output verbatim; that is the grading instrument.)
- Empty state (no objective groups): single line `No Objective stack work found.`, rendered DIMMED
  (via `get_console()` `[dim]...[/dim]`).

### 3.4 Markdown format (spec §7.2) — `markdown` and `md` (identical output)

Skeleton:

````
# Objective stacks

Graphite trunk: `<trunk>`

[Warnings:
- <warning>]

## <status-label> <slug>

- objective branches: <N>
- segments: <M>
- latest: <latest>

```text
segment 1
<glyph> <branch>[<annotation>]
  <glyph> <branch>[<annotation>]

segment 2
<glyph> <branch>[<annotation>]
```
````

- Top heading: `# Objective stacks` (level-1).
- Trunk line: `` Graphite trunk: `<trunk>` `` — trunk name in backticks.
- Warnings block appears ONLY when warnings exist. Header line literal `Warnings:`; bullets `- <warning>`
  (markdown bullets, NOT indented).
- Per-Objective heading: `## <status-label> <slug>` (level-2, status label + slug),
  e.g. `## ○ open alpha`, `## ◇ in-flight beta`.
- Exactly three summary bullets, fixed labels, in order:
  ```
  - objective branches: <N>
  - segments: <M>
  - latest: <latest>
  ```
  (Labels are fixed `objective branches:` / `segments:`; NOT pluralized — only the number varies.)
- `latest:` forms (markdown): when present `` `<branch>` at `<iso>` (`<oid>`) `` — branch in backticks,
  literal `at`, ISO timestamp in backticks, then oid in backticks inside parens. When absent: `—`.
- Fenced segment block: opened `` ```text ``, closed `` ``` ``. First line is `segment <index>` flush
  at column 0 inside the fence. Branch rows indented **two spaces per depth level** — ONE LESS leading
  indent than human (depth 0 flush at column 0, depth 1 at 2 spaces, depth 2 at 4 spaces). A BLANK
  LINE separates consecutive segments within the same fence.
- Empty state: single line `No Objective stack work found.` (no dimming note for markdown).

---

## 4. Failure taxonomy

ALL failures exit code `2`, produce no projection (never partial). JSON → failure envelope (§3.1).
Text → message to stderr (human prefixes with `error:`). Each failure carries a stable
machine-readable `error_type`.

| `error_type`               | Trigger                                                                                                            | Exit | Message form                                                                               | Source                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------------------------------------------ | ---------------------------- |
| `not_in_repo`              | Context cannot be established (not in a repo / trunk unresolvable).                                                | 2    | `Not inside a git repository.` (verbatim spec example) or the unavailable-context message. | spec §8.1                    |
| `gt_branch_graph_failed`   | `gt.branch_graph(cwd)` returns `GtCommandFailure` (Graphite stack metadata unreadable).                            | 2    | `Graphite branch graph failed: <detail>` (`<detail>` = `GtCommandFailure.message`).        | spec §8.2                    |
| `gt_slice_read_failed`     | A per-branch slice read `git.path_touches_under("<parent>..<branch>", <active root>)` returns `GitCommandFailure`. | 2    | `Failed to read branch slice: <detail>` (`<detail>` = `GitCommandFailure.message`).        | spec §8.3 (data-read family) |
| `trunk_status_read_failed` | A trunk status read (`git.list_tracked_paths_at_ref(trunk_ref, <active root>)`) returns `GitCommandFailure`.       | 2    | `Failed to read trunk Objective status: <detail>`.                                         | spec §8.3 (data-read family) |

### Open-question resolution (spec §8.3 data-read error_type names)

Spec §8 pins only `not_in_repo` and `gt_branch_graph_failed` as literals and leaves the §8.3
data-read family unnamed (requiring only "equally stable identifiers"). **This blueprint settles the
two §8.3 identifiers as the stable enumeration:**

- **`gt_slice_read_failed`** — failure of a per-branch `parent..branch` slice read.
- **`trunk_status_read_failed`** — failure of the trunk Objective-status read.

These are the canonical, documented identifiers. Implementers MUST use these exact strings.

> Mapping note: `git.path_touches_under` / `git.list_tracked_paths_at_ref` return the asdl_core
> `GitCommandFailure` (which carries its own `error_type="git_failed"` default). The projection layer
> returns the `GitCommandFailure` value; the operation layer (§7) maps the slice-read failure to
> `gt_slice_read_failed` and the trunk-status-read failure to `trunk_status_read_failed`. The
> distinction is made by WHERE the failure surfaced (which read), not by the git failure's own
> `error_type`. To carry that distinction cleanly across the sum-type return, the projection function
> should wrap each `GitCommandFailure` so the operation knows which read failed — concretely, return
> the raw `GitCommandFailure` from the trunk-status read vs. slice read and have the projection
> compute trunk status BEFORE the slice loop (or vice-versa) so the operation can attribute by call
> order; OR (cleaner) define two tiny private sentinel wrappers in `projection.py`
> (`_SliceReadFailure(GitCommandFailure)` / `_TrunkStatusReadFailure(GitCommandFailure)`) — implementer's
> choice, but the externally observed `error_type` strings MUST be exactly the two above.

### Warnings (non-fatal; spec §9) — informative, NOT a parseable contract

Warnings surface conditions that perturbed the projection without preventing it. They appear in the
`warnings` array (JSON) and the `Warnings:` block (text). De-duplicated: identical messages appear at
most once. Wording is INFORMATIVE, not contract — consumers must not parse them. Canonical shapes:

1. **Skipped branch (broken local parent chain)** — a tracked, lineage-in-scope branch cannot connect
   to trunk through locally-present parents and is dropped:
   `Graphite branch '<branch>' has unavailable local parent '<parent>'; skipping.`
2. **Ancestor-walk anomalies** (objective still reported with whatever assembled):
   - `Objective '<slug>': branch '<branch>' has no Graphite parent; ancestor walk stopped.`
   - `Objective '<slug>': branch '<branch>' references missing Graphite parent '<parent>'; ancestor walk stopped.`
   - `Objective '<slug>': cycle detected at Graphite parent '<parent>'; ancestor walk stopped.`
3. **Stack-metadata inconsistencies (pass-through)** — surface `GtBranchGraph.warnings` entries
   directly into the same `warnings` list (no fixed string).

---

## 5. Exact seam method signatures + fake seeding

### 5.1 `GtGateway` (`asdl_core.gt.gateway`) — the ONE method used

```python
def branch_graph(self, cwd: Path) -> GtBranchGraph | GtCommandFailure
```

This is the ONLY `GtGateway` call. It returns the whole trunk-rooted graph. Do NOT use `stack()` /
`parent_of()` / `children_of()` (those are current-branch-centric; the full graph carries explicit
`parent`/`children` per node already).

Domain types (`asdl_core.gt.types`, all frozen dataclasses):

```python
@dataclass(frozen=True)
class GtTrackedBranch:
    name: str
    parent: str | None              # None for the trunk node
    children: tuple[str, ...]
    validation_result: str | None   # test convention: "TRUNK" for trunk; None otherwise
    needs_restack: bool = False

@dataclass(frozen=True)
class GtBranchGraph:
    trunk: str                       # trunk branch NAME; also appears as a node in branches
    branches: tuple[GtTrackedBranch, ...]   # includes the trunk node; names must be unique
    warnings: tuple[str, ...]        # graph-level warnings (pass through to projection.warnings)

@dataclass(frozen=True)
class GtCommandFailure:
    message: str
    returncode: int | None
```

Trunk node identification: the node whose `name == GtBranchGraph.trunk` (and `parent is None`). There
is no `is_trunk` boolean and no per-node warnings.

### 5.2 `GitGateway` (`asdl_core.git.git_gateway`) — methods used

```python
def path_touches_under(self, ref_or_range: str, path: str) -> tuple[PathChangeTouch, ...] | GitCommandFailure
    # commits newest-first touching paths under `path`; empty -> (); used for parent..branch slice reads
def list_tracked_paths_at_ref(self, ref: str, path: str) -> tuple[str, ...] | GitCommandFailure
    # tracked file paths under `path` at `ref`; missing -> (); used for trunk status read
def list_local_branches(self) -> tuple[str, ...]
    # local branch names; drives "present locally" scope predicate
def get_trunk_branch(self) -> str
    # bound repo trunk name (available via base context already)
```

`PathChangeTouch` (`asdl_core.git.types`):

```python
@dataclass(frozen=True)
class PathChangeTouch:
    oid: str
    committed_iso: str
    paths: tuple[str, ...]   # changed paths under the queried pathspec
```

NOTE: `PathChangeTouch` has NO change-kind field. Deletions/renames are NOT distinguishable here —
and they don't need to be: any commit appearing in the `parent..branch` slice whose `paths` include a
path under `.asdl/objectives/<slug>/` counts as a touch (additions, modifications, deletions, renames
all surface as a touched path). The active-root-deletion-counts requirement is satisfied for free.

```python
@dataclass(frozen=True)
class GitCommandFailure:
    message: str
    returncode: int | None
    error_type: str = "git_failed"
```

### 5.3 Active root + slug extraction (reuse, do NOT re-derive)

From `asdl_objectives.objective_paths` (already present):

- `ACTIVE_OBJECTIVE_ROOT = Path(".asdl") / "objectives"`; pass `ACTIVE_OBJECTIVE_ROOT.as_posix()` =
  `".asdl/objectives"` as the `path` to both git reads.
- `OBJECTIVE_ARCHIVE_ROOT = Path(".asdl") / "objective-archive"` — NEVER queried; archive is ignored.
- `objective_slug_from_active_path(path) -> str | None` — returns slug only when path is
  `.asdl/objectives/<slug>/<child>` with non-empty child and valid slug (not `""`/`.`/`..`, no
  separators). A bare `.asdl/objectives/<slug>` (no child) yields `None`. USE THIS to turn a
  `PathChangeTouch.paths` entry into a slug.
- For trunk status, reuse `objective_statuses_from_paths(paths)` from
  `asdl_objectives.list_branch_inventory` (returns `tuple[(slug, "open"|"closed"), ...]`; a slug is
  `closed` iff it has a `closed.md` child) and `branch_ref(branch) -> f"refs/heads/{branch}"`.

### 5.4 `FakeGtGateway` seeding (`asdl_core.gt.testing`) — constructor-only, keyword-only

Seed the full graph via `branch_graph=<GtBranchGraph | GtCommandFailure>` (returned for any cwd) or
`branch_graph_by_cwd={cwd: <result>}` (per-cwd, takes precedence). With neither seeded, returns a
default trunk-only graph from the `trunk` kwarg (default `"main"`). Records calls on
`branch_graph_calls`.

```python
gt = FakeGtGateway(branch_graph=GtBranchGraph(
    trunk="main",
    branches=(
        GtTrackedBranch(name="main", parent=None, children=("feat/a","feat/b"), validation_result="TRUNK"),
        GtTrackedBranch(name="feat/a", parent="main", children=("feat/connector",), validation_result="OK"),
        GtTrackedBranch(name="feat/connector", parent="feat/a", children=("feat/c",), validation_result="VALID", needs_restack=True),
        GtTrackedBranch(name="feat/c", parent="feat/connector", children=(), validation_result=None),
        GtTrackedBranch(name="feat/b", parent="main", children=(), validation_result=None),
    ),
    warnings=(),
))
# Failure: FakeGtGateway(branch_graph=GtCommandFailure(message="metadata missing", returncode=None))
```

`GtBranchGraph.branches` must have unique names (else `__post_init__` raises).

### 5.5 `FakeGitGateway` seeding (`asdl_core.git.testing`) — constructor-only, keyword-only

Relevant kwargs:

- `branches: Iterable[str]` — drives `list_local_branches()` (returns `tuple(sorted(...))`) and
  `branch_exists`. This is the "present locally" set for scope selection.
- `path_change_touches_by_ref_path: dict[(ref_or_range, path), tuple[PathChangeTouch,...] | GitCommandFailure]`
  — seeds `path_touches_under`. Key uses the EXACT range string and path you query, e.g.
  `("main..feat/a", ".asdl/objectives")`. Unseeded keys fall back to synthesis from
  `path_touch_by_ref_path` — to get a strict empty `()` for an unseeded branch slice, leave
  `path_touch_by_ref_path`/`file_last_touched_by_ref_path` empty for that ref.
- `tracked_paths_by_ref_path: dict[(ref, path), tuple[str,...] | GitCommandFailure]` — seeds
  `list_tracked_paths_at_ref` for the trunk status read, e.g.
  `("refs/heads/main", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",)`. Default `()`.
- `repo_root: Path | None` (default `Path("/repo")`), `trunk_branch: str = "main"`.

```python
git = FakeGitGateway(
    repo_root=Path("/repo"),
    branches=("main","feat/a","feat/connector","feat/c","feat/b"),
    trunk_branch="main",
    path_change_touches_by_ref_path={
        ("main..feat/a", ".asdl/objectives"): (
            PathChangeTouch(oid="a-multi", committed_iso="2026-05-20T10:00:00Z",
                            paths=(".asdl/objectives/alpha/o.md", ".asdl/objectives/beta/o.md")),),
        ("feat/connector..feat/c", ".asdl/objectives"): (
            PathChangeTouch(oid="c-alpha", committed_iso="2026-05-20T11:00:00Z",
                            paths=(".asdl/objectives/alpha/o.md",)),),
        ("main..feat/b", ".asdl/objectives"): (
            PathChangeTouch(oid="b-alpha", committed_iso="2026-05-20T12:00:00Z",
                            paths=(".asdl/objectives/alpha/o.md",)),),
        # feat/connector slice intentionally unseeded -> () -> touches nothing
    },
    tracked_paths_by_ref_path={
        ("refs/heads/main", ".asdl/objectives"): (".asdl/objectives/alpha/objective.md",),
        # no beta on trunk -> beta is in-flight
    },
)
```

**Slice range string:** for a non-trunk branch `B` with Graphite parent `P`, the slice query is
`git.path_touches_under(f"{P}..{B}", ".asdl/objectives")`. Use plain branch names (`main..feat/a`),
NOT refs, for the slice range — matching the seed keys above and the spec's `parent..branch` slice.
**Trunk status read** uses a REF (`refs/heads/<trunk>`) via `branch_ref`, NOT a range.

---

## 6. Worked example (spec §10) — capstone grading instrument

### 6.1 Input fixtures

Current trunk: `main`. Tracked, locally-present branch graph:

```
main
├─ feat/a          (slice touches alpha and beta)
│   └─ feat/connector   (slice touches nothing; Graphite reports needs-restack)
│       └─ feat/c       (slice touches alpha)
└─ feat/b          (slice touches alpha)
```

On `main`, an active record exists for `alpha` (open, no closed marker). No record for `beta` on `main`.
Latest Objective-touching commit timestamps: `feat/a` touches alpha+beta at `10:00`; `feat/c` touches
alpha at `11:00`; `feat/b` touches alpha at `12:00`.

**`FakeGtGateway` seed** (exact): the `branch_graph` from §5.4 above (validation_result: `feat/a`=`OK`,
`feat/connector`=`VALID` + `needs_restack=True`, `feat/c`=`None`, `feat/b`=`None`, trunk=`TRUNK`).

**`FakeGitGateway` seed** (exact): the `git` from §5.5 above. `committed_iso` values use the `Z` suffix
and map to: `feat/a` → `2026-05-20T10:00:00Z` oid `a-multi`; `feat/c` → `2026-05-20T11:00:00Z` oid
`c-alpha`; `feat/b` → `2026-05-20T12:00:00Z` oid `b-alpha`. `feat/connector` slice unseeded (touches
nothing). Trunk tracked paths: `(".asdl/objectives/alpha/objective.md",)`.

Call: `project_objective_stacks(gt, git, trunk_ref="refs/heads/main", cwd=Path("/repo"))`.

### 6.2 Expected JSON (verbatim)

```json
{
  "exit_code": 0,
  "data": {
    "trunk_branch": "main",
    "warnings": [],
    "objectives": [
      {
        "slug": "alpha",
        "status": "open",
        "objective_branch_count": 3,
        "segment_count": 2,
        "latest_work": { "branch": "feat/b", "committed_iso": "2026-05-20T12:00:00Z", "oid": "b-alpha" },
        "segments": [
          {
            "index": 1,
            "rows": [
              { "branch": "feat/a",         "parent": "main",           "depth": 0, "touches_objective": true,  "connector": false, "also_touches": ["beta"], "validation_result": "OK",    "needs_restack": false },
              { "branch": "feat/connector", "parent": "feat/a",         "depth": 1, "touches_objective": false, "connector": true,  "also_touches": [],       "validation_result": "VALID", "needs_restack": true  },
              { "branch": "feat/c",         "parent": "feat/connector", "depth": 2, "touches_objective": true,  "connector": false, "also_touches": [],       "validation_result": null,    "needs_restack": false }
            ]
          },
          {
            "index": 2,
            "rows": [
              { "branch": "feat/b", "parent": "main", "depth": 0, "touches_objective": true, "connector": false, "also_touches": [], "validation_result": null, "needs_restack": false }
            ]
          }
        ]
      },
      {
        "slug": "beta",
        "status": "in-flight",
        "objective_branch_count": 1,
        "segment_count": 1,
        "latest_work": { "branch": "feat/a", "committed_iso": "2026-05-20T10:00:00Z", "oid": "a-multi" },
        "segments": [
          {
            "index": 1,
            "rows": [
              { "branch": "feat/a", "parent": "main", "depth": 0, "touches_objective": true, "connector": false, "also_touches": ["alpha"], "validation_result": "OK", "needs_restack": false }
            ]
          }
        ]
      }
    ]
  }
}
```

Invariants this locks: `alpha` has TWO segments (`feat/a→feat/connector→feat/c` connected;
`feat/b` separate child of trunk); `feat/connector` is a connector in `alpha` seg 1 (`◇`,
`touches_objective: false`) but EXCLUDED from `objective_branch_count` (which is 3: a, c, b);
`feat/connector` does NOT appear under `beta` (beta's only objective branch is `feat/a`, needs no
connector); `alpha` latest work is `feat/b` (newest 12:00), NOT deepest `feat/c` (11:00); `beta` is
`in-flight` (branch work, no trunk record).

### 6.3 Expected human output (verbatim)

```
Objective stacks
Graphite trunk: main

○ open alpha  3 objective branches  2 segments  latest: feat/b (7d ago)

  segment 1
    ◆ feat/a  (also: beta)
    ◇ feat/connector  (needs restack)
      ◆ feat/c

  segment 2
    ◆ feat/b

◇ in-flight beta  1 objective branch  1 segment  latest: feat/a (7d ago)

  segment 1
    ◆ feat/a  (also: alpha)
```

(The `(7d ago)` relative time depends on "now"; renderer tests assert relative-time by SHAPE —
`<branch> (<something> ago)` — not the exact duration. Structure, glyphs, indentation, annotations,
counts, and status labels are asserted exactly.)

### 6.4 Expected markdown output (verbatim)

````
# Objective stacks

Graphite trunk: `main`

## ○ open alpha

- objective branches: 3
- segments: 2
- latest: `feat/b` at `2026-05-20T12:00:00Z` (`b-alpha`)

```text
segment 1
◆ feat/a  (also: beta)
  ◇ feat/connector  (needs restack)
    ◆ feat/c

segment 2
◆ feat/b
```

## ◇ in-flight beta

- objective branches: 1
- segments: 1
- latest: `feat/a` at `2026-05-20T10:00:00Z` (`a-multi`)

```text
segment 1
◆ feat/a  (also: alpha)
```
````

Markdown asserts EXACTLY (no relative-time ambiguity — markdown uses the raw ISO timestamp + oid).

---

## 7. CLI / context / Clinkr wiring plan

### 7.1 Dedicated `gt` context — `gt/context.py` (mirrors `SlotGtContext`)

Keeps `ObjectiveCliContext` Graphite-free (it has only `repo_root`, `trunk_branch`, `git: GitGateway`
— NO `GtGateway`). The Graphite dependency lives ONLY in this dedicated context, satisfying the
runtime Graphite-boundary rule (the `gt` command path + help name Graphite).

```python
@dataclass(frozen=True)
class ObjectiveGtContext:
    base: ObjectiveCliContext      # composes the Graphite-free base (repo_root, trunk_branch, git)
    gt: GtGateway

def build_objective_gt_context() -> ObjectiveGtContext | ObjectiveCliUnavailable:
    base = build_objective_context()
    if isinstance(base, ObjectiveCliUnavailable):
        return base
    return ObjectiveGtContext(base=base, gt=RealGtGateway())   # RealGtGateway() takes NO args

def load_objective_gt_context(ctx) -> ObjectiveGtContext | ObjectiveCliUnavailable:
    result = load_clinkr_context_object(ctx).context_factory()
    match result:
        case ObjectiveCliUnavailable() as unavailable: return unavailable
        case ObjectiveGtContext() as gt_ctx:           return gt_ctx
        case ObjectiveCliContext() as base:            return ObjectiveGtContext(base=base, gt=RealGtGateway())
        case _: raise RuntimeError(f"context_factory returned {type(result).__name__}, expected ObjectiveGtContext, ObjectiveCliContext, or ObjectiveCliUnavailable.")
```

The lazy-wrap arm (accepting a base `ObjectiveCliContext` and wrapping in `RealGtGateway()`) lets the
standalone CLI keep installing only the base `build_objective_context` factory while `gt stacks` still
gets a `GtGateway`. Scenario tests inject a prebuilt `ObjectiveGtContext` directly.

### 7.2 Group + operation wiring

`gt/group.py`:

```python
def build_gt_group() -> ClinkrGroup:
    return ClinkrGroup(
        name="gt",
        help="Work with Graphite Objective stack projections",   # VISIBLE group (no hidden=True)
        operations=[run_stacks],
    )
```

`group.py` (existing): `outer.add_command(build_gt_group())` after the exec mount.

`gt/models.py` request (empty — `--format`/`--json-schema` auto-injected by ClinkrGroup; NO positional
args):

```python
class ObjectiveGtStacksRequest(ClinkrModel):
    pass
```

`gt/stacks.py`:

```python
@clinkr_operation(
    name="stacks",
    help="Show Objective work across Graphite-tracked branches",
    human_renderer=render_stacks_human,
    markdown_renderer=render_stacks_markdown,
)
def run_stacks(ctx: click.Context, request: ObjectiveGtStacksRequest) -> ClinkrExit[ObjectiveGtStacksResult]:
    gt_ctx = load_objective_gt_context(ctx)
    if isinstance(gt_ctx, ObjectiveCliUnavailable):
        Ensure.fail(error_type="not_in_repo", message=gt_ctx.message)
    base = gt_ctx.base
    projection = project_objective_stacks(
        gt_ctx.gt, base.git,
        trunk_ref=branch_ref(base.trunk_branch),   # refs/heads/<trunk>
        cwd=base.repo_root,
    )
    match projection:
        case GtCommandFailure() as f:
            Ensure.fail(error_type="gt_branch_graph_failed", message=f"Graphite branch graph failed: {f.message}")
        case _TrunkStatusReadFailure() as f:
            Ensure.fail(error_type="trunk_status_read_failed", message=f"Failed to read trunk Objective status: {f.message}")
        case _SliceReadFailure() as f:
            Ensure.fail(error_type="gt_slice_read_failed", message=f"Failed to read branch slice: {f.message}")
        case ObjectiveStackProjection() as p:
            return ClinkrExit.ok(result_from_projection(p))
```

(The two `_*ReadFailure` wrappers are the §4 mechanism for attributing a `GitCommandFailure` to the
slice vs trunk read; if implementers instead return raw `GitCommandFailure` distinguished by call
order, adjust the match accordingly — the externally observed `error_type` strings are fixed.)

Auto-injected by `ClinkrGroup._register_operation`:

- `--format` = `click.Choice(["human","json","markdown","md"])`, default `human` (NOT injected if the
  request declares it — ours does not).
- `--json-schema` = eager flag, prints `build_json_schema_document(request_type=ObjectiveGtStacksRequest,
  result_type=ObjectiveGtStacksResult)` (input+output schema) and `ctx.exit(0)`. Takes precedence.
- `-h`/`--help` via `build_standalone_cli` (`help_option_names=["-h","--help"]`).

Dispatch (from `clinkr/group.py`): json → `emit_machine_envelope` (prints `to_envelope_dict`,
SystemExit on non-zero); human/md → renderer; FAILURE → `click.echo(f"error: {message}", err=True)`,
`ctx.exit(2)`.

### 7.3 Wire models — `gt/models.py`

`ClinkrModel` (Pydantic, frozen, extra=forbid) mirror of the §2 dataclass tree. ONE mapper
`result_from_projection` does a structural field-by-field copy (it does NOT recompute `connector` or
any other field — that is the deleted prototype's anti-pattern):

```python
class ObjectiveGtStackRow(ClinkrModel):
    branch: str; parent: str | None; depth: int
    touches_objective: bool; connector: bool
    also_touches: tuple[str, ...]
    validation_result: str | None; needs_restack: bool
class ObjectiveGtStackSegment(ClinkrModel):
    index: int; rows: tuple[ObjectiveGtStackRow, ...]
class ObjectiveGtLatestWork(ClinkrModel):
    branch: str; committed_iso: str; oid: str
class ObjectiveGtStackObjective(ClinkrModel):
    slug: str; status: str; objective_branch_count: int; segment_count: int
    latest_work: ObjectiveGtLatestWork | None
    segments: tuple[ObjectiveGtStackSegment, ...]
class ObjectiveGtStacksResult(ClinkrModel):
    trunk_branch: str; warnings: tuple[str, ...]
    objectives: tuple[ObjectiveGtStackObjective, ...]
```

### 7.4 Scenario-test fake injection

`build_cli()` from `asdl_objectives.main` (NOT `discover_group`). Inject a prebuilt context via
`obj=build_clinkr_context_object(lambda: ctx)`:

```python
@pytest.fixture(scope="module")
def cli_group() -> ClinkrGroup:
    return build_cli()

def _ctx(*, gt, git, repo_root=Path("/repo"), trunk_branch="main") -> ObjectiveGtContext:
    return ObjectiveGtContext(
        base=ObjectiveCliContext(repo_root=repo_root, trunk_branch=trunk_branch, git=git),
        gt=gt,
    )

result = CliRunner().invoke(cli_group, ["gt", "stacks", "--format", "json"],
                            obj=build_clinkr_context_object(lambda: _ctx(gt=fake_gt, git=fake_git)))
# parse result.output as JSON, compare to the §6.2 envelope
```

For `not_in_repo`, inject `ObjectiveCliUnavailable("Not inside a git repository.")` as the context.

---

## 8. Ordered TDD slice plan (14 items, mirrors roadmap)

Items 1–8 = projection core (unit tests over `FakeGtGateway`/`FakeGitGateway`, file
`tests/unit/test_gt_projection.py`, source `gt/projection.py`). Items 9–14 = adapters (scenario tests
over `build_cli()`, file `tests/scenario/test_gt_stacks_cli.py`; renderers in
`tests/unit/test_gt_render.py`). Write the first failing test, implement minimally, refactor toward
locality. See `slices` in the structured output for the per-slice machine-readable detail.

1. **P1 — Projection skeleton + empty case (§5, §7.3.2).** First failing test: trunk-only branch graph
   (default `FakeGtGateway(trunk="main")`) + empty `FakeGitGateway` → `project_objective_stacks(...)`
   returns `ObjectiveStackProjection(trunk_branch="main", warnings=(), objectives=())`. Defines the §2
   dataclass tree + entry signature. Seam: `gt.branch_graph(cwd)`. Files: `gt/projection.py`,
   `tests/unit/test_gt_projection.py`.
2. **P2 — Branch scope selection (§5.1).** First failing test: a graph with a tracked branch whose
   parent is NOT in `git.list_local_branches()` → that branch and its descendants are dropped and a
   `Graphite branch '<branch>' has unavailable local parent '<parent>'; skipping.` warning is emitted;
   trunk always anchors; untracked-locally branches excluded. Seam: `gt.branch_graph`,
   `git.list_local_branches`. Files: `gt/projection.py`, test.
3. **P3 — Per-branch touches (§5.2).** First failing test: branch `feat/a` slice
   `path_touches_under("main..feat/a", ".asdl/objectives")` returns touches for `alpha` and `beta` →
   branch records both slugs with the latest (oid, committed_iso) per slug; archive-root paths and
   bare-dir paths do NOT register; deletions (a touched path with no kind field) register. Seam:
   `git.path_touches_under`; helper `objective_slug_from_active_path`. Files: `gt/projection.py`, test.
4. **P4 — Grouping by Objective + also_touches (§5.3).** First failing test: `feat/a` touching
   `alpha`+`beta` → appears under BOTH groups; under `alpha` its `also_touches == ("beta",)`, under
   `beta` `("alpha",)` (own slug excluded, sorted); only touched slugs appear. Files:
   `gt/projection.py`, test.
5. **P5 — Segments + connectors (§5.4, §5.6).** First failing test: the §10 `alpha` shape →
   `feat/a→feat/connector→feat/c` is ONE segment with `feat/connector` marked
   `connector=true`/`touches_objective=false`; `feat/b` is a SEPARATE segment;
   `objective_branch_count == 3` (connector excluded); `segment_count == 2`. Files: `gt/projection.py`,
   test.
6. **P6 — Projected status (§5.5).** First failing test: trunk `list_tracked_paths_at_ref` returns
   `alpha/objective.md` (no `closed.md`) → `alpha` status `open`; with `alpha/closed.md` → `closed`;
   `beta` (touched by a branch, absent on trunk) → `in-flight`. Seam: `git.list_tracked_paths_at_ref`;
   helper `objective_statuses_from_paths`. Files: `gt/projection.py`, test.
7. **P7 — Latest work (§5.7).** First failing test: across `alpha` branches (`feat/a`@10:00,
   `feat/c`@11:00, `feat/b`@12:00) latest is `feat/b` (newest), NOT deepest `feat/c`; tie-break
   timestamp→branch→oid; uninterpretable timestamp sorts oldest; `None` when no touching commit.
   Files: `gt/projection.py`, test.
8. **P8 — Ordering, determinism, warnings + §10 capstone (§5.8, §9).** First failing test: full §6.1
   fixtures → `project_objective_stacks(...)` equals the §6.2 `data` object exactly (groups
   alphabetical, rows stack-ordered with depth 0/1/2, sorted also_touches, de-duped warnings).
   Includes ancestor-walk-anomaly (§9.2) and graph-warnings pass-through (§9.3) cases. Files:
   `gt/projection.py`, test.
9. **A9 — gt context + group + stacks skeleton.** First failing scenario test:
   `objective gt stacks --help` shows `Usage: objective gt stacks`, the description,
   `--format`, `--json-schema`. Build `gt/context.py`, `gt/group.py`, `gt/models.py` (request +
   minimal result), `gt/stacks.py`; mount in `group.py`. Seam: `gt.branch_graph` (via projection).
   Files: `gt/context.py`, `gt/group.py`, `gt/models.py`, `gt/stacks.py`, `group.py`, scenario test.
10. **A10 — JSON envelope + `--json-schema` (§7.3).** First failing scenario test: §10 fakes injected,
    `objective gt stacks --format json` → `result.output` parses to the §6.2 envelope verbatim; and
    `--json-schema` prints a doc with `input_json_schema`+`output_json_schema` and exits 0. Completes
    `models.py` + `result_from_projection`. Files: `gt/models.py`, `gt/stacks.py`, scenario test.
11. **A11 — Failure taxonomy (§8).** First failing scenario test: inject
    `ObjectiveCliUnavailable("Not inside a git repository.")` → JSON
    `{exit_code:2, error_type:"not_in_repo", message:"Not inside a git repository."}`; inject
    `FakeGtGateway(branch_graph=GtCommandFailure(...))` → `gt_branch_graph_failed` with
    `Graphite branch graph failed: <detail>`; seed a slice-read `GitCommandFailure` →
    `gt_slice_read_failed`; seed a trunk-status `GitCommandFailure` → `trunk_status_read_failed`. Each
    exit 2, no `data`; human stderr `error: <message>`. Files: `gt/stacks.py`, `gt/projection.py`,
    scenario test.
12. **A12 — Human renderer (§7.1, §6).** First failing renderer unit test: render the §6.1 projection
    → matches §6.3 structure (header, unadorned trunk, status labels, pluralized counts,
    `latest: <branch> (<rel> ago)` by shape, blank-line-preceded `segment N`, two-space-per-depth
    `◆`/`◇` rows, `(also: …)` / `(needs restack)` annotations); empty projection → dimmed
    `No Objective stack work found.`. Files: `gt/render.py`, `tests/unit/test_gt_render.py`.
13. **A13 — Markdown renderer (§7.2, §6).** First failing renderer unit test: render the §6.1
    projection → matches §6.4 EXACTLY (`# Objective stacks`, backticked trunk, `##` status+slug, three
    bullets, fenced `text` blocks with one-less indent + blank-line separators, `latest` as
    `` `<branch>` at `<iso>` (`<oid>`) `` / `—`, empty-state line). Files: `gt/render.py`, test.
14. **A14 — Conformance pass.** First failing test: a `--format md` scenario test asserting `md` ==
    `markdown` output, plus a checklist sweep verifying `objective list` and `ObjectiveCliContext`
    remain Graphite-free (no `asdl_core.gt` import in `context.py`). Grade against §13 (every CLI
    bullet). Run `just check` to green. Files: scenario test, `group.py` (verify mount), conformance
    assertions.

---

## 9. Seam-sufficiency verdict + subtle-semantics risks

### Seam-sufficiency: SUFFICIENT — zero `asdl_core` changes required

- Full trunk-scoped graph with explicit per-node `parent`/`children`/`validation_result`/`needs_restack`
  and graph-level `warnings`: `GtGateway.branch_graph(cwd)` → `GtBranchGraph`. ✓
- "Present locally" set: `GitGateway.list_local_branches()`. ✓
- Per-branch `parent..branch` slice touches (additions/mods/deletions/renames all surface as touched
  paths; newest-first): `GitGateway.path_touches_under(range, ".asdl/objectives")` → `PathChangeTouch`
  (carries `oid` + `committed_iso` + `paths`). ✓
- Trunk status (active record presence + `closed.md` marker): `GitGateway.list_tracked_paths_at_ref(
  "refs/heads/<trunk>", ".asdl/objectives")` + reused `objective_statuses_from_paths`. ✓
- Slug extraction / archive exclusion: reused `objective_slug_from_active_path` / `ACTIVE_OBJECTIVE_ROOT`
  / `OBJECTIVE_ARCHIVE_ROOT`. ✓
- Failure values for every read: `GtCommandFailure` / `GitCommandFailure`. ✓
- Both fakes are constructor-seeded with exactly the kwargs needed (`branch_graph`/`branch_graph_by_cwd`;
  `branches`/`path_change_touches_by_ref_path`/`tracked_paths_by_ref_path`). ✓

No proven gap. Do NOT extend `asdl_core` (matches the roadmap's "Parked: any asdl_core seam extension
— only if a proven gap appears" contingency). If a gap is later proven during slice work, that is a
graduation-style change escalated separately, not part of this objective.

### Top subtle-semantics risks (watch these)

1. **Slice base is the Graphite PARENT, never the trunk.** Query `parent..branch`, not `trunk..branch`.
   Using trunk would credit a branch with inherited ancestor work. (§5.2)
2. **Segments = connected components, not the whole include-set.** `feat/a→connector→feat/c` is ONE
   segment; a disjoint trunk child `feat/b` is its OWN segment. Run component analysis over the
   include-set (touching branches + their non-trunk ancestor chains), partitioned by parent/child links.
   (§5.4)
3. **Connector = `not touches_objective`, exact inverse — copy, never recompute downstream.** A
   connector is pulled into a group ONLY when it lies on the path between that group's objective
   branches (or between one and trunk). `feat/connector` appears under `alpha` but NOT under `beta`.
   Connectors are EXCLUDED from `objective_branch_count` and from latest-work. (§5.4, §5.6)
4. **Depth and stack order.** Segment root (parent outside the segment) is depth 0; +1 per step toward
   children; rows emitted parents-before-children (pre-order DFS). `parent` is `null` ONLY for a root
   with no in-scope parent. (§5.8)
5. **Latest work is TIMESTAMP-driven, not depth-driven; tie-break is timestamp → branch name → oid;
   uninterpretable timestamps sort as the OLDEST.** Latest uses the objective-touch COMMIT timestamp
   (within the slice), not branch HEAD time. `alpha` latest is `feat/b`@12:00, not deepest
   `feat/c`@11:00. (§5.7) Normalize ISO (`Z`→`+00:00`, naive assumed UTC, compare in UTC).
6. **Status reads the TRUNK ref, NOT the checkout.** `open`/`closed`/`in-flight` derive from
   `refs/heads/<trunk>` state. `closed.md` child ⇒ closed; absent on trunk but branch-touched ⇒
   `in-flight`. NO pending-transition interpretation (a branch adding `closed.md` does NOT make the
   group "closing"). (§5.5)
7. **No partial projection on failure.** Any `GtCommandFailure`/`GitCommandFailure` from any read
   aborts the WHOLE projection with exit 2 and the right `error_type`. Non-fatal anomalies
   (skipped-branch, ancestor-walk, graph warnings) accumulate into `warnings` and never abort. (§8, §9)
8. **Archive root is invisible.** Never query `.asdl/objective-archive/`; archive paths never create
   membership, never count toward latest work, never appear in `also_touches`. Bare `.asdl/objectives/S`
   (no child file) does NOT count as a touch. (§5.2)
9. **Warnings de-duplicated.** The same missing-parent hit from multiple branches yields ONE warning
   line. Gate the warnings list by a seen-set. (§5.8, §9)
10. **`also_touches` sorted, own slug excluded, `[]` when none. `warnings`/`objectives` `[]` when none**
    (empty arrays, never null/omitted). (§5.3, §7.3.2)
11. **Restack-health annotation routing:** `needs restack` when `needs_restack`; nothing for routine
    `{None,"OK","VALID","TRUNK"}`; else `gt: <result>`. JSON carries `validation_result`/`needs_restack`
    raw — the glyph/annotation logic is renderer-only. (§6.3)
12. **Glyphs NEVER in JSON.** `status` is the bare word; presentation is derived by consumers from
    `touches_objective`/`connector`/`also_touches`/`validation_result`/`needs_restack`. (§7.3.2)
