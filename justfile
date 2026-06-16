import? 'local.just'

default: check

pbcopy-source-activate:
    uv sync
    @printf 'source %s/.venv/bin/activate' "{{justfile_directory()}}" | pbcopy
    @echo "Copied to clipboard — paste and press enter to activate."

check: agent-instructions-check python-check dprint-check ts-check js-test python-test

ci: agent-instructions-check python-check dprint-check ts-check js-test python-test-all

lint:
    uv run ruff check

format-check:
    uv run ruff format --check

agent-instructions-check:
    uv run pytest tests/scenario/test_agent_instruction_files.py

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
install-pr-address: (_install-ts-shim "pr-address" "ts/packages/pr-address/src/cli.ts" "just install-pr-address")

# Install the brmem shim to ~/.local/bin so `brmem` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an asdl checkout, this checkout's sources everywhere else.
install-brmem: (_install-ts-shim "brmem" "ts/packages/brmem/src/cli.ts" "just install-brmem or just install-tools")

# Install the handoff shim to ~/.local/bin so `handoff` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an asdl checkout, this checkout's sources everywhere else.
install-handoff: (_install-ts-shim "handoff" "ts/packages/handoff/src/cli.ts" "just install-handoff or just install-tools")
    rm -f "{{justfile_directory()}}/.venv/bin/handoff"
    @echo "removed stale project venv handoff script if present"

# Install the areg shim to ~/.local/bin so `areg` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an asdl checkout, this checkout's sources everywhere else.
install-areg: (_install-ts-shim "areg" "ts/packages/areg/src/cli.ts" "just install-areg or just install-tools")
    rm -f "{{justfile_directory()}}/.venv/bin/areg"
    @echo "removed stale project venv areg script if present"

_install-ts-shim tool cli_rel_path install_hint: ts-install
    mkdir -p "$HOME/.local/bin"
    rm -f "$HOME/.local/bin/{{tool}}"
    ASDL_TOOL="{{tool}}" \
    ASDL_CANONICAL_CHECKOUT="{{justfile_directory()}}" \
    ASDL_CLI_REL_PATH="{{cli_rel_path}}" \
    ASDL_INSTALL_HINT="{{install_hint}}" \
    ASDL_TEMPLATE="{{justfile_directory()}}/ts/scripts/source-cli-shim-template" \
    ASDL_OUTPUT="$HOME/.local/bin/{{tool}}" \
      python "{{justfile_directory()}}/ts/scripts/render-cli-shim.py"
    chmod +x "$HOME/.local/bin/{{tool}}"
    @echo "installed: $HOME/.local/bin/{{tool}} (canonical checkout: {{justfile_directory()}})"

# Link the branch-context bin through pnpm so `branch-context` is on PATH.
# The linked CLI uses the Node shebang from the TypeScript workspace source.
link-branch-context: ts-install
    cd {{justfile_directory()}}/ts/packages/branch-context && pnpm link
    @echo "linked: branch-context (pnpm global bin)"

test:
    uv run pytest -n auto --ignore-glob='*/integration/*'

live-github-readonly repo:
    uv run pytest packages/asdl-core/live_conformance/github --run-live-github --github-conformance-repo {{repo}}

test-all:
    uv run pytest -n auto

areg-check: ts-install
    node {{justfile_directory()}}/ts/packages/areg/src/cli.ts check --path {{justfile_directory()}}

refresh-skills: ts-install
    node {{justfile_directory()}}/ts/packages/areg/src/cli.ts update-skills --path {{justfile_directory()}}

# Install public tools: slot and objective as editable uv tools;
# brmem, handoff, and areg via TypeScript source shims.
install-tools: install-brmem install-handoff install-areg
    uv tool install --force --editable {{justfile_directory()}}/packages/asdl-slots
    uv tool install --force --editable {{justfile_directory()}}/packages/asdl-objectives
    @echo "installed: slot, brmem (TypeScript shim), handoff (TypeScript shim), areg (TypeScript shim), objective"

clean:
    rm -rf dist/*.whl dist/*.tar.gz
    find . -type d -name "__pycache__" -exec rm -rf {} + || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + || true
    find . -type d -name ".ruff_cache" -exec rm -rf {} + || true
    find . -type d -name "*.egg-info" -exec rm -rf {} + || true
    find . -type f -name "*.pyc" -delete || true

publish: clean check
    uv build --package asdl-tools --package asdl-core --package asdl-dispatcher --package asdl-objectives --package aretro --package asdl-slots --package vibechk
    uv publish
