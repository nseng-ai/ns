# Composite Action: setup-python-uv

**Target path:** `.github/actions/setup-python-uv/action.yml`

## Placeholder

- `<MIN_PYTHON>` -- Replace with the minimum supported Python version (e.g., `3.11`)

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
    - uses: astral-sh/setup-uv@v7
      with:
        python-version: ${{ inputs.python-version }}
    - name: Install dependencies
      shell: bash
      run: uv sync --python ${{ inputs.python-version }}
```
