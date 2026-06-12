import? 'local.just'

default: check

pbcopy-source-activate:
    uv sync
    @printf 'source %s/.venv/bin/activate' "{{justfile_directory()}}" | pbcopy
    @echo "Copied to clipboard — paste and press enter to activate."

check: python-check dprint-check ts-check js-test python-test

ci: python-check dprint-check ts-check js-test python-test-all

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

python-check: lint format-check ty

python-test: test

python-test-all: test-all

ts-install:
    pnpm --dir {{justfile_directory()}}/ts install

ts-check: ts-install
    pnpm --dir {{justfile_directory()}}/ts run check

ts-test: ts-install
    pnpm --dir {{justfile_directory()}}/ts run test

docs-install:
    pnpm --dir {{justfile_directory()}}/docs-site install

docs-dev: docs-install
    pnpm --dir {{justfile_directory()}}/docs-site run dev

docs-build: docs-install
    pnpm --dir {{justfile_directory()}}/docs-site run build

docs-check: docs-install
    pnpm --dir {{justfile_directory()}}/docs-site run check

js-test: ts-test

# Install the pr-address shim to ~/.local/bin so `pr-address` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an asdl checkout, this checkout's sources everywhere else.
install-pr-address: ts-install
    mkdir -p "$HOME/.local/bin"
    sed "s|@@ASDL_CANONICAL_CHECKOUT@@|{{justfile_directory()}}|" "{{justfile_directory()}}/ts/packages/pr-address/scripts/pr-address-shim" > "$HOME/.local/bin/pr-address"
    chmod +x "$HOME/.local/bin/pr-address"
    @echo "installed: $HOME/.local/bin/pr-address (canonical checkout: {{justfile_directory()}})"

# Link the planned-branch bin through pnpm so `planned-branch` is on PATH.
# The linked CLI uses the Node shebang from the TypeScript workspace source.
link-planned-branch: ts-install
    cd {{justfile_directory()}}/ts/packages/planned-branch && pnpm link
    @echo "linked: planned-branch (pnpm global bin)"

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

# Install slot, brmem, handoff, and asdl-objectives as editable uv tools.
# Note: slot ships from asdl-slots; brmem ships from packages/brmem.
install-tools:
    uv tool install --force --editable {{justfile_directory()}}/packages/asdl-slots
    uv tool install --force --editable {{justfile_directory()}}/packages/brmem
    uv tool install --force --editable {{justfile_directory()}}/packages/asdl-handoff
    uv tool install --force --editable {{justfile_directory()}}/packages/asdl-objectives
    @echo "installed: slot, brmem, handoff, objective"

clean:
    rm -rf dist/*.whl dist/*.tar.gz
    find . -type d -name "__pycache__" -exec rm -rf {} + || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + || true
    find . -type d -name ".ruff_cache" -exec rm -rf {} + || true
    find . -type d -name "*.egg-info" -exec rm -rf {} + || true
    find . -type f -name "*.pyc" -delete || true

publish: clean check
    uv build --package asdl-tools --package brmem --package asdl-core --package asdl-dispatcher --package asdl-handoff --package asdl-objectives --package aretro --package roaster --package asdl-slots --package vibechk
    uv publish
