---
name: ns-setup-python-ci
description: Command
# Original description (preserved for reference):
# Generate GitHub Actions CI workflow for Python projects using uv and just. Use when the user wants to set up CI, add GitHub Actions, create a CI workflow, configure continuous integration, or add automated testing to their project. Produces .github/workflows/python-ci.yml and .github/actions/setup-python-uv/action.yml with jobs for lint, format-check, ty, and test (with Python version matrix).
references:
  - templates/composite-action
  - templates/ci-workflow
allowed-tools:
  - "Bash(mkdir *)"
  - "Bash(ls *)"
  - "Bash(command -v *)"
  - "Bash(gh auth status*)"
  - "Bash(gh api *)"
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

### Step 2: Resolve the `astral-sh/setup-uv` pin

The composite action SHA-pins `astral-sh/setup-uv` so that a moved tag
cannot silently change CI behavior. Resolve the current latest stable
release at skill-run time so the generated file starts fresh instead of
baking a stale SHA into the template.

1. Check that `gh` is available and authenticated:

   ```bash
   command -v gh >/dev/null && gh auth status >/dev/null 2>&1
   ```

2. If available, resolve the latest release tag and its commit SHA:

   ```bash
   TAG=$(gh api repos/astral-sh/setup-uv/releases/latest --jq .tag_name)
   SHA=$(gh api "repos/astral-sh/setup-uv/commits/$TAG" --jq .sha)
   ```

   The `/commits/{ref}` endpoint accepts a tag name and returns the
   commit SHA directly, so it handles both lightweight and annotated
   tags without a second dereference call.

3. Set the ref string that will be substituted into the template:

   - **Success:** `SETUP_UV_REF="$SHA # $TAG"`
     (e.g., `cec208311dfd045dd5311c1add060b2062131d57 # v8.0.0`)
   - **Fallback** (gh missing, unauthenticated, or API call fails):
     `SETUP_UV_REF="v8"`. Warn the user that the pin is tag-only and
     that they should re-run the skill (or manually SHA-pin) once `gh`
     is authenticated.

4. Show the resolved ref to the user before writing the file.

### Step 3: Create the composite action

Create the directory first: `mkdir -p .github/actions/setup-python-uv`

Create `.github/actions/setup-python-uv/action.yml` using the template from
`templates/composite-action.md`. Replace:

- `<MIN_PYTHON>` with the minimum supported Python version from Step 1.
- `<SETUP_UV_REF>` with the value resolved in Step 2.

If Step 2 hit the fallback path (`<SETUP_UV_REF>` = `v8`), also remove
the "SHA-pinned" comment block above the `- uses: astral-sh/setup-uv@...`
line, since it no longer applies. Leave the cache-related comments in
place.

### Step 4: Create the CI workflow

Create the directory first: `mkdir -p .github/workflows`

Create `.github/workflows/python-ci.yml` using the template from
`templates/ci-workflow.md`. Replace `<PYTHON_VERSIONS>` with the quoted,
comma-separated version list from Step 1 (e.g., `"3.11", "3.12", "3.13", "3.14"`).

### Step 5: Verify

Confirm both files were created:

```bash
ls .github/workflows/python-ci.yml .github/actions/setup-python-uv/action.yml
```

Report to the user that CI is set up and list the 4 jobs with the test
matrix versions.
