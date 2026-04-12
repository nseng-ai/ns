# Starter command: clean-pyproject

**Target path:** `packages/<DEV_PROJECT_NAME>/src/<DEV_PACKAGE_NAME>/commands/clean_pyproject/command.py`

## Placeholders

- `<DEV_PACKAGE_NAME>` -- dev import name (e.g., `my_cool_lib_dev`)
- `<DEV_CONTEXT_CLASS>` -- context class name (e.g., `MyCoolLibDevContext`)

## Template

```python
"""Clean Python project cache and build artifacts."""

import shutil
from pathlib import Path

import click

from <DEV_PACKAGE_NAME>.cli.output import user_output
from <DEV_PACKAGE_NAME>.context import <DEV_CONTEXT_CLASS>


def find_directories(repo_root: Path, name: str) -> list[Path]:
    """Recursively find directories matching name under repo_root."""
    return [d for d in repo_root.rglob(name) if d.is_dir()]


def find_files(repo_root: Path, pattern: str) -> list[Path]:
    """Recursively find files matching pattern under repo_root."""
    return [f for f in repo_root.rglob(pattern) if f.is_file()]


def remove_path(path: Path, dry_run: bool, verbose: bool) -> bool:
    """Remove a file or directory. Returns True if action was taken."""
    if dry_run:
        user_output(f"  Would delete: {path}")
        return True

    if verbose:
        user_output(f"  Deleting: {path}")

    if path.is_symlink() or path.is_file():
        path.unlink()
    else:
        shutil.rmtree(path)
    return True


@click.command(name="clean-pyproject")
@click.option("--dry-run", is_flag=True, help="Show what would be deleted")
@click.option("--verbose", is_flag=True, help="Show detailed output")
@click.pass_context
def clean_pyproject_command(ctx: click.Context, dry_run: bool, verbose: bool) -> None:
    """Clean Python project cache and build artifacts."""
    dev_ctx: <DEV_CONTEXT_CLASS> = ctx.obj
    repo_root = dev_ctx.repo_root

    deleted_count = 0

    # Clean directory types
    dir_patterns = ["__pycache__", ".pytest_cache", ".ruff_cache", "*.egg-info"]
    for pattern in dir_patterns:
        dirs = find_directories(repo_root, pattern)
        for d in dirs:
            if remove_path(d, dry_run, verbose):
                deleted_count += 1

    # Clean dist artifacts
    dist_dir = repo_root / "dist"
    if dist_dir.exists():
        for pattern in ["*.whl", "*.tar.gz"]:
            for f in dist_dir.glob(pattern):
                if remove_path(f, dry_run, verbose):
                    deleted_count += 1

    # Clean .pyc files
    for f in find_files(repo_root, "*.pyc"):
        if remove_path(f, dry_run, verbose):
            deleted_count += 1

    if deleted_count > 0:
        action = "Would delete" if dry_run else "Deleted"
        user_output(f"{action} {deleted_count} items")
    else:
        user_output("Nothing to clean")
```
