from __future__ import annotations

import ast
from pathlib import Path

SRC_ROOT = Path("packages/asdl-slots/src/asdl_slots")
GT_ROOT = SRC_ROOT / "cli" / "slot" / "gt"
SLOT_GROUP = SRC_ROOT / "cli" / "slot" / "group.py"


def _source_files() -> tuple[Path, ...]:
    return tuple(sorted(SRC_ROOT.rglob("*.py")))


def _imports_forbidden_gt_module(tree: ast.AST, path: Path) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if module.startswith("asdl_slots.cli.slot.gt"):
                if path == SLOT_GROUP and module == "asdl_slots.cli.slot.gt.group":
                    names = {alias.name for alias in node.names}
                    if names == {"build_gt_group"}:
                        continue
                return True
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith("asdl_slots.cli.slot.gt"):
                    return True
    return False


def _is_subprocess_run(node: ast.Call) -> bool:
    func = node.func
    if isinstance(func, ast.Attribute):
        if func.attr != "run":
            return False
        value = func.value
        return isinstance(value, ast.Name) and value.id == "subprocess"
    if isinstance(func, ast.Name):
        return func.id == "run"
    return False


def _first_arg_is_gt_invocation(node: ast.Call) -> bool:
    if not node.args:
        return False
    first = node.args[0]
    if isinstance(first, ast.List):
        if not first.elts:
            return False
        head = first.elts[0]
        return isinstance(head, ast.Constant) and head.value == "gt"
    if isinstance(first, ast.Constant) and isinstance(first.value, str):
        stripped = first.value.strip()
        return stripped == "gt" or stripped.startswith("gt ")
    return False


def _invokes_gt_via_subprocess(tree: ast.AST) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and _is_subprocess_run(node):
            if _first_arg_is_gt_invocation(node):
                return True
    return False


def test_graphite_usage_stays_under_slot_gt_boundary() -> None:
    violations: list[str] = []
    for path in _source_files():
        if path.is_relative_to(GT_ROOT):
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        if _imports_forbidden_gt_module(tree, path):
            violations.append(f"{path}: imports asdl_slots.cli.slot.gt outside allowed mount")
        if _invokes_gt_via_subprocess(tree):
            violations.append(f"{path}: invokes gt via subprocess outside slot/gt")

    assert violations == []
