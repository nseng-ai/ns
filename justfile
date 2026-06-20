import? 'local.just'

ts_pnpm := 'corepack pnpm@11.8.0'

default: check

check: dprint-check ts-deps-check ts-guard ts-format-check ts-lint ts-check js-test

ci: check

dprint-check:
    dprint check

dprint-fix:
    dprint fmt

fix: dprint-fix ts-format-fix ts-lint-fix

ts-install:
    {{ts_pnpm}} --config.strict-dep-builds=false --dir {{justfile_directory()}}/ts install

ts-deps-check: ts-install
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run deps:check

ts-format-check: ts-install
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run fmt:check

ts-format-fix: ts-install
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run fmt

ts-lint: ts-install
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run lint

ts-lint-fix: ts-install
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run lint:fix

ts-check: ts-install
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run check

ts-guard:
    node {{justfile_directory()}}/ts/scripts/guard-no-as-unknown-as.mjs

ts-test: ts-install
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run test

ts-test-integration: ts-install
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run test:integration

docs-install:
    pnpm --dir {{justfile_directory()}}/docs-site install

docs-dev: docs-install
    pnpm --dir {{justfile_directory()}}/docs-site run dev

docs-build: docs-install
    pnpm --dir {{justfile_directory()}}/docs-site run build

docs-check: docs-install
    pnpm --dir {{justfile_directory()}}/docs-site run check

js-test: ts-test

# Install the slot shim to ~/.local/bin so `slot` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an asdl checkout, this checkout's sources everywhere else.
install-slot: (_install-ts-shim "slot" "ts/packages/slot/src/cli.ts" "just install-slot or just install-tools")
    rm -f "{{justfile_directory()}}/.venv/bin/slot"
    @echo "removed stale project venv slot script if present"

# Install the pr-address shim to ~/.local/bin so `pr-address` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an asdl checkout, this checkout's sources everywhere else.
install-pr-address: (_install-ts-shim "pr-address" "ts/packages/pr-address/src/cli.ts" "just install-pr-address")

# Install the roaster shim to ~/.local/bin so `roaster` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an asdl checkout, this checkout's sources everywhere else.
install-roaster: (_install-ts-shim "roaster" "ts/packages/roaster/src/cli.ts" "just install-roaster")

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

# Install the aretro shim to ~/.local/bin so `aretro` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an asdl checkout, this checkout's sources everywhere else.
install-aretro: (_install-ts-shim "aretro" "ts/packages/aretro/src/cli.ts" "just install-aretro")

# Install the objective shim to ~/.local/bin so `objective` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an asdl checkout, this checkout's sources everywhere else.
install-objective: (_install-ts-shim "objective" "ts/packages/objective/src/cli.ts" "just install-objective or just install-tools")
    rm -f "{{justfile_directory()}}/.venv/bin/objective"
    @echo "removed stale project venv objective script if present"

# Install the vibechk shim to ~/.local/bin so `vibechk` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an asdl checkout, this checkout's sources everywhere else.
install-vibechk: (_install-ts-shim "vibechk" "ts/packages/vibechk/src/cli.ts" "just install-vibechk")
    rm -f "{{justfile_directory()}}/.venv/bin/vibechk"
    @echo "removed stale project venv vibechk script if present"

# Install the packagechk shim to ~/.local/bin so `packagechk` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an asdl checkout, this checkout's sources everywhere else.
install-packagechk: (_install-ts-shim "packagechk" "ts/packages/packagechk/src/cli.ts" "just install-packagechk")
    rm -f "{{justfile_directory()}}/.venv/bin/packagechk"
    @echo "removed stale project venv packagechk script if present"

_install-ts-shim tool cli_rel_path install_hint: ts-install
    mkdir -p "$HOME/.local/bin"
    rm -f "$HOME/.local/bin/{{tool}}"
    ASDL_TOOL="{{tool}}" \
    ASDL_CANONICAL_CHECKOUT="{{justfile_directory()}}" \
    ASDL_CLI_REL_PATH="{{cli_rel_path}}" \
    ASDL_INSTALL_HINT="{{install_hint}}" \
    ASDL_TEMPLATE="{{justfile_directory()}}/ts/scripts/source-cli-shim-template" \
    ASDL_OUTPUT="$HOME/.local/bin/{{tool}}" \
      node "{{justfile_directory()}}/ts/scripts/render-cli-shim.mjs"
    chmod +x "$HOME/.local/bin/{{tool}}"
    @echo "installed: $HOME/.local/bin/{{tool}} (canonical checkout: {{justfile_directory()}})"

# Link the branch-context bin through pnpm so `branch-context` is on PATH.
# The linked CLI uses the Node shebang from the TypeScript workspace source.
link-branch-context: ts-install
    cd {{justfile_directory()}}/ts/packages/branch-context && {{ts_pnpm}} link
    @echo "linked: branch-context (pnpm global bin)"

areg-check: ts-install
    node {{justfile_directory()}}/ts/packages/areg/src/cli.ts check --path {{justfile_directory()}}

refresh-skills: ts-install
    node {{justfile_directory()}}/ts/packages/areg/src/cli.ts update-skills --path {{justfile_directory()}}

# Install public tools via TypeScript source shims.
install-tools: install-slot install-brmem install-handoff install-areg install-objective
    @echo "installed: slot, brmem, handoff, areg, and objective (TypeScript shims)"

clean:
    rm -rf dist/*.whl dist/*.tar.gz
    find . -type d -name "__pycache__" -exec rm -rf {} + || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + || true
    find . -type d -name ".ruff_cache" -exec rm -rf {} + || true
    find . -type d -name "*.egg-info" -exec rm -rf {} + || true
