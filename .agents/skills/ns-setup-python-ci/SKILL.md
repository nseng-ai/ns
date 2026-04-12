---
name: ns-setup-python-ci
description: "Generate GitHub Actions CI workflow for Python projects using uv and just. Use when the user wants to set up CI, add GitHub Actions, create a CI workflow, configure continuous integration, or add automated testing to their project. Produces .github/workflows/python-ci.yml and .github/actions/setup-python-uv/action.yml with jobs for lint, format-check, ty, and test (with Python version matrix)."
references:
  - templates/composite-action
  - templates/ci-workflow
allowed-tools:
  - "Bash(mkdir *)"
  - "Bash(ls *)"
---

# setup-gh-ci

Generate a complete GitHub Actions CI setup for Python projects that use
uv, ruff, ty, pytest, and justfile.

## What it creates

1. `.github/actions/setup-python-uv/action.yml` -- reusable composite action
2. `.github/workflows/python-ci.yml` -- CI workflow with 4 jobs

## Preconditions

Before running this skill, the project must have:

- `pyproject.toml` with a `requires-python` field
- A `justfile` with `lint`, `format-check`, `ty`, and `test` recipes

If either is missing, stop and tell the user what's needed.

## Step-by-step workflow

### Step 1: Detect Python versions

1. Read `pyproject.toml` and extract the `requires-python` value
2. Parse the minimum Python version from the specifier (e.g., `>=3.11` -> `3.11`)
3. Using this known list of active Python minor versions: `3.10, 3.11, 3.12, 3.13, 3.14`
   enumerate all versions >= the minimum
4. If `requires-python` is missing or cannot be parsed, ask the user for the
   list of Python versions to test against
5. Present the derived version list to the user and ask for confirmation
   before proceeding

### Step 2: Create the composite action

Create the directory first: `mkdir -p .github/actions/setup-python-uv`

Create `.github/actions/setup-python-uv/action.yml` using the template from
`templates/composite-action.md`. Replace `<MIN_PYTHON>` with the minimum
supported Python version from Step 1.

### Step 3: Create the CI workflow

Create the directory first: `mkdir -p .github/workflows`

Create `.github/workflows/python-ci.yml` using the template from
`templates/ci-workflow.md`. Replace `<PYTHON_VERSIONS>` with the quoted,
comma-separated version list from Step 1 (e.g., `"3.11", "3.12", "3.13", "3.14"`).

### Step 4: Verify

Confirm both files were created:

```bash
ls .github/workflows/python-ci.yml .github/actions/setup-python-uv/action.yml
```

Report to the user that CI is set up and list the 4 jobs with the test
matrix versions.
