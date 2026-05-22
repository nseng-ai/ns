import? 'local.just'

# Skills sourced from nseng-ai/nonslop. Keep in sync with skills-lock.json.
nonslop_skills := "ns-changelog-update ns-create-py-dev-cli ns-create-pypackage-project ns-dignified-python ns-fake-driven-test-layout ns-py-fake-driven-testing ns-pytest ns-refac-cli-push-down ns-refactor-swarm ns-resolve-merge-conflicts ns-setup-dprint ns-setup-python-ci ns-skill-management ns-skillx nsx"

# Skill names (under ./skills/) linked into global agent skill directories by `install-tools`.
brmem_skills := "dev-brmem-branch-create dev-brmem-branch-impl"

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

ts-check: ts-install pi-stack-run-check
    bun run --cwd ts check

ts-test: ts-install pi-stack-run-test
    bun run --cwd ts test

pi-stack-run-install:
    bun install --cwd .pi/extensions/asdl-stack-run

pi-stack-run-check: pi-stack-run-install
    bun run --cwd .pi/extensions/asdl-stack-run check

pi-stack-run-test: pi-stack-run-install
    bun run --cwd .pi/extensions/asdl-stack-run test

js-test: ts-test

test:
    uv run pytest -n auto --ignore-glob='*/integration/*'

live-github-readonly repo:
    uv run pytest packages/asdl-core/live_conformance/github --run-live-github --github-conformance-repo {{repo}}

test-all:
    uv run pytest -n auto

nonslop-check:
    uv run nonslop check

refresh-nonslop:
    uv sync --upgrade-package nonslop
    npx skills add nseng-ai/nonslop --skill {{nonslop_skills}} --agent codex claude-code -y

# Install slot and brmem as editable uv tools, and symlink affiliated
# skills into ~/.claude/skills/ and ~/.codex/skills/ so both agents can discover them.
# Note: slot ships from asdl-slots; brmem ships from packages/brmem.
install-tools:
    uv tool install --force --editable {{justfile_directory()}}/packages/asdl-slots
    uv tool install --force --editable {{justfile_directory()}}/packages/brmem
    uv tool install --force --editable {{justfile_directory()}}/packages/asdl-objectives
    mkdir -p ~/.claude/skills ~/.codex/skills
    for skill in {{brmem_skills}}; do \
        ln -sfn {{justfile_directory()}}/skills/$skill ~/.claude/skills/$skill; \
        ln -sfn {{justfile_directory()}}/skills/$skill ~/.codex/skills/$skill; \
    done
    mkdir -p ~/.brmem/prompts
    ln -sfn {{justfile_directory()}}/.brmem/prompts/dev-brmem-branch-create.md \
            ~/.brmem/prompts/dev-brmem-branch-create.md
    @echo "installed: slot, brmem"
    @echo "linked:    {{brmem_skills}} -> ~/.claude/skills, ~/.codex/skills"
    @echo "linked:    ~/.brmem/prompts/dev-brmem-branch-create.md -> {{justfile_directory()}}/.brmem/prompts/dev-brmem-branch-create.md"

clean:
    rm -rf dist/*.whl dist/*.tar.gz
    find . -type d -name "__pycache__" -exec rm -rf {} + || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + || true
    find . -type d -name ".ruff_cache" -exec rm -rf {} + || true
    find . -type d -name "*.egg-info" -exec rm -rf {} + || true
    find . -type f -name "*.pyc" -delete || true

publish: clean check
    uv build --package asdl-tools --package brmem --package asdl-core --package asdl-dispatcher --package asdl-objectives --package asdl-pr-address --package asdl-reviewer --package asdl-slots
    uv publish
