import? 'local.just'

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

fast-ci: check

update-nonslop-skills:
    #!/usr/bin/env bash
    set -euo pipefail
    skills=$(jq -r '.skills | to_entries | map(select(.value.source == "nseng-ai/nonslop")) | .[].key' skills-lock.json)
    if [ -z "$skills" ]; then
        echo "No nonslop skills found in skills-lock.json"
        exit 1
    fi
    echo "Updating nonslop skills:"
    echo "$skills" | sed 's/^/  - /'
    npx skills add nseng-ai/nonslop --skill $skills --agent codex claude-code -y

clean:
    rm -rf dist/*.whl dist/*.tar.gz
    find . -type d -name "__pycache__" -exec rm -rf {} + || true
    find . -type d -name ".pytest_cache" -exec rm -rf {} + || true
    find . -type d -name ".ruff_cache" -exec rm -rf {} + || true
    find . -type d -name "*.egg-info" -exec rm -rf {} + || true
    find . -type f -name "*.pyc" -delete || true
