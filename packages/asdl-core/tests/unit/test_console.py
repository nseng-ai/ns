from __future__ import annotations

from rich import box
from rich.table import Table

from asdl_core.console import make_table


def test_make_table_returns_styled_table() -> None:
    table = make_table()
    assert isinstance(table, Table)
    assert table.box is box.SIMPLE_HEAD
    assert table.header_style == "bold cyan"
    assert table.show_header is True
    assert table.pad_edge is False


def test_make_table_can_hide_header() -> None:
    table = make_table(show_header=False)
    assert table.show_header is False
