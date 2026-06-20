---
name: setup-pypi-publish
disable-model-invocation: true
# Full description commented out to save tokens (coding agents inject skill descriptions into every session):
# "Set up PyPI publishing for a Python project using uv build and uvx uv-publish. Use when adding publish support, setting up PyPI auth, adding build/publish justfile recipes, or fixing auth problems with uv publish."
description: "Command: setup-pypi-publish"
allowed-tools:
  - "Bash(ls *)"
  - "Bash(test -f *)"
  - "Bash(uv build *)"
  - "Bash(uvx uv-publish *)"
---

# setup-pypi-publish

Set up PyPI publishing for a Python project using `uv build` and `uvx uv-publish`.

## Why `uvx uv-publish` instead of `uv publish`

`uv publish` prompts for credentials interactively and can hang or fail in scripted contexts.
`uvx uv-publish` is a standalone tool that reads auth from keyring or environment variables and
never blocks waiting for input.

## Step 1: Check preconditions

Verify `pyproject.toml` exists in the project root. Check that it has `name`, `version`, and
`description` fields. If any are missing, stop and tell the user what needs to be added before
proceeding.

Detect if this is a uv workspace by looking for `[tool.uv.workspace]` in the root `pyproject.toml`.
If it is a workspace, list the member package names from the `members` field — you will need them in
Step 2.

## Step 2: Add justfile recipes

Check whether a `justfile` exists. If it does not, create one.

### Single-package project

Add `build` and `publish` recipes:

```just
build: clean
    uv build

publish: build
    uvx uv-publish
```

### uv workspace (multiple packages)

Add one `uv build --package <name>` line per member package:

```just
build: clean
    uv build --package pkg1
    uv build --package pkg2

publish: build
    uvx uv-publish
```

**Important:** `uv build` does not accept `--package` multiple times in a single invocation — each
package needs its own line.

### Updating existing recipes

If `build` and `publish` already exist, check whether `publish` calls `uv publish` (without `x`).
If so, replace it with `uvx uv-publish`. Leave everything else in the recipe unchanged.

## Step 3: Set up PyPI auth

Do **not** write credentials to the repo. Explain both options to the user:

**Option A: `~/.pypirc`**

```ini
[distutils]
index-servers = pypi

[pypi]
username = __token__
password = pypi-<your-token-here>
```

**Option B: environment variable**

```bash
export UV_PUBLISH_TOKEN=pypi-<your-token-here>
```

Add `UV_PUBLISH_TOKEN` to `.env.example` (if the project has one) as a reminder, with an empty
value:

```bash
UV_PUBLISH_TOKEN=
```

## Step 4: Verify

Run the build step to confirm the package(s) build cleanly:

```bash
uv build
# or for a workspace:
uv build --package pkg1
uv build --package pkg2
```

Report which wheels and sdists were produced, or surface any errors.
