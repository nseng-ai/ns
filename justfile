import? 'local.just'

ts_pnpm := 'corepack pnpm@11.8.0'

default: check

check: _ts-workspace-ready (_run-parallel "_check-core" "_ts-test-typescript-style-guard")

# Run two recipes concurrently and fail if either recipe fails.
_run-parallel left right:
    @set -e; \
      left_status=0; \
      right_status=0; \
      just --justfile "{{justfile()}}" --working-directory "{{justfile_directory()}}" "{{left}}" & \
      left_pid=$!; \
      just --justfile "{{justfile()}}" --working-directory "{{justfile_directory()}}" "{{right}}" & \
      right_pid=$!; \
      wait "$left_pid" || left_status=$?; \
      wait "$right_pid" || right_status=$?; \
      if [ "$left_status" -ne 0 ] || [ "$right_status" -ne 0 ]; then \
        exit 1; \
      fi

_check-core: dprint-check _ts-deps-check _ts-format-check _ts-lint _ts-check _ts-test _objective-check

# Local equivalent of CI excluding docs-site and Reviews; local metadata checks remain included.
ci: _ts-workspace-ready (_run-parallel "check" "_ci-additional")

_ci-additional: (_run-parallel "ts-test-integration" "skill-exposure-check")

dprint-check:
    dprint check

dprint-fix:
    dprint fmt

fix: dprint-fix ts-format-fix ts-lint-fix

ts-install:
    {{ts_pnpm}} --config.strict-dep-builds=false --dir {{justfile_directory()}}/ts install

# Ensure the ts/ pnpm workspace dependencies are ready, skipping pnpm in the
# common case where dependency-shape inputs are older than the readiness stamp.
_ts-workspace-ready:
    @set -e; \
      root="{{justfile_directory()}}"; \
      ts_dir="$root/ts"; \
      stamp="$ts_dir/node_modules/.ns-workspace-ready.stamp"; \
      inputs_changed() { \
        if [ "$ts_dir/package.json" -nt "$stamp" ] || [ "$ts_dir/pnpm-lock.yaml" -nt "$stamp" ] || [ "$ts_dir/pnpm-workspace.yaml" -nt "$stamp" ]; then return 0; fi; \
        if find "$ts_dir/packages" -name package.json -not -path '*/node_modules/*' -newer "$stamp" -print -quit | grep -q .; then return 0; fi; \
        if [ -d "$ts_dir/patches" ] && find "$ts_dir/patches" -type f -newer "$stamp" -print -quit | grep -q .; then return 0; fi; \
        return 1; \
      }; \
      if [ -f "$ts_dir/node_modules/.modules.yaml" ] && [ -f "$stamp" ] && ! inputs_changed; then \
        exit 0; \
      fi; \
      {{ts_pnpm}} --config.strict-dep-builds=false --dir "$ts_dir" install; \
      mkdir -p "$ts_dir/node_modules"; \
      touch "$stamp"

ts-deps-check: _ts-workspace-ready _ts-deps-check

_ts-deps-check:
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run deps:check

ts-format-check: _ts-workspace-ready _ts-format-check

_ts-format-check:
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run fmt:check

ts-format-fix: _ts-workspace-ready _ts-format-fix

_ts-format-fix:
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run fmt

ts-lint: _ts-workspace-ready _ts-lint

_ts-lint:
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run lint

ts-lint-fix: _ts-workspace-ready _ts-lint-fix

_ts-lint-fix:
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run lint:fix

ts-check: _ts-workspace-ready _ts-check

_ts-check:
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run check

ts-test: _ts-workspace-ready _ts-test

_ts-test:
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run test

ts-test-integration: _ts-workspace-ready _ts-test-integration

_ts-test-integration:
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run test:integration

ts-test-isolated: _ts-workspace-ready _ts-test-isolated

_ts-test-isolated:
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run test:isolated

ts-test-typescript-style-guard: _ts-workspace-ready _ts-test-typescript-style-guard

_ts-test-typescript-style-guard:
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run test:typescript-style-guard

docs-install:
    pnpm --dir {{justfile_directory()}}/docs-site install

docs-dev: docs-install
    pnpm --dir {{justfile_directory()}}/docs-site run dev

docs-build: docs-install
    pnpm --dir {{justfile_directory()}}/docs-site run build

docs-check: docs-install
    pnpm --dir {{justfile_directory()}}/docs-site run check

js-test: ts-test

bump-version VERSION: _ts-workspace-ready
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run release:bump-version {{VERSION}}

publish-dry-run VERSION: _ts-workspace-ready
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run release:publish-dry-run {{VERSION}}

publish VERSION: _ts-workspace-ready
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run release:publish {{VERSION}}

# Read-only transactional release preflight and plan.
release-plan VERSION: _ts-workspace-ready
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run release --plan {{VERSION}}

# Safely inspect or reset a provably pre-checkpoint release attempt.
release-reset VERSION *args: _ts-workspace-ready
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run release:reset {{VERSION}} {{args}}

# Fresh transactional release or automatic exact same-version resume.
release VERSION *args: _ts-workspace-ready
    {{ts_pnpm}} --config.verify-deps-before-run=false --dir {{justfile_directory()}}/ts run release {{VERSION}} {{args}}

# Install the ns shim to ~/.local/bin so `ns` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an sdl checkout, this checkout's sources everywhere else.
# The source @nseng-ai/ns manifest no longer advertises a workspace bin.
# Remove legacy links left by the earlier package layout during safe upgrades;
# ts/node_modules/.bin commonly precedes ~/.local/bin on PATH.
install-ns: (_install-ts-shim "ns" "ts/packages/public/ns/src/cli.ts" "just install-ns or just install-tools")
    rm -f "{{justfile_directory()}}/ts/node_modules/.bin/ns"
    @echo "removed stale workspace ns shim if present"
    rm -f "{{justfile_directory()}}/.venv/bin/ns"
    @echo "removed stale project venv ns script if present"

# Install the brmem shim to ~/.local/bin so `brmem` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an sdl checkout, this checkout's sources everywhere else.
install-brmem: (_install-ts-shim "brmem" "ts/packages/public/infra/brmem/src/cli.ts" "just install-brmem or just install-tools")

# Install the vibechk shim to ~/.local/bin so `vibechk` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an sdl checkout, this checkout's sources everywhere else.
install-vibechk: (_install-ts-shim "vibechk" "ts/packages/incubating/tools/vibechk/src/cli.ts" "just install-vibechk or just install-tools")
    rm -f "{{justfile_directory()}}/.venv/bin/vibechk"
    @echo "removed stale project venv vibechk script if present"

# Install the packagechk shim to ~/.local/bin so `packagechk` on PATH runs the
# TypeScript CLI from source: the enclosing checkout's sources when invoked
# inside an sdl checkout, this checkout's sources everywhere else.
install-packagechk: (_install-ts-shim "packagechk" "ts/packages/public/tools/packagechk/src/cli.ts" "just install-packagechk or just install-tools")
    rm -f "{{justfile_directory()}}/.venv/bin/packagechk"
    @echo "removed stale project venv packagechk script if present"

_install-ts-shim tool cli_rel_path install_hint: ts-install
    mkdir -p "$HOME/.local/bin"
    rm -f "$HOME/.local/bin/{{tool}}"
    NS_TOOL="{{tool}}" \
    NS_CANONICAL_CHECKOUT="{{justfile_directory()}}" \
    NS_CLI_REL_PATH="{{cli_rel_path}}" \
    NS_INSTALL_HINT="{{install_hint}}" \
    NS_TEMPLATE="{{justfile_directory()}}/ts/scripts/source-cli-shim-template" \
    NS_OUTPUT="$HOME/.local/bin/{{tool}}" \
      {{ts_pnpm}} --dir "{{justfile_directory()}}/ts" exec ns-dev render-cli-shim
    chmod +x "$HOME/.local/bin/{{tool}}"
    @echo "installed: $HOME/.local/bin/{{tool}} (canonical checkout: {{justfile_directory()}})"

# Retired: Branch Context is exposed through `ns branch-context ...`, not a
# standalone `branch-context` binary.
link-branch-context:
    @echo "branch-context standalone binary is retired; use: ns branch-context ..." >&2
    @exit 2

_remove-stale-branch-context-bin:
    rm -f "$HOME/.local/bin/branch-context"
    rm -f "{{justfile_directory()}}/ts/node_modules/.bin/branch-context"
    @echo "removed stale standalone branch-context shims if present"

# Repo-wide Objective edge/blocked structural sweep (Record Frontmatter linter).
objective-check: _ts-workspace-ready _objective-check

_objective-check:
    node {{justfile_directory()}}/ts/packages/public/ns/src/cli.ts objective check --all

# Repo-wide Skill Exposure Policy sweep. Discovery belongs to this consumer
# gate; the extension itself intentionally accepts only explicit skill paths.
skill-exposure-check: _ts-workspace-ready
    @set -e; \
      root="{{justfile_directory()}}"; \
      set --; \
      for skill_md in $(find "$root/skills/public" "$root/skills/incubating" "$root/skills/internal" -type f -name SKILL.md -print | sort); do \
        set -- "$@" "${skill_md%/SKILL.md}"; \
      done; \
      for skill in "$root"/.agents/skills/*; do \
        if [ -d "$skill" ] && [ ! -L "$skill" ]; then set -- "$@" "$skill"; fi; \
      done; \
      if [ "$#" -eq 0 ]; then echo "No skills found for exposure check." >&2; exit 1; fi; \
      cd "$root"; \
      node "$root/ts/packages/public/ns/src/cli.ts" skill-exposure check "$@"

# Render the architecture topology report (raw inventory) and open it. No agent
# in the loop — extracts the package graph and renders from a synthesized spec.
# Pass --no-open to print the path only, or any extract-graph flag (--root, --kit, ...).
topology *args:
    {{justfile_directory()}}/skills/internal/review-system/architecture-topology-report/scripts/topology {{args}}

# Install public tools via TypeScript source shims.
install-tools: _remove-stale-branch-context-bin install-ns install-brmem install-vibechk install-packagechk
    @echo "installed: ns, brmem, vibechk, and packagechk (TypeScript shims); branch-context is available via ns branch-context"

clean-stale-node-modules-leftovers:
    node {{justfile_directory()}}/scripts/clean-stale-node-modules-leftovers.mjs

clean-stale-node-modules-leftovers-apply:
    node {{justfile_directory()}}/scripts/clean-stale-node-modules-leftovers.mjs --apply

clean:
    rm -rf dist/*.whl dist/*.tar.gz
    find . -type d -name "__pycache__" -exec rm -rf {} + || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + || true
    find . -type d -name ".ruff_cache" -exec rm -rf {} + || true
    find . -type d -name "*.egg-info" -exec rm -rf {} + || true
