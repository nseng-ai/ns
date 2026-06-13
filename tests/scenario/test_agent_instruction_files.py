from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
IGNORED_DIRECTORY_NAMES = {
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".ty",
    ".venv",
    "__pycache__",
    "build",
    "dist",
    "node_modules",
}


def _agents_files_under(directory: Path) -> list[Path]:
    agents_paths: list[Path] = []

    for child in sorted(directory.iterdir()):
        if child.name in IGNORED_DIRECTORY_NAMES:
            continue
        if child.is_dir():
            agents_paths.extend(_agents_files_under(child))
        elif child.name == "AGENTS.md":
            agents_paths.append(child)

    return agents_paths


def _agents_files() -> list[Path]:
    return _agents_files_under(REPO_ROOT)


def test_all_agents_files_have_adjacent_claude_include() -> None:
    missing_claude_paths: list[Path] = []
    malformed_claude_paths: list[Path] = []

    for agents_path in _agents_files():
        claude_path = agents_path.with_name("CLAUDE.md")
        if not claude_path.is_file():
            missing_claude_paths.append(claude_path.relative_to(REPO_ROOT))
            continue

        if "@AGENTS.md" not in claude_path.read_text(encoding="utf-8"):
            malformed_claude_paths.append(claude_path.relative_to(REPO_ROOT))

    assert missing_claude_paths == []
    assert malformed_claude_paths == []
