from __future__ import annotations

import ast
from pathlib import Path

SRC_ROOT = Path("packages/asdl-objectives/src/asdl_objectives")


def _source_files() -> tuple[Path, ...]:
    return tuple(sorted(SRC_ROOT.rglob("*.py")))


def _imports_gt_module(tree: ast.AST) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if module.startswith("asdl_core.gt"):
                return True
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith("asdl_core.gt"):
                    return True
    return False


def test_objectives_do_not_depend_on_graphite_gateway() -> None:
    violations: list[str] = []
    for path in _source_files():
        tree = ast.parse(path.read_text(encoding="utf-8"))
        if _imports_gt_module(tree):
            violations.append(f"{path}: imports asdl_core.gt")

    assert violations == []
