import? 'local.just'

ts_pnpm := 'corepack pnpm@11.8.0'

default: check

check: dprint-check ts-deps-check ts-format-check ts-lint ts-check js-test

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

# Install the sdl shim to ~/.local/bin so `sdl` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an sdl checkout, this checkout's sources everywhere else.
install-sdl: (_install-ts-shim "sdl" "ts/packages/sdl/src/cli.ts" "just install-sdl or just install-tools")
    rm -f "{{justfile_directory()}}/.venv/bin/sdl"
    @echo "removed stale project venv sdl script if present"

# Install the pr-address shim to ~/.local/bin so `pr-address` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an sdl checkout, this checkout's sources everywhere else.
install-pr-address: (_install-ts-shim "pr-address" "ts/packages/pr-address/src/cli.ts" "just install-pr-address")

# Install the roaster shim to ~/.local/bin so `roaster` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an sdl checkout, this checkout's sources everywhere else.
install-roaster: (_install-ts-shim "roaster" "ts/packages/roaster/src/cli.ts" "just install-roaster")

# Install the brmem shim to ~/.local/bin so `brmem` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an sdl checkout, this checkout's sources everywhere else.
install-brmem: (_install-ts-shim "brmem" "ts/packages/infra/brmem/src/cli.ts" "just install-brmem or just install-tools")

# Install the areg shim to ~/.local/bin so `areg` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an sdl checkout, this checkout's sources everywhere else.
install-areg: (_install-ts-shim "areg" "ts/packages/tools/areg/src/cli.ts" "just install-areg or just install-tools")
    rm -f "{{justfile_directory()}}/.venv/bin/areg"
    @echo "removed stale project venv areg script if present"

# Install the aretro shim to ~/.local/bin so `aretro` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an sdl checkout, this checkout's sources everywhere else.
install-aretro: (_install-ts-shim "aretro" "ts/packages/aretro/src/cli.ts" "just install-aretro")

# Install the vibechk shim to ~/.local/bin so `vibechk` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an sdl checkout, this checkout's sources everywhere else.
install-vibechk: (_install-ts-shim "vibechk" "ts/packages/tools/vibechk/src/cli.ts" "just install-vibechk")
    rm -f "{{justfile_directory()}}/.venv/bin/vibechk"
    @echo "removed stale project venv vibechk script if present"

# Install the packagechk shim to ~/.local/bin so `packagechk` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an sdl checkout, this checkout's sources everywhere else.
install-packagechk: (_install-ts-shim "packagechk" "ts/packages/tools/packagechk/src/cli.ts" "just install-packagechk")
    rm -f "{{justfile_directory()}}/.venv/bin/packagechk"
    @echo "removed stale project venv packagechk script if present"

_install-ts-shim tool cli_rel_path install_hint: ts-install
    mkdir -p "$HOME/.local/bin"
    rm -f "$HOME/.local/bin/{{tool}}"
    SDL_TOOL="{{tool}}" \
    SDL_CANONICAL_CHECKOUT="{{justfile_directory()}}" \
    SDL_CLI_REL_PATH="{{cli_rel_path}}" \
    SDL_INSTALL_HINT="{{install_hint}}" \
    SDL_TEMPLATE="{{justfile_directory()}}/ts/scripts/source-cli-shim-template" \
    SDL_OUTPUT="$HOME/.local/bin/{{tool}}" \
      node "{{justfile_directory()}}/ts/scripts/render-cli-shim.mjs"
    chmod +x "$HOME/.local/bin/{{tool}}"
    @echo "installed: $HOME/.local/bin/{{tool}} (canonical checkout: {{justfile_directory()}})"

# Link the branch-context bin through pnpm so `branch-context` is on PATH.
# The linked CLI uses the Node shebang from the TypeScript workspace source.
link-branch-context: ts-install
    cd {{justfile_directory()}}/ts/packages/branch-context && {{ts_pnpm}} link
    @echo "linked: branch-context (pnpm global bin)"

areg-check: ts-install
    node {{justfile_directory()}}/ts/packages/tools/areg/src/cli.ts check --path {{justfile_directory()}}

refresh-skills: ts-install
    node {{justfile_directory()}}/ts/packages/tools/areg/src/cli.ts update-skills --path {{justfile_directory()}}

# Install public tools via TypeScript source shims.
install-tools: install-sdl install-brmem install-areg
    @echo "installed: sdl, brmem, and areg (TypeScript shims)"

clean:
    rm -rf dist/*.whl dist/*.tar.gz
    find . -type d -name "__pycache__" -exec rm -rf {} + || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + || true
    find . -type d -name ".ruff_cache" -exec rm -rf {} + || true
    find . -type d -name "*.egg-info" -exec rm -rf {} + || true
