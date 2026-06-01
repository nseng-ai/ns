import? 'local.just'

default: check

pbcopy-source-activate:
    uv sync
    @printf 'source %s/.venv/bin/activate' "{{justfile_directory()}}" | pbcopy
    @echo "Copied to clipboard — paste and press enter to activate."

check: lint format-check dprint-check ty ts-check test

ci: lint format-check dprint-check ty ts-check test-all

lint:
    uv run ruff check

format-check:
    uv run ruff format --check

dprint-check:
    dprint check

dprint-fix:
    dprint fmt

fix:
    uv run ruff check --fix --unsafe-fixes
    uv run ruff format

ty:
    uv run ty check

ts-install:
    bun install --cwd ts

ts-check: ts-install
    bun run --cwd ts check

ts-test: ts-install
    bun run --cwd ts test

docs-install:
    bun install --cwd docs-site

docs-dev: docs-install
    bun run --cwd docs-site dev

docs-build: docs-install
    bun run --cwd docs-site build

docs-check: docs-install
    bun run --cwd docs-site check

js-test: ts-test

test:
    uv run pytest -n auto --ignore-glob='*/integration/*'

live-github-readonly repo:
    uv run pytest packages/asdl-core/live_conformance/github --run-live-github --github-conformance-repo {{repo}}

test-all:
    uv run pytest -n auto

areg-check:
    uv run areg check

refresh-skills:
    uv run areg update-skills

# Install slot, brmem, and asdl-objectives as editable uv tools.
# Note: slot ships from asdl-slots; brmem ships from packages/brmem.
install-tools:
    uv tool install --force --editable {{justfile_directory()}}/packages/asdl-slots
    uv tool install --force --editable {{justfile_directory()}}/packages/brmem
    uv tool install --force --editable {{justfile_directory()}}/packages/asdl-objectives
    @echo "installed: slot, brmem"

clean:
    rm -rf dist/*.whl dist/*.tar.gz
    find . -type d -name "__pycache__" -exec rm -rf {} + || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + || true
    find . -type d -name ".ruff_cache" -exec rm -rf {} + || true
    find . -type d -name "*.egg-info" -exec rm -rf {} + || true
    find . -type f -name "*.pyc" -delete || true

publish: clean check
    uv build --package asdl-tools --package brmem --package asdl-core --package asdl-dispatcher --package asdl-objectives --package asdl-pr-address --package aretro --package roaster --package asdl-slots --package vibechk
    uv publish
