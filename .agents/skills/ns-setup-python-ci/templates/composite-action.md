# Composite Action: setup-python-uv

**Target path:** `.github/actions/setup-python-uv/action.yml`

## Placeholders

- `<MIN_PYTHON>` -- Replace with the minimum supported Python version (e.g., `3.11`)
- `<SETUP_UV_REF>` -- Replace with the resolved ref from SKILL.md Step 2
  (e.g., `cec208311dfd045dd5311c1add060b2062131d57 # v8.0.0`, or `v8` on fallback)

## Template

```yaml
name: "Setup Python with uv"
description: "Install Python, uv, and sync dependencies"

inputs:
  python-version:
    description: "Python version to use"
    required: false
    default: "<MIN_PYTHON>"

runs:
  using: "composite"
  steps:
    # astral-sh/setup-uv is SHA-pinned so a moved tag cannot silently
    # change CI behavior. To bump, re-run the ns-setup-python-ci skill,
    # or resolve the latest release manually:
    #   TAG=$(gh api repos/astral-sh/setup-uv/releases/latest --jq .tag_name)
    #   SHA=$(gh api "repos/astral-sh/setup-uv/commits/$TAG" --jq .sha)
    - uses: astral-sh/setup-uv@<SETUP_UV_REF>
      with:
        python-version: ${{ inputs.python-version }}
        # Cache uv's download + wheel cache across runs.
        enable-cache: "auto"
        # Invalidate the cache when deps change. **/ handles monorepo layouts.
        cache-dependency-glob: |
          **/uv.lock
          **/pyproject.toml
    - name: Install dependencies
      shell: bash
      run: uv sync --python ${{ inputs.python-version }}
```
