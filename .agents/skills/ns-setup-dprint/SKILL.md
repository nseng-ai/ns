---
name: ns-setup-dprint
description: "Set up dprint formatting for Markdown and TOML files. Use when adding dprint to a project or integrating format checks into the build system."
allowed-tools:
  - "Bash(dprint *)"
  - "Bash(which dprint)"
  - "Bash(brew install dprint)"
  - "Bash(cargo install dprint)"
  - "Bash(ls *)"
---

# setup-dprint

Set up [dprint](https://dprint.dev) as the formatter for Markdown and TOML files in a project, with
build-system integration for check and fix workflows.

## Step 1: Check preconditions

Verify dprint is installed:

```bash
which dprint
```

If not found, install it:

- **macOS:** `brew install dprint`
- **Other:** `cargo install dprint`

## Step 2: Check for existing configuration

Look for `dprint.json` or `.dprint.json` in the project root.

- **If a config exists:** read it and go to [Step 8: Update existing configuration](#step-8-update-existing-configuration).
- **If no config exists:** continue with Step 3.

## Step 3: Create `dprint.json`

Load `references/plugin-catalog.md` for plugin URLs and default config blocks.

Write a `dprint.json` in the project root with this structure:

```json
{
  "markdown": {
    "lineWidth": 100
  },
  "toml": {
    "lineWidth": 100
  },
  "includes": [
    "**/*.md",
    "**/*.toml"
  ],
  "excludes": [
    ".agents",
    ".claude",
    "node_modules",
    ".venv",
    ".pytest_cache"
  ],
  "plugins": [
    "<markdown-plugin-url-from-catalog>",
    "<toml-plugin-url-from-catalog>"
  ]
}
```

Replace the plugin URLs with the actual URLs from `references/plugin-catalog.md`.

## Step 4: Add `.dprint/` to `.gitignore`

Check if `.gitignore` exists and whether it already contains `.dprint/`.

If not present, append:

```
# Formatting
.dprint/
```

## Step 5: Integrate with build system

Detect the project's build system and add dprint commands. Check in this order:

### justfile

If a `justfile` exists, add separate dprint recipes (do NOT append to existing language-specific recipes
like `format-check` or `fix`):

```just
dprint-check:
    dprint check

dprint-fix:
    dprint fmt
```

Then add `dprint-check` to the `check` dependency chain. For example, if the justfile has:

```just
check: lint format-check ty
```

Update it to:

```just
check: lint format-check dprint-check ty
```

### Makefile

If a `Makefile` exists:

- Add `dprint check` to a `format-check` or `lint` target.
- Add `dprint fmt` to a `fix` or `format` target.

### package.json

If a `package.json` exists, add scripts:

```json
"format:check": "dprint check",
"format:fix": "dprint fmt"
```

### None of the above

Create a `justfile` in the project root with the dprint recipes:

```just
check: dprint-check

dprint-check:
    dprint check

dprint-fix:
    dprint fmt
```

## Step 6: Add CI workflow

If the project uses GitHub Actions, add a CI workflow for dprint. Load `references/dprint-ci.yml` as
a template and copy it to `.github/workflows/dprint-ci.yml`.

Key details:

- Uses `dprint/check@v2.2` — no manual dprint installation needed in CI.
- Runs on pushes to the default branch and on pull requests (excluding drafts).
- Adjust the `branches` list if the default branch is not `master`.

## Step 7: Run initial format

Format all existing files and verify:

```bash
dprint fmt
dprint check
```

If `dprint check` reports violations after `dprint fmt`, investigate and fix.

## Step 8: Update existing configuration

When a `dprint.json` already exists (branched from Step 2):

1. Read the existing config.
2. Load `references/plugin-catalog.md` for plugin URLs.
3. Check which plugins are missing:
   - If no `markdown` plugin: add the markdown plugin URL to `plugins` and `"**/*.md"` to `includes`.
   - If no `toml` plugin: add the toml plugin URL to `plugins` and `"**/*.toml"` to `includes`.
4. Add any missing plugin config blocks (`"markdown": {...}`, `"toml": {...}`).
5. Do NOT overwrite existing config values -- only add what's missing.
6. Run `dprint fmt` and `dprint check` to verify.
