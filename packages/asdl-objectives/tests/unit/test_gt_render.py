from __future__ import annotations

import re

from asdl_objectives.gt.models import (
    ObjectiveGtLatestWork,
    ObjectiveGtStackObjective,
    ObjectiveGtStackRow,
    ObjectiveGtStackSegment,
    ObjectiveGtStacksResult,
)
from asdl_objectives.gt.render import render_stacks_human, render_stacks_markdown

# ---------------------------------------------------------------------------
# Section-10 result fixture (mirrors blueprint §6.2 verbatim)
# ---------------------------------------------------------------------------


def _section10_result() -> ObjectiveGtStacksResult:
    return ObjectiveGtStacksResult(
        trunk_branch="main",
        warnings=(),
        objectives=(
            ObjectiveGtStackObjective(
                slug="alpha",
                status="open",
                objective_branch_count=3,
                segment_count=2,
                latest_work=ObjectiveGtLatestWork(
                    branch="feat/b",
                    committed_iso="2026-05-20T12:00:00Z",
                    oid="b-alpha",
                ),
                segments=(
                    ObjectiveGtStackSegment(
                        index=1,
                        rows=(
                            ObjectiveGtStackRow(
                                branch="feat/a",
                                parent="main",
                                depth=0,
                                touches_objective=True,
                                connector=False,
                                also_touches=("beta",),
                                validation_result="OK",
                                needs_restack=False,
                            ),
                            ObjectiveGtStackRow(
                                branch="feat/connector",
                                parent="feat/a",
                                depth=1,
                                touches_objective=False,
                                connector=True,
                                also_touches=(),
                                validation_result="VALID",
                                needs_restack=True,
                            ),
                            ObjectiveGtStackRow(
                                branch="feat/c",
                                parent="feat/connector",
                                depth=2,
                                touches_objective=True,
                                connector=False,
                                also_touches=(),
                                validation_result=None,
                                needs_restack=False,
                            ),
                        ),
                    ),
                    ObjectiveGtStackSegment(
                        index=2,
                        rows=(
                            ObjectiveGtStackRow(
                                branch="feat/b",
                                parent="main",
                                depth=0,
                                touches_objective=True,
                                connector=False,
                                also_touches=(),
                                validation_result=None,
                                needs_restack=False,
                            ),
                        ),
                    ),
                ),
            ),
            ObjectiveGtStackObjective(
                slug="beta",
                status="in-flight",
                objective_branch_count=1,
                segment_count=1,
                latest_work=ObjectiveGtLatestWork(
                    branch="feat/a",
                    committed_iso="2026-05-20T10:00:00Z",
                    oid="a-multi",
                ),
                segments=(
                    ObjectiveGtStackSegment(
                        index=1,
                        rows=(
                            ObjectiveGtStackRow(
                                branch="feat/a",
                                parent="main",
                                depth=0,
                                touches_objective=True,
                                connector=False,
                                also_touches=("alpha",),
                                validation_result="OK",
                                needs_restack=False,
                            ),
                        ),
                    ),
                ),
            ),
        ),
    )


def _empty_result() -> ObjectiveGtStacksResult:
    return ObjectiveGtStacksResult(trunk_branch="main", warnings=(), objectives=())


# ---------------------------------------------------------------------------
# A12 — Human renderer (structural; relative time by SHAPE)
# ---------------------------------------------------------------------------


def test_a12_human_structure(capsys) -> None:
    render_stacks_human(_section10_result())
    out = capsys.readouterr().out
    lines = out.splitlines()

    assert lines[0] == "Objective stacks"
    assert lines[1] == "Graphite trunk: main"
    assert lines[2] == ""

    # alpha header — counts pluralized, status label, latest by shape.
    assert lines[3].startswith("○ open alpha  3 objective branches  2 segments  latest: ")
    assert re.search(r"latest: feat/b \(.+ ago\)$", lines[3])

    assert lines[4] == ""
    assert lines[5] == "  segment 1"
    assert lines[6] == "    ◆ feat/a  (also: beta)"
    assert lines[7] == "    ◇ feat/connector  (needs restack)"
    assert lines[8] == "      ◆ feat/c"
    assert lines[9] == ""
    assert lines[10] == "  segment 2"
    assert lines[11] == "    ◆ feat/b"
    assert lines[12] == ""

    # beta header — singular nouns, in-flight status label.
    assert lines[13].startswith("◇ in-flight beta  1 objective branch  1 segment  latest: ")
    assert re.search(r"latest: feat/a \(.+ ago\)$", lines[13])
    assert lines[14] == ""
    assert lines[15] == "  segment 1"
    assert lines[16] == "    ◆ feat/a  (also: alpha)"


def test_a12_human_empty_state_is_dimmed(capsys) -> None:
    render_stacks_human(_empty_result())
    out = capsys.readouterr().out

    assert "No Objective stack work found." in out


def test_a12_human_empty_state_uses_dim_markup(monkeypatch, capsys) -> None:
    # Force the console to emit ANSI so the [dim] styling is observable.
    from rich.console import Console

    import asdl_objectives.gt.render as render_mod

    def _color_console() -> Console:
        return Console(force_terminal=True, color_system="standard")

    monkeypatch.setattr(render_mod, "get_console", _color_console)
    render_stacks_human(_empty_result())
    out = capsys.readouterr().out

    # Dimmed text carries the SGR dim (2) escape.
    assert "\x1b[2m" in out
    assert "No Objective stack work found." in out


# ---------------------------------------------------------------------------
# A13 — Markdown renderer (EXACT string equality)
# ---------------------------------------------------------------------------


_EXPECTED_MARKDOWN = """\
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
"""


def test_a13_markdown_exact(capsys) -> None:
    render_stacks_markdown(_section10_result())
    out = capsys.readouterr().out

    assert out == _EXPECTED_MARKDOWN


def test_a13_markdown_empty_state(capsys) -> None:
    render_stacks_markdown(_empty_result())
    out = capsys.readouterr().out

    assert out == "# Objective stacks\n\nGraphite trunk: `main`\n\nNo Objective stack work found.\n"


def test_a13_markdown_no_latest_work_em_dash(capsys) -> None:
    result = ObjectiveGtStacksResult(
        trunk_branch="main",
        warnings=(),
        objectives=(
            ObjectiveGtStackObjective(
                slug="alpha",
                status="open",
                objective_branch_count=1,
                segment_count=1,
                latest_work=None,
                segments=(
                    ObjectiveGtStackSegment(
                        index=1,
                        rows=(
                            ObjectiveGtStackRow(
                                branch="feat/a",
                                parent="main",
                                depth=0,
                                touches_objective=True,
                                connector=False,
                                also_touches=(),
                                validation_result=None,
                                needs_restack=False,
                            ),
                        ),
                    ),
                ),
            ),
        ),
    )

    render_stacks_markdown(result)
    out = capsys.readouterr().out

    assert "- latest: —" in out


def test_a13_markdown_warnings_block(capsys) -> None:
    result = ObjectiveGtStacksResult(
        trunk_branch="main",
        warnings=("first warning", "second warning"),
        objectives=(),
    )

    render_stacks_markdown(result)
    out = capsys.readouterr().out
    lines = out.splitlines()

    assert "Warnings:" in lines
    assert "- first warning" in lines
    assert "- second warning" in lines


# ---------------------------------------------------------------------------
# Status-label coverage — all three labels (blueprint §3.2 / spec §6.2)
#
# The §10 worked example only exercises "open" and "in-flight"; the "✓ closed"
# label is otherwise unrendered. These tests pin all three labels in both text
# formats so a regression in any glyph/label text is caught.
# ---------------------------------------------------------------------------


def _closed_result() -> ObjectiveGtStacksResult:
    return ObjectiveGtStacksResult(
        trunk_branch="main",
        warnings=(),
        objectives=(
            ObjectiveGtStackObjective(
                slug="gamma",
                status="closed",
                objective_branch_count=1,
                segment_count=1,
                latest_work=ObjectiveGtLatestWork(
                    branch="feat/g",
                    committed_iso="2026-05-20T09:00:00Z",
                    oid="g-gamma",
                ),
                segments=(
                    ObjectiveGtStackSegment(
                        index=1,
                        rows=(
                            ObjectiveGtStackRow(
                                branch="feat/g",
                                parent="main",
                                depth=0,
                                touches_objective=True,
                                connector=False,
                                also_touches=(),
                                validation_result="OK",
                                needs_restack=False,
                            ),
                        ),
                    ),
                ),
            ),
        ),
    )


def test_closed_status_label_human(capsys) -> None:
    render_stacks_human(_closed_result())
    out = capsys.readouterr().out
    lines = out.splitlines()

    assert lines[3].startswith("✓ closed gamma  1 objective branch  1 segment  latest: ")


def test_closed_status_label_markdown(capsys) -> None:
    render_stacks_markdown(_closed_result())
    out = capsys.readouterr().out

    assert "## ✓ closed gamma" in out.splitlines()


# ---------------------------------------------------------------------------
# Human-format warnings block (spec §7.1)
#
# The §10 worked example has no warnings; the markdown warnings block is pinned
# by test_a13_markdown_warnings_block, but the human "Warnings:" block — with its
# two-space-indented "  - <warning>" bullets — is otherwise unrendered.
# ---------------------------------------------------------------------------


def test_human_warnings_block(capsys) -> None:
    result = ObjectiveGtStacksResult(
        trunk_branch="main",
        warnings=("first warning", "second warning"),
        objectives=(),
    )

    render_stacks_human(result)
    out = capsys.readouterr().out
    lines = out.splitlines()

    assert "Warnings:" in lines
    warnings_index = lines.index("Warnings:")
    assert lines[warnings_index + 1] == "  - first warning"
    assert lines[warnings_index + 2] == "  - second warning"


# ---------------------------------------------------------------------------
# Non-routine validation result annotation: "(gt: <result>)" (spec §6.3)
#
# The §10 worked example only exercises routine validation results (OK, VALID
# suppressed) plus the needs-restack branch; a non-routine result like DIVERGED
# is otherwise unrendered. Routine {None, OK, VALID, TRUNK} must stay quiet.
# ---------------------------------------------------------------------------


def _validation_result_row(validation_result: str | None) -> ObjectiveGtStackRow:
    return ObjectiveGtStackRow(
        branch="feat/a",
        parent="main",
        depth=0,
        touches_objective=True,
        connector=False,
        also_touches=(),
        validation_result=validation_result,
        needs_restack=False,
    )


def _single_row_result(row: ObjectiveGtStackRow) -> ObjectiveGtStacksResult:
    return ObjectiveGtStacksResult(
        trunk_branch="main",
        warnings=(),
        objectives=(
            ObjectiveGtStackObjective(
                slug="alpha",
                status="open",
                objective_branch_count=1,
                segment_count=1,
                latest_work=None,
                segments=(ObjectiveGtStackSegment(index=1, rows=(row,)),),
            ),
        ),
    )


def test_non_routine_validation_result_annotation_human(capsys) -> None:
    render_stacks_human(_single_row_result(_validation_result_row("DIVERGED")))
    out = capsys.readouterr().out

    assert "(gt: DIVERGED)" in out


def test_non_routine_validation_result_annotation_markdown(capsys) -> None:
    render_stacks_markdown(_single_row_result(_validation_result_row("DIVERGED")))
    out = capsys.readouterr().out

    assert "(gt: DIVERGED)" in out


def test_routine_validation_results_suppress_annotation_human(capsys) -> None:
    for routine in (None, "OK", "VALID", "TRUNK"):
        render_stacks_human(_single_row_result(_validation_result_row(routine)))
        out = capsys.readouterr().out

        assert "gt:" not in out
        assert "(" not in out


# ---------------------------------------------------------------------------
# Multi-slug also-touches join: alphabetical "also: <a>, <b>" (spec §5.3 / §6.3)
#
# The §10 worked example only ever has a single also-touches slug per row; the
# multi-slug comma+space join is otherwise unrendered.
# ---------------------------------------------------------------------------


def _multi_also_touches_result() -> ObjectiveGtStacksResult:
    return _single_row_result(
        ObjectiveGtStackRow(
            branch="feat/a",
            parent="main",
            depth=0,
            touches_objective=True,
            connector=False,
            also_touches=("beta", "gamma"),
            validation_result="OK",
            needs_restack=False,
        )
    )


def test_multi_also_touches_join_human(capsys) -> None:
    render_stacks_human(_multi_also_touches_result())
    out = capsys.readouterr().out

    assert "(also: beta, gamma)" in out


def test_multi_also_touches_join_markdown(capsys) -> None:
    render_stacks_markdown(_multi_also_touches_result())
    out = capsys.readouterr().out

    assert "(also: beta, gamma)" in out
