import? 'local.just'

# Skills sourced from nseng-ai/nonslop. Keep in sync with skills-lock.json.
nonslop_skills := "ns-changelog-update ns-create-py-dev-cli ns-create-pypackage-project ns-dignified-python ns-fake-driven-test-layout ns-py-fake-driven-testing ns-pytest ns-refac-cli-push-down ns-refactor-swarm ns-resolve-merge-conflicts ns-setup-dprint ns-setup-python-ci ns-skill-management ns-skillx nsx"

# Skill names (under ./skills/) linked into global agent skill directories by `install-tools`.
brmem_skills := "brmem-branch-create brmem-branch-impl"

default: check

pbcopy-source-activate:
    uv sync
    @printf 'source %s/.venv/bin/activate' "{{justfile_directory()}}" | pbcopy
    @echo "Copied to clipboard — paste and press enter to activate."

check: lint format-check dprint-check ty test

ci: lint format-check dprint-check ty test-all

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

test:
    uv run pytest -n auto --ignore-glob='*/integration/*'

test-all:
    uv run pytest -n auto

nonslop-check:
    uv run nonslop check

refresh-nonslop:
    uv sync --upgrade-package nonslop
    npx skills add nseng-ai/nonslop --skill {{nonslop_skills}} --agent codex claude-code -y

# Install slot and brmem as editable uv tools, and symlink affiliated skills
# into ~/.claude/skills/ and ~/.codex/skills/ so both agents can discover them.
# Note: brmem ships from twerk-core, which also installs the `memjective` binary.
install-tools:
    uv tool install --force --editable {{justfile_directory()}}/packages/twerk-slots
    uv tool install --force --editable {{justfile_directory()}}/packages/twerk-core
    mkdir -p ~/.claude/skills ~/.codex/skills
    for skill in {{brmem_skills}}; do \
        ln -sfn {{justfile_directory()}}/skills/$skill ~/.claude/skills/$skill; \
        ln -sfn {{justfile_directory()}}/skills/$skill ~/.codex/skills/$skill; \
    done
    mkdir -p ~/.brmem/prompts
    ln -sfn {{justfile_directory()}}/.brmem/prompts/brmem-branch-create.md \
            ~/.brmem/prompts/brmem-branch-create.md
    @echo "installed: slot, brmem, memjective"
    @echo "linked:    {{brmem_skills}} -> ~/.claude/skills, ~/.codex/skills"
    @echo "linked:    ~/.brmem/prompts/brmem-branch-create.md -> {{justfile_directory()}}/.brmem/prompts/brmem-branch-create.md"

clean:
    rm -rf dist/*.whl dist/*.tar.gz
    find . -type d -name "__pycache__" -exec rm -rf {} + || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + || true
    find . -type d -name ".ruff_cache" -exec rm -rf {} + || true
    find . -type d -name "*.egg-info" -exec rm -rf {} + || true
    find . -type f -name "*.pyc" -delete || true

publish: clean check
    uv build --package twerk --package twerk-core --package twerk-dispatcher --package twerk-pr-address --package twerk-reviewer --package twerk-slots
    uv publish
