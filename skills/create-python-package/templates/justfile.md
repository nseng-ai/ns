# justfile template

**Target path:** `justfile`

No placeholders -- use as-is.

## Template

```justfile
default: qa

qa: check test

check: lint format-check ty

lint:
    uv run ruff check

format-check:
    uv run ruff format --check

fix:
    uv run ruff check --fix --unsafe-fixes
    uv run ruff format

ty:
    uv run ty check

test:
    uv run pytest -n auto

clean:
    rm -rf dist/*.whl dist/*.tar.gz
    find . -type d -name "__pycache__" -exec rm -rf {} + || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + || true
    find . -type d -name ".ruff_cache" -exec rm -rf {} + || true
    find . -type d -name "*.egg-info" -exec rm -rf {} + || true
    find . -type d -name ".ty" -exec rm -rf {} + || true
    find . -type f -name "*.pyc" -delete || true
```
