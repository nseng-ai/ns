import? 'local.just'

# Skills sourced from nseng-ai/nonslop. Keep in sync with skills-lock.json.
nonslop_skills := "ns-changelog-update ns-create-py-dev-cli ns-create-pypackage-project ns-dignified-python ns-fake-driven-test-layout ns-py-fake-driven-testing ns-pytest ns-refac-cli-push-down ns-refactor-swarm ns-resolve-merge-conflicts ns-setup-dprint ns-setup-python-ci ns-skill-management ns-skillx nsx"

default: check

pbcopy-source-activate:
    uv sync
    @printf 'source %s/.venv/bin/activate' "{{justfile_directory()}}" | pbcopy
    @echo "Copied to clipboard — paste and press enter to activate."

check: lint format-check dprint-check ty test

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
    uv run pytest -n auto

nonslop-check:
    uv run nonslop check

fast-ci: check

refresh-nonslop:
    uv sync --upgrade-package nonslop
    npx skills add nseng-ai/nonslop --skill {{nonslop_skills}} --agent codex claude-code -y

clean:
    rm -rf dist/*.whl dist/*.tar.gz
    find . -type d -name "__pycache__" -exec rm -rf {} + || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + || true
    find . -type d -name ".ruff_cache" -exec rm -rf {} + || true
    find . -type d -name "*.egg-info" -exec rm -rf {} + || true
    find . -type f -name "*.pyc" -delete || true
