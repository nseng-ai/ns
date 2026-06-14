# Display and code sketch

This reference expands optional display variants and a future deterministic implementation shape for `ccc-stack-map`. It is not a bundled renderer and should not be treated as runnable production code.

## Optional Attention section

The default `ccc-stack-map` response is overlay-only. Do not include this section unless the user explicitly asks for findings, diagnostics, or an attention list.

Example shape:

```text
Attention:
  DIRTY ws45 slot-12: areg-command-pi-skill-exclusion-objective-create has uncommitted changes
  ↯label ws45 slot-12: label says add-objective-create-pi-extension-typeahead but branch is areg-command-pi-skill-exclusion-objective-create
  dup ws52/ws19: both point at slot-01 trust-nothing-verification-baseline-plans
  missing ws27 slot-08: open branch ccc-sidebar-summary-drift is not represented in the displayed stack
```

Use these cases sparingly:

- **Stale label / branch mismatch**: `↯label` when neither workspace title nor description contains the checked-out branch name by simple case-sensitive substring matching.
- **Dirty worktree**: `DIRTY` when `git status --porcelain` is non-empty for the workspace current directory.
- **Duplicate workspace view**: `dup` when two or more cmux workspaces point to the same `(cwd, branch)` pair.
- **Open branch missing from displayed stack**: `missing` when a cmux workspace branch is open but not represented in the displayed structured Graphite topology.

## Tree-shaped overlay and color examples

The overlay should preserve the Graphite tree shape and append cmux badges in place:

```text
cmux × Graphite stack map
Legend: ● active cmux  ◎ this Pi session/caller  ○ open inactive  DIRTY dirty worktree  ↯label title/description drift  dup duplicate cwd+branch  2t multi-tab workspace

│ │ │ │ ◯                  stack-feedback-single-file-fixes (slot-15)  ● ws46 slot-15 ↯label
│ │ │ │ │ ◉                ccc-stack-map-cmux-graphite-overlay  ◎ ws57 slot-03 DIRTY
│ │ │ │ │ │ │ │ │ │ ◯      trust-nothing-verification-baseline-plans (slot-01)  ○ ws19 slot-01 ↯label
◯─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┘  master (asdl-tools)  ○ ws55/ws56 asdl-tools dup ↯label
```

For ANSI-capable terminal output, keep color subtle and redundant with text:

```text
\x1b[2m│ │ │ │ ◯\x1b[0m                  stack-feedback-single-file-fixes (slot-15)  \x1b[1;32m●\x1b[0m ws46 slot-15 \x1b[31m↯label\x1b[0m
\x1b[2m│ │ │ │ │\x1b[0m \x1b[1;36m◉ ccc-stack-map-cmux-graphite-overlay\x1b[0m  \x1b[1;35m◎\x1b[0m ws57 slot-03 \x1b[33mDIRTY\x1b[0m
```

Do not put raw ANSI escapes in Markdown unless the receiving UI renders them. If the output is being pasted into chat or docs, use plain text.

## Future deterministic implementation sketch

This is code shape and pseudocode for a future script or explicit `ccc`/`asdl exec` command after display semantics stabilize. It is not runnable production code and should not be copied into source without tests, fakes, and command-boundary design.

Possible data models:

```python
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence


@dataclass(frozen=True)
class CmuxWorkspaceFact:
    window_ref: str
    workspace_ref: str
    title: str | None
    description: str | None
    cwd: Path | None
    branch: str | None
    detached_oid: str | None
    dirty: bool | None
    is_active: bool
    is_caller: bool
    surface_count: int


@dataclass(frozen=True)
class BranchBadge:
    branch: str
    workspace_ref: str
    slot: str | None
    state_icon: str
    dirty: bool
    label_drift: bool
    duplicate: bool
    tab_count: int


@dataclass(frozen=True)
class OverlayRenderResult:
    lines: tuple[str, ...]
    missing_workspace_branches: tuple[str, ...]


@dataclass(frozen=True)
class RenderOptions:
    color: bool
    preserve_tree_template: bool
```

Possible function boundaries:

```python
def collect_cmux_tree() -> Mapping[str, object]: ...
def list_window_workspaces(window_ref: str) -> Mapping[str, object]: ...
def inspect_workspace_git_state(cwd: Path) -> GitState: ...
def collect_graphite_topology(cwds: Sequence[Path]) -> StackTopology: ...
def index_workspaces_by_branch(facts: Sequence[CmuxWorkspaceFact]) -> dict[str, list[CmuxWorkspaceFact]]: ...
def detect_label_drift(fact: CmuxWorkspaceFact) -> bool: ...
def detect_duplicates(facts: Sequence[CmuxWorkspaceFact]) -> set[tuple[Path, str]]: ...
def render_overlay(topology: StackTopology, facts: Sequence[CmuxWorkspaceFact], options: RenderOptions) -> OverlayRenderResult: ...
```

Pseudocode flow:

```text
tree = collect_cmux_tree()
active_workspace = tree.active.workspace_ref
caller_workspace = tree.caller.workspace_ref
for each window in tree.windows:
    merge tree workspace/surface facts with `cmux workspace list --window ...`
    inspect git state for existing current_directory
collect structured Graphite topology from relevant stack worktrees
join workspace facts by branch name
render full tree rows with badges appended in place
apply ANSI color only when options.color is true
render missing-open-workspace block for branches not represented in displayed topology
```

Implementation notes for the future command:

- Prefer gateway/fake boundaries for cmux, Git, and Graphite process calls.
- Preserve the structured Graphite source rule: use `asdl slot gt exec stack-branches --format json`, `gt parent --no-interactive`, or `gt children --no-interactive` for facts.
- Use `gt ls` only for human visual confirmation or as a rendering style template; do not parse it for machine topology.
- Keep the default renderer overlay-only, with the Attention section behind an explicit flag or separate mode.
- Preserve the full Graphite tree shape; do not collapse output to only rows with matching cmux workspaces.
- Support a color option that respects `NO_COLOR`, `TERM=dumb`, non-TTY output, and plain-text Markdown/chat fallbacks.

## Non-goals for the first skill version

- Do not parse `gt ls` for facts.
- Do not mutate cmux, Git, or Graphite.
- Do not assume the active cmux workspace is the caller.
- Do not introduce a script or CLI until display semantics stabilize.
