# Specification: `objective gt stacks` and the `/objective-gt-stacks` display command

Status: Specification (distilled from a working prototype)
Scope: the `objective gt stacks` command and its companion Pi display command `/objective-gt-stacks`.

This document specifies observable behavior only. It defines _what_ the feature does, not _how_ it is built. It is the authoritative contract that a production implementation must satisfy. Nothing here should be read as prescribing internal structure, storage, languages, or libraries.

---

## 1. Purpose and audience

### 1.1 What this is for

`objective gt stacks` answers one question for a developer working on multiple stacked branches:

> "Across all my Graphite-tracked branches, which ones are doing work on which Objectives, and how is that work shaped?"

It is read-only. It inspects branches and their relationships and reports a projection. It never creates, edits, moves, or deletes branches, commits, or Objective records.

### 1.2 The two-world model it belongs to

The Objective tooling distinguishes two distinct worlds:

1. **Objective records in the current checkout** — directories that physically exist in the working tree. These are reported by `objective list`. Commands that move or edit records (e.g. archiving) operate here.
2. **Objective work distributed across branches** — branch-local changes, spread across a Graphite stack, that modify Objective records. This is a _projection_, not an inventory, and is reported by `objective gt stacks`.

This specification covers only the second world (`objective gt stacks`) and the Pi command that displays it. `objective list` is referenced only as context; its contract is specified elsewhere.

A status that exists **only** in this world is `in-flight`: an Objective that some branch is working on but that does not yet exist as a record on the trunk. `in-flight` is never reported by `objective list`; it is meaningful only in the stack projection.

---

## 2. Domain concepts and terminology

These terms are used precisely throughout this document.

- **Objective** — a unit of tracked work. Identified by a **slug**.
- **Objective record** — the directory of files for an Objective. Active records live under the **active root** `.asdl/objectives/<slug>/`. Retired records live under the **archive root** `.asdl/objective-archive/<slug>/`.
- **Slug** — the directory name immediately under a root. A path contributes to slug `S` only if it is `*.asdl/objectives/S/<something>` — i.e. it addresses a file **inside** the record directory. A slug is invalid (and ignored) if it is empty, `.`, `..`, or contains a path separator. A bare `.asdl/objectives/S` with no child path does not count as touching `S`.
- **Closed marker** — the file `closed.md` directly inside a record directory (`.asdl/objectives/<slug>/closed.md`). Its presence means the Objective is closed.
- **Trunk** — the single configured Graphite trunk branch (e.g. `main` or `master`). All stack analysis is rooted here.
- **Tracked branch** — a branch that Graphite records as part of a stack under the trunk, with a known parent and children.
- **Parent / child** — the stack relationship recorded by Graphite. Each tracked branch (other than trunk) has exactly one parent.
- **Slice** — the commits unique to a branch relative to its parent: the range `parent..branch`. A branch's slice is _only_ the work added on that branch, not work inherited from lower in the stack.
- **Touch** — a branch **touches** Objective `S` if any commit in its slice changes any path inside `.asdl/objectives/S/`. "Changes" includes additions, modifications, **deletions**, and renames.
- **Objective branch** — a branch whose slice touches the Objective in question.
- **Connector branch** — a branch included in a segment only to preserve the stack's shape between Objective branches; its own slice does not touch that Objective.
- **Segment** — one connected region of branches working on a single Objective. An Objective may have several segments if its work is spread across disconnected parts of the stack.
- **Latest work** — the most recent Objective-touching commit for an Objective, identified by commit timestamp.
- **Projected status** — the Objective's status as projected onto the trunk: `open`, `closed`, or `in-flight` (see §5.5).

---

## 3. Preconditions and environment

`objective gt stacks` requires:

1. **A repository context.** The command must run inside a repository where the Objective tooling can establish its working context. If it cannot (e.g. not inside a repository), the command fails with the environment error in §8.1.
2. **Readable Graphite stack metadata for the current trunk.** The command derives stack structure from Graphite's recorded stack relationships. It MUST NOT depend on parsing human-readable `gt` command output. If stack metadata cannot be read, the command fails with the metadata error in §8.2.

Explicit non-requirements:

- **The current branch need not be Graphite-tracked.** As long as stack metadata for the trunk is readable, the command works regardless of which branch is checked out (including a detached or untracked branch).
- **No network access is required.** The projection is computed from local repository and stack state.

---

## 4. Command surface

### 4.1 Synopsis

```
objective gt stacks [--format human|json|markdown|md] [--json-schema] [--help]
```

The command takes **no positional arguments**.

It lives under an explicit `objective gt` command group. The `gt` segment in the path is deliberate: the command is Graphite-specific by contract, and its name advertises that dependency. The group's help reads "Work with Graphite Objective stack projections." The command's help reads "Show Objective work across Graphite-tracked branches."

### 4.2 Options

| Option          | Values                            | Default | Behavior                                                                                                                              |
| --------------- | --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `--format`      | `human`, `json`, `markdown`, `md` | `human` | Selects output rendering. `md` is an alias for `markdown`. See §6, §7.                                                                |
| `--json-schema` | (flag)                            | —       | Prints a JSON Schema document describing the command's input and output shapes, then exits 0. Takes precedence over normal execution. |
| `--help`        | (flag)                            | —       | Prints usage and exits 0.                                                                                                             |

`--help` output MUST include the usage line `Usage: objective gt stacks`, the command description, and the `--format` and `--json-schema` options.

---

## 5. Behavior and semantics

This section defines the projection. The order of subsections mirrors the conceptual pipeline; an implementation need not follow this order internally.

### 5.1 Branch scope selection

The command considers branches under the **current trunk only**. It MUST NOT scan other configured trunks.

A branch is in scope when **all** of the following hold:

1. It is a Graphite-tracked branch reachable from the current trunk, **and**
2. It is present locally, **and**
3. It connects to the trunk through an unbroken chain of locally-present parents.

Additional rules:

- The **trunk itself is always in scope** and anchors the graph.
- **Untracked git branches are never in scope.** The command is Graphite-backed by contract.
- A tracked branch that is _not present locally_ is excluded. If excluding it severs another in-scope branch from the trunk, that severed branch is also excluded and a warning is emitted (§9, skipped-branch warning).
- The set of in-scope branches preserves the parent/child relationships among the branches that remain.

### 5.2 Computing touches per branch

For each in-scope branch other than the trunk, the command examines that branch's **slice** (`parent..branch`) and determines which Objectives it touches:

- Only paths under the **active root** `.asdl/objectives/<slug>/` are considered.
- Paths under the **archive root** `.asdl/objective-archive/` are **completely ignored** — they never create membership, never count toward latest work, and never appear as "also touches" markers. An archived Objective is treated as if it does not exist for this command.
- **Active-root deletions count as touches.** Deleting or moving an active record is itself Objective lifecycle work and must be visible.
- For each touched slug, the command records the **latest touching commit within the slice**: its commit identifier and commit timestamp.

The slice base is the branch's Graphite **parent**, not the trunk. This is essential: using `parent..branch` ensures a branch is only credited with the Objective work it actually introduced, not work inherited from branches below it in the stack.

### 5.3 Grouping by Objective (many-to-many)

The relationship between branches and Objectives is many-to-many:

- A single branch may touch multiple Objectives.
- A single Objective may be touched by multiple branches.
- A single stack may contain work for multiple Objectives.

Rules:

- The output is grouped by Objective slug. Each touched slug produces exactly one Objective group.
- A branch that touches multiple Objectives appears under **each** Objective it touches.
- Within an Objective group, each branch row carries an **also-touches** list: the _other_ Objective slugs that the same branch's slice touches (the current group's own slug is excluded). This list is sorted alphabetically.
- Only Objectives that are touched by at least one in-scope branch appear in the output. (An active record that exists on trunk but has no branch work does **not** appear here — it belongs to `objective list`.)

### 5.4 Segments and connector branches

Within a single Objective group, the work may be spread across disconnected parts of the stack. The command represents this with **segments**.

Membership of an Objective group is built as follows:

1. Start with every branch that touches the Objective.
2. For each such branch, also include every tracked branch on its parent chain up to — but not including — the trunk. These ancestor branches preserve the stack shape down to the trunk.
3. The included branches are partitioned into connected regions following parent/child links. Each connected region is one **segment**.

A branch in a segment whose own slice does **not** touch the Objective is a **connector**: it is present only to show the dependency path between Objective branches (or between an Objective branch and the trunk). Connector branches:

- are marked distinctly from Objective branches (see glyphs in §6),
- do **not** count toward the Objective's branch count (§5.6),
- do **not** participate in latest-work attribution (§5.7),
- still carry their own also-touches list if their slice touches _other_ Objectives.

### 5.5 Projected status

Each Objective group has a projected status, derived from the **trunk's** state:

- **`open`** — an active record for the slug exists on the trunk and has no closed marker.
- **`closed`** — an active record for the slug exists on the trunk and has a closed marker.
- **`in-flight`** — no active record for the slug exists on the trunk, but at least one in-scope branch slice touches it.

The command deliberately does **not** interpret pending lifecycle transitions. For example, if a branch adds a closed marker, the group does not announce "closing"; the status reflects trunk state only, and the branch rows tell the rest of the story.

### 5.6 Objective branch count and segment count

- **Objective branch count** is the number of distinct branches whose slice touches the Objective. Connector branches are **not** counted.
- **Segment count** is the number of segments in the group.

### 5.7 Latest work

For each Objective group, latest work is computed across the Objective branches (connectors excluded):

1. Consider every Objective-touching commit, across all Objective branches, that changed a path under the Objective's active record.
2. Select the commit with the newest commit timestamp.
3. Report the branch that commit belongs to, the commit timestamp, and the commit identifier.

Tie-breaking is deterministic: when timestamps are equal, ordering falls back to branch name, then commit identifier. Commits whose timestamp cannot be interpreted sort as older than any interpretable timestamp.

If no Objective-touching commit exists for the group, latest work is absent (rendered as `—` in text formats, `null` in JSON).

### 5.8 Ordering and determinism

The command MUST produce deterministic output for a given repository state:

- Objective groups are ordered alphabetically by slug.
- Segments within a group are presented in a stable order based on their position in the stack.
- Branch rows within a segment are presented in **stack order**: each segment is traversed from its root (the branch in the segment whose parent is outside the segment) downward, parents before children. Each row carries a **depth**: the root is depth 0, each step toward children increases depth by 1.
- Also-touches lists are sorted alphabetically.
- Warnings are de-duplicated; identical warning messages appear at most once.

---

## 6. Glyphs and annotations (text formats)

The `human` and `markdown` formats share a visual vocabulary.

### 6.1 Branch glyphs

- `◆` — an Objective branch (its slice touches this Objective).
- `◇` — a connector branch (included only to preserve stack shape).

### 6.2 Objective status labels

- `○ open`
- `✓ closed`
- `◇ in-flight`

(The `◇` in `in-flight` is the status glyph for a group header, distinct from the connector glyph on a branch row.)

### 6.3 Branch row annotations

A branch row may carry a parenthesized annotation after the branch name. When present, it has the form `(item; item; …)` (note the two leading spaces, items separated by `;`). The items, in order, are:

1. **Also-touches** — `also: <slug>, <slug>` when the branch also touches other Objectives.
2. **Restack health** — exactly one of:
   - `needs restack` — emitted when Graphite reports the branch needs restacking (whether via an explicit needs-restack signal or a validation result indicating it).
   - `gt: <result>` — emitted for any other non-trivial Graphite validation result.
   - (nothing) — when the branch is valid or is the trunk. Routine "valid"/"trunk" states produce **no** annotation, to keep healthy stacks quiet.

If no items apply, the row has no annotation.

---

## 7. Output formats

### 7.1 Human format (default)

Optimized for terminal reading. Its visual layout MAY evolve; the following is the canonical v1 shape.

Structure:

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

Rules:

- The trunk line shows the trunk branch name unadorned.
- A `Warnings:` block appears only when there are warnings.
- Counts are pluralized: `1 objective branch` / `3 objective branches`; `1 segment` / `2 segments`.
- `latest` shows the branch name and a relative time, e.g. `feat/b (3h ago)`; if no relative time is available it shows just the branch name; if there is no latest work it shows `—`.
- Each segment header is `segment <index>` (1-based), preceded by a blank line.
- Each branch row is indented by two spaces per depth level beneath the segment, then the glyph, branch name, and optional annotation.
- When there are no Objective groups, the body is the single line `No Objective stack work found.` (rendered dimmed).

### 7.2 Markdown format

A simple, paste-friendly rendering.

Structure:

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

Rules:

- The trunk name is wrapped in backticks.
- A `Warnings:` block (with `-` bullets) appears only when there are warnings.
- Each Objective is a `##` heading using the status label and slug.
- The summary is three bullets: objective branches, segments, latest.
- `latest` in markdown is `` `<branch>` at `<timestamp>` (`<commit>`) `` when present, or `—` when absent.
- Segment rows are rendered inside a fenced `` ```text `` block. Within the block, rows are indented two spaces per depth level (one less leading indent than the human format), and a blank line separates consecutive segments.
- When there are no Objective groups, the body is the single line `No Objective stack work found.`

### 7.3 JSON format

`--format json` emits a machine envelope as indented JSON. The envelope is the integration contract for scripts and downstream tools.

#### 7.3.1 Envelope

Success:

```json
{
  "exit_code": 0,
  "data": { /* result object, see §7.3.2 */ }
}
```

Failure (see §8):

```json
{
  "exit_code": 2,
  "error_type": "<stable identifier>",
  "message": "<human-readable detail>"
}
```

- `exit_code` is always present and mirrors the process exit code.
- On success, `data` carries the result and there is no `error_type`/`message`.
- On failure, `error_type` and `message` are present and there is no `data`.

#### 7.3.2 Result object (`data`)

| Field          | Type     | Description                                                                                                |
| -------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `trunk_branch` | string   | The current Graphite trunk the projection is rooted on.                                                    |
| `warnings`     | string[] | Non-fatal diagnostics (§9). Empty array when none.                                                         |
| `objectives`   | object[] | Objective groups, ordered alphabetically by `slug`. Empty array when no branch work touches any Objective. |

Each entry in `objectives`:

| Field                    | Type           | Description                                                                 |
| ------------------------ | -------------- | --------------------------------------------------------------------------- |
| `slug`                   | string         | The Objective slug.                                                         |
| `status`                 | string         | One of `open`, `closed`, `in-flight` (§5.5).                                |
| `objective_branch_count` | integer        | Distinct branches whose slice touches this Objective (connectors excluded). |
| `segment_count`          | integer        | Number of segments.                                                         |
| `latest_work`            | object \| null | Latest Objective-touching commit (§5.7), or `null`.                         |
| `segments`               | object[]       | Segments, in stable stack order.                                            |

`latest_work` (when not null):

| Field           | Type   | Description                                         |
| --------------- | ------ | --------------------------------------------------- |
| `branch`        | string | Branch owning the latest Objective-touching commit. |
| `committed_iso` | string | Commit timestamp, ISO-8601.                         |
| `oid`           | string | Commit identifier.                                  |

Each entry in `segments`:

| Field   | Type     | Description                                           |
| ------- | -------- | ----------------------------------------------------- |
| `index` | integer  | 1-based segment index within the Objective.           |
| `rows`  | object[] | Branch rows in stack order (parents before children). |

Each entry in `rows`:

| Field               | Type           | Description                                                                    |
| ------------------- | -------------- | ------------------------------------------------------------------------------ |
| `branch`            | string         | Branch name.                                                                   |
| `parent`            | string \| null | Parent branch name; `null` only for a root with no in-scope parent.            |
| `depth`             | integer        | Depth within the segment; segment root is 0.                                   |
| `touches_objective` | boolean        | True if this branch's slice touches this Objective.                            |
| `connector`         | boolean        | True if this branch is a connector (the exact inverse of `touches_objective`). |
| `also_touches`      | string[]       | Other Objective slugs this branch's slice touches, sorted. Empty when none.    |
| `validation_result` | string \| null | Graphite validation result for the branch, if known; otherwise `null`.         |
| `needs_restack`     | boolean        | Whether Graphite reports the branch needs restacking.                          |

Design constraint: JSON exposes **semantic facts, not rendering decisions**. There are no glyphs in JSON; consumers derive presentation from `touches_objective`, `connector`, `also_touches`, `validation_result`, and `needs_restack`. This keeps the format stable for future consumers (including a possible interactive viewer).

---

## 8. Failure behavior

Failures exit with code `2` and, in JSON format, produce the failure envelope of §7.3.1. In text formats, the message is written to standard error (the human format prefixes it with `error:`). A failed command produces no projection.

Each failure carries a stable machine-readable `error_type`. The defined categories are:

### 8.1 Environment unavailable — `not_in_repo`

The command cannot establish a repository context (for example, it is not run inside a repository). The message describes the condition, e.g. `Not inside a git repository.`

### 8.2 Stack metadata unavailable — `gt_branch_graph_failed`

Graphite stack metadata for the current trunk cannot be read. The message has the form `Graphite branch graph failed: <detail>`, where `<detail>` describes the underlying cause.

### 8.3 Underlying data-read failure

A required read of repository or Objective data fails partway through computing the projection (for example, the per-branch slice query or the trunk status read fails). The command fails rather than emitting a partial projection, with an `error_type` identifying the failed read and a message carrying the underlying detail.

> A production implementation SHOULD treat the `error_type` values as a stable, documented enumeration. `not_in_repo` and `gt_branch_graph_failed` are the primary externally-observed identifiers; the data-read family should be given equally stable identifiers.

---

## 9. Warnings

Warnings are **non-fatal**. They surface conditions that reduced or perturbed the projection without preventing it. They appear in the `warnings` array (JSON) and in the `Warnings:` block (text formats). Identical messages are de-duplicated.

Defined warning categories, with canonical message shapes:

1. **Skipped branch — broken local parent chain.** A tracked branch in scope by lineage could not be connected to the trunk through locally-present parents and was dropped.
   `Graphite branch '<branch>' has unavailable local parent '<parent>'; skipping.`

2. **Objective ancestor-walk anomalies.** While assembling an Objective's segments, the walk up a branch's parent chain hit a structural problem. The Objective is still reported with whatever could be assembled.
   - `Objective '<slug>': branch '<branch>' has no Graphite parent; ancestor walk stopped.`
   - `Objective '<slug>': branch '<branch>' references missing Graphite parent '<parent>'; ancestor walk stopped.`
   - `Objective '<slug>': cycle detected at Graphite parent '<parent>'; ancestor walk stopped.`

3. **Stack metadata inconsistencies (pass-through).** When the underlying stack metadata is internally inconsistent (e.g. a recorded child is missing, a cycle is present, or trunk markers disagree), the corresponding diagnostics are surfaced in the same `warnings` list.

> The exact wording of warnings is informative, not part of the integration contract. Consumers should treat `warnings` as human-readable diagnostics, not as parseable codes.

---

## 10. Worked example

### 10.1 Input stack

Current trunk: `main`. Tracked, locally-present branches:

```
main
├─ feat/a          (slice touches alpha and beta)
│   └─ feat/connector   (slice touches nothing; Graphite reports needs-restack)
│       └─ feat/c       (slice touches alpha)
└─ feat/b          (slice touches alpha)
```

On `main`, an active record exists for `alpha` (open, no closed marker). No record exists for `beta` on `main`.

Latest Objective-touching commit timestamps: `feat/a` touches alpha and beta at `10:00`; `feat/c` touches alpha at `11:00`; `feat/b` touches alpha at `12:00`.

### 10.2 JSON output

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

Observe:

- `alpha` has **two** segments: `feat/a → feat/connector → feat/c` is one connected region; `feat/b` is a separate child of trunk, hence its own segment.
- `feat/connector` appears in `alpha`'s segment 1 as a connector (`◇`) even though it does not touch `alpha` — it is on the path between `feat/a` and `feat/c`. It is **not** counted in `alpha`'s `objective_branch_count` (which is 3: `feat/a`, `feat/c`, `feat/b`).
- `feat/connector` does **not** appear under `beta` at all, because `beta`'s only Objective branch is `feat/a`, which needs no connector.
- `alpha`'s latest work is `feat/b` (newest timestamp), not the deepest branch.
- `beta` is `in-flight`: it has branch work but no record on `main`.

### 10.3 Human output

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

### 10.4 Markdown output

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

---

## 11. The `/objective-gt-stacks` Pi display command

A companion command exists for agent/chat environments (Pi). It is a **thin display wrapper** over `objective gt stacks`. It exists so a developer can view the stack projection inline without asking the agent to run a shell command or interpret output.

### 11.1 Contract

- **Invocation:** `/objective-gt-stacks` or `/objective-gt-stacks --help` (also `-h`).
- **Default action:** runs `objective gt stacks` in **markdown** format and presents the result as a display message in the session.
- **Help:** `--help`/`-h` runs `objective gt stacks --help` and displays that usage text. The command's own usage banner is:
  ```
  Usage: /objective-gt-stacks [--help]

  Shows `objective gt stacks` output in chat. Output format is controlled by the Pi extension; --format and --json-schema are not supported.
  ```
- **Presentation, not interpretation:** it displays the command's output verbatim. It does not parse, summarize, or act on the projection. Interactive graph exploration is explicitly out of scope (a possible future viewer).
- **Idle-first:** it waits for the session to be idle before running, so output is not interleaved with in-progress agent work.

### 11.2 Strict argument policy

The wrapper owns the output format and surface. It rejects, before running anything:

- `--format` / `--format=…` — the format is fixed to markdown; rejected.
- `--json-schema` / `--json-schema=…` — not exposed through the wrapper; rejected.
- any unknown flag.
- any positional argument.

A rejected invocation produces a usage message (status "rejected") and does **not** run `objective gt stacks`. Argument completion suggests only `--help` and `-h`.

### 11.3 Output and failure presentation

- **Success:** the trimmed standard output of the command is shown. If standard output is empty, standard error is shown; if both are empty, `(empty)` is shown.
- **Command failure** (non-zero exit, or killed/timed out): a failure message shows the exit status and both streams. Long output is truncated to its last 4000 characters with a leading truncation notice.
- **Startup failure** (the command could not be launched at all): a message describes the launch error.
- **Timeout:** the underlying command is run with a 30-second timeout; exceeding it is treated as a failure.

### 11.4 Message envelope for consumers

Each display message carries structured details alongside the human-readable content, so a host UI can render or log it:

- a message type identifying it as `objective-gt-stacks` output,
- `status`: one of `success`, `failure`, `rejected`,
- the resolved command and argument list,
- the working directory,
- the exit code and a killed/timed-out flag,
- the byte/char sizes of the captured output streams.

> The companion `/objective-list` command and the changed-Objective picker live in the same surface but are out of scope for this specification.

---

## 12. Non-goals (v1)

Explicitly excluded from this version:

- Scanning trunks other than the current one.
- Including untracked (non-Graphite) git branches.
- Reproducing Graphite's exact connector art; a correct, simple indented layout is preferred.
- Slice commit counts, "max slice", or other size metrics.
- Interpreting pending lifecycle transitions ("closing", "creating", "archiving") in group headers.
- Including archived Objectives or archive-root-only edits.
- An interactive TUI. The JSON contract is intentionally graph-semantic so such a viewer can be built later on top of it without parsing glyphs.

---

## 13. Acceptance checklist

A conforming implementation must satisfy all of the following:

- [ ] Lives at command path `objective gt stacks`, under an explicit `gt` group, and advertises Graphite in its help.
- [ ] Derives stack structure from Graphite stack metadata, never from parsing `gt` text output.
- [ ] Scans only the current trunk; only locally-present, trunk-connected tracked branches; never untracked branches; does not require the current branch to be tracked.
- [ ] Computes touches from each branch's `parent..branch` slice, under the active root only, counting deletions, ignoring the archive root entirely.
- [ ] Groups by slug; supports a branch touching multiple Objectives (with `also_touches`); supports one Objective across multiple disconnected segments; includes connector branches and marks them distinctly (`◇` vs `◆`); excludes connectors from branch count and latest-work.
- [ ] Projects status from the trunk as `open` / `closed` / `in-flight`, with no pending-transition interpretation.
- [ ] Reports latest work from the newest Objective-touching commit (deterministic tie-break), or absent when none.
- [ ] Produces deterministic ordering (slugs alphabetical; rows in stack order with correct `depth`; `also_touches` sorted; warnings de-duplicated).
- [ ] Provides `human` (default), `json`, and `markdown`/`md` formats, plus `--json-schema` and `--help`, matching §6–§7.
- [ ] JSON exposes semantic facts only (no glyphs) and matches the schema in §7.3.2.
- [ ] Fails with exit code 2 and a stable `error_type` for environment-unavailable, stack-metadata-unavailable, and underlying-data-read failures, never emitting a partial projection.
- [ ] Surfaces non-fatal warnings without aborting (§9).
- [ ] Ships `/objective-gt-stacks` as a thin markdown display wrapper with the strict argument policy and presentation behavior of §11.
