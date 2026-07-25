# Set up dprint

**Scope:** Set up dprint formatting for Markdown and TOML files locally, with
build-system integration. This playbook does not add GitHub Actions CI.

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

- **If a config exists:** read it and go to [Step 7: Update existing configuration](#step-7-update-existing-configuration).
- **If no config exists:** continue with Step 3.

## Step 3: Create `dprint.json`

Copy `../assets/dprint-default.json` (this skill's complete default template, plugin URLs included) to the project root as `dprint.json`. The template is the single source for the default config; load `dprint-plugin-catalog.md` only when you need per-plugin rationale or option notes.

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

If a `Makefile` exists, add dedicated targets mirroring the justfile recipes (recipe lines must be tab-indented):

```make
dprint-check:
	dprint check

dprint-fix:
	dprint fmt
```

Then add `dprint-check` to the prerequisites of the aggregate check target — prefer an existing `check` target, else `lint`. For example, `check: lint format-check` becomes `check: lint format-check dprint-check`.

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

## Step 6: Run initial format

Format all existing files and verify:

```bash
dprint fmt
dprint check
```

If `dprint check` reports violations after `dprint fmt`, investigate and fix.

## Step 7: Update existing configuration

When a `dprint.json` already exists (branched from Step 2):

1. Read the existing config.
2. Read `../assets/dprint-default.json` for the plugin URLs and default config blocks.
3. Check which plugins are missing:
   - If no `markdown` plugin: add the markdown plugin URL to `plugins` and `"**/*.md"` to `includes`.
   - If no `toml` plugin: add the toml plugin URL to `plugins` and `"**/*.toml"` to `includes`.
4. Add any missing plugin config blocks (`"markdown": {...}`, `"toml": {...}`).
5. Do NOT overwrite existing config values -- only add what's missing.
6. Run `dprint fmt` and `dprint check` to verify.

## Next steps

To add a GitHub Actions workflow that runs `dprint check` on pushes and PRs,
continue with [Set up dprint GitHub Actions CI](setup-dprint-gh-ci.md).
