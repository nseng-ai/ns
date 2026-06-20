---
name: ccc-stack-map
description: "Use when the user asks to map, overlay, inspect, or understand open cmux workspaces/tabs against a Graphite stack: cmux stack map, open workspaces on graphite, what branches are active in cmux, overlay cmux tabs on gt ls, which cmux workspace corresponds to which checked-out branch, or branch/worktree drift across cmux. Produces a read-only cmux × Graphite overlay; do not mutate cmux/Git/Graphite unless the user separately asks for cleanup."
metadata:
  internal: true
---

# ccc-stack-map

Render a read-only cmux × Graphite stack map: a Graphite-stack-shaped view with concise cmux/worktree badges appended to branch rows.

## Default posture

This skill is observational by default. Collect facts and render an overlay; do not clean anything up during the same request.

Do **not** do any of the following unless the user separately asks for a follow-up mutation:

- rename, focus, close, or otherwise mutate cmux workspaces or surfaces;
- send text or keys to cmux panes;
- mutate Git or Graphite state;
- edit files.

This is an internal local skill and should be installed with `metadata.internal: true` / `INSTALL_INTERNAL_SKILLS=1` when managed by `npx skills`.

## Data sources

Use these sources in this order:

1. `cmux tree --all --json` for window, workspace, surface/tab, active workspace, and caller workspace relationships.
2. For each window from the tree, `cmux workspace list --window <window-ref> --json` for `current_directory` and workspace metadata.
3. For each workspace current directory that exists:
   - `git -C <cwd> symbolic-ref --short HEAD` for the checked-out branch;
   - fallback `git -C <cwd> rev-parse --short HEAD` and display detached HEAD as `DETACHED@abc123`;
   - `git -C <cwd> status --porcelain` for dirty state.
4. Structured Graphite topology for branch facts. Prefer `slot gt exec stack-branches --format json` from relevant stack worktrees and use its `data.edges` parent→child list as the machine tree shape. Fall back to `gt parent --no-interactive` / `gt children --no-interactive` only when the exec helper is unavailable or incomplete.
5. `gt ls` only as human visual confirmation or as a visual template. Do **not** parse `gt ls`, `gt log`, or other human-facing Graphite display output as a machine source of topology facts.

## Default overlay output

Default output is overlay-only. Do not include an `Attention:` or findings section unless the user explicitly asks for that optional variant.

Preserve the Graphite tree shape in a dedicated `TOPO` column. The user should see the whole relevant stack, not just rows that have open cmux workspaces. Put branch names, Graphite notes, and cmux/worktree badges in separate same-line columns so long branch names or sparse badges do not visually detach from the topology. If the user provides pasted `gt ls` output, you may use that pasted text as the visual tree template for the `TOPO` column and extract the row text into table columns, but do not infer machine topology facts from it. If structured topology is incomplete, say so and prefer an honest partial overlay over silently collapsing the tree.

Use this shape. Include hard `|` separators and a header rule so alignment survives Markdown/code-fence rendering quirks:

```text
cmux × Graphite stack map
Legend: ● active cmux  ◎ this Pi session/caller  ○ open inactive  DIRTY dirty worktree  ↯label title/description drift  dup duplicate cwd+branch  2t multi-tab workspace

TOPO      | BRANCH        | GRAPHITE | CMUX
----------+---------------+----------+--------------------------
◯         | parent-branch |          |
│ ◯       | child-branch  | slot-12  | ○ ws45 slot-12 DIRTY ↯label 2t
│ │ ◉     | current-branch | current  | ◎ ws31 slot-03
◯─┴─┴─┘   | master        | repo     |
```

Size columns from the rendered rows before printing: `TOPO` should be wide enough for the deepest topology glyph string including the trunk join row; `BRANCH` should be wide enough for the longest displayed branch; `GRAPHITE` should be wide enough for notes such as `needs restack, slot-13`. Keep every row one physical line whenever possible.

An optional `Open workspaces not represented in this displayed stack` block is allowed by default because it is still overlay inventory, not an Attention/findings section.

```text
Open workspaces not represented in this displayed stack:
  ○ ws52 slot-01 other-branch
```

## Colorization

Colorize when the output medium supports ANSI color and the user has not disabled it with `NO_COLOR` or `TERM=dumb`. If color support is uncertain, provide plain text. Never make color the only carrier of meaning; badges and labels must remain readable when copied without ANSI.

Suggested ANSI palette:

- tree guide glyphs (`│`, `└`, `─`, `┴`) and branches with no cmux workspace: dim gray;
- current Graphite branch marker / branch name: bold cyan;
- `●` active cmux badge: bold green;
- `◎` caller / this Pi session badge: bold magenta;
- `○` open inactive badge: white or default foreground;
- `DIRTY`: yellow;
- `↯label`: red;
- `dup`: blue;
- `2t`, `3t`, etc.: cyan.

When posting into a Markdown code fence, prefer plain text unless the receiving UI is known to render ANSI escape sequences. In an ANSI-capable terminal, emitting the colored tree directly is acceptable.

## Badge semantics

Put badges in the `CMUX` column for the matching Graphite branch row. Keep badges terse and stable.

- `●`: cmux active/focused workspace from `tree.active.workspace_ref`.
- `◎`: caller workspace for this Pi session from `tree.caller.workspace_ref`.
- `○`: open inactive cmux workspace.
- `DIRTY`: `git status --porcelain` for the workspace current directory is non-empty.
- `↯label`: neither workspace title nor workspace description contains the checked-out branch name, using simple case-sensitive substring matching. If the workspace is detached, skip label-drift unless the detached display string is obviously present or missing in labels.
- `dup`: two or more cmux workspaces point to the same `(cwd, branch)` pair.
- `2t`, `3t`, etc.: the workspace has multiple cmux surfaces/tabs in `cmux tree --all --json`. Count surfaces for that workspace; do not count panes for this badge.

If a workspace is both active and caller, prefer `◎` only when emphasizing this Pi session matters more than global focus; otherwise show both as `●◎` if the display needs to distinguish the two facts.

## Read-only command recipe

Run collection commands only. These commands should not mutate cmux, Git, Graphite, or files.

```bash
cmux tree --all --json
```

For each window returned by the tree:

```bash
cmux workspace list --window <window-ref> --json
```

For each workspace current directory that exists:

```bash
git -C <cwd> symbolic-ref --short HEAD || git -C <cwd> rev-parse --short HEAD
git -C <cwd> status --porcelain
```

From at least one non-trunk stack worktree when available:

```bash
slot gt exec stack-branches --format json
```

Read `data.edges` as structured parent→child topology and `data.branches` as the non-trunk branch inventory for the selected scope. If only trunk is available, report the clear no-stack envelope rather than treating it as a failure.

For ad-hoc collection without adding a bundled script, a minimal Python sketch is acceptable in the live session:

```python
import json
import subprocess


def run_json(*argv: str) -> object:
    return json.loads(subprocess.check_output(argv, text=True))


tree = run_json("cmux", "tree", "--all", "--json")
for window in tree.get("windows", []):
    window_ref = window.get("window_ref") or window.get("id") or window.get("ref")
    if window_ref:
        workspaces = run_json("cmux", "workspace", "list", "--window", window_ref, "--json")
        print(window_ref, workspaces)
```

Use snippets like this only as documentation or one-off session assistance; do not add a bundled executable script for the first version of this skill.

## Rendering workflow

1. Collect the cmux tree and identify active and caller workspace refs.
2. List workspaces for each cmux window and merge workspace metadata with tree surface counts.
3. Inspect each workspace current directory for branch or detached HEAD and dirty state.
4. Collect structured Graphite topology from relevant stack worktrees.
5. Join workspace facts by branch name.
6. Render Graphite tree rows as an aligned same-line table with `TOPO | BRANCH | GRAPHITE | CMUX` columns and hard separators.
7. Render an optional missing-open-workspace block for open branches not represented in the displayed topology.
8. Do a final self-check that the default output has no `Attention:` section and that branch names / Graphite notes / cmux badges are not embedded inside the topology column.

## Optional reference

Read `references/display-and-code-sketch.md` when the user wants the optional Attention section format, wants to iterate on display design, or asks what a future deterministic implementation should look like.
