---
name: create-bun-typescript-project
# Full description commented out to save tokens (coding agents inject skill descriptions into every session):
# "Scaffold a well-structured Bun-centric TypeScript project. Use when the user wants to create a new TypeScript project, set up a Bun project, bootstrap a TS library or CLI, or start a new TS repo with modern tooling. Creates the full structure: package.json (Bun, no build step), strict ESM tsconfig.json, oxlint + oxfmt orchestrated by ultracite, bun test --sequential, bunfig.toml, and .gitignore. Bun runs TypeScript directly — no bundler, no dist/. Produces a project that passes `bun run check`, `bunx tsc --noEmit`, and `bun test --sequential` immediately. Run when the user says things like 'set up a new TypeScript project', 'create a Bun project', 'scaffold a TS CLI', or 'initialize a bun-centric repo'."
description: "Command: create-bun-typescript-project"
references:
  - templates/package-json
  - templates/tsconfig
  - templates/oxc-config
  - templates/gitignore
  - templates/source-files
allowed-tools:
  - "Bash(bun *)"
  - "Bash(bunx *)"
  - "Bash(mkdir *)"
---

# create-bun-typescript-project

Scaffold a complete Bun-centric TypeScript project with modern tooling. Bun runs
TypeScript directly, so there is **no bundler and no build step** — `src/*.ts` is
both the source and what runs. The result is an opinionated, production-ready
layout that passes `bun run check`, `bunx tsc --noEmit`, and
`bun test --sequential` on first run.

This skill is intentionally Bun-centric product guidance. Use it when the user
wants a Bun project; do not treat it as the default TypeScript template for
existing Node, pnpm, or Vitest workspaces, or for migrations away from Bun.

## Stack

| Concern                   | Tool                                                                     |
| ------------------------- | ------------------------------------------------------------------------ |
| Runtime + package manager | Bun (runs TypeScript directly — no build step)                           |
| Lint                      | oxlint                                                                   |
| Format                    | oxfmt                                                                    |
| Lint/format orchestration | ultracite (`check` / `fix`)                                              |
| Test runner               | `bun test --sequential` (built-in)                                       |
| Type checker              | `tsc --noEmit` (strict ESM)                                              |
| Layout                    | `src/` + `tests/`                                                        |
| Task runner               | `package.json` scripts (`bun run <script>`)                              |
| Config                    | package.json, tsconfig.json, .oxlintrc.json, .oxfmtrc.jsonc, bunfig.toml |

No bundler, no `tsup`, no `dist/`, no Turborepo, no ESLint/Prettier, no Jest/Vitest.

## Preconditions

Before running this skill, the following must already be true:

- The current directory is a git repo (`git init` has been run)
- The user has `bun` installed (`bun --version` works)
- `.agents/`, `.claude/`, and `skills/` directories may or may not exist

## Information to collect

Ask the user for these values before scaffolding. Use the defaults shown if the
user does not specify.

| Value                | Variable       | Example                                     | Default                     |
| -------------------- | -------------- | ------------------------------------------- | --------------------------- |
| Project name         | `PROJECT_NAME` | `my-cool-tool`                              | -- (required)               |
| One-line description | `DESCRIPTION`  | `A tool for cool things`                    | `Add your description here` |
| Author name          | `AUTHOR_NAME`  | `Jane Smith`                                | -- (required)               |
| Author email         | `AUTHOR_EMAIL` | `jane@example.com`                          | -- (required)               |
| License              | `LICENSE_TYPE` | `MIT`, `Apache-2.0`, `BSD-3-Clause`, `none` | `MIT`                       |
| CLI entry point?     | `HAS_CLI`      | yes / no                                    | no                          |

Derive these automatically:

- `BUN_VERSION`: the output of `bun --version` (e.g., `1.3.6`). Used for the
  `packageManager` field as `bun@<BUN_VERSION>`.

## Conventions (the generated code must follow these)

These follow from the strict tsconfig and the oxc toolchain. Code that ignores
them will fail `bunx tsc --noEmit` or `bun run check`.

- **Import local modules with the explicit `.ts` extension**
  (`import { x } from "./x.ts"`). Bun resolves it and
  `allowImportingTsExtensions` requires it.
- **`verbatimModuleSyntax` is on** — use `import type { ... }` for type-only
  imports.
- **`noUncheckedIndexedAccess` is on** — array/object index access yields
  `T | undefined`. Guard it (`const v = arr[i]; if (v === undefined) ...`) or use
  optional chaining; do not assume the element exists.
- **Set `process.exitCode` and return; never call `process.exit()`** — letting
  the event loop drain ensures buffered stdout/stderr flush fully.
- **Run `bun run fix` before `bun run check`.** `ultracite fix` runs
  `oxfmt --write` then `oxlint --fix`; this also sorts `package.json`
  (`experimentalSortPackageJson`). A few lint rules (e.g. `no-useless-return`)
  surface as errors that `fix` will not auto-resolve — fix those by hand.

## Target directory structure

```
<repo-root>/
├── .gitignore
├── .oxfmtrc.jsonc
├── .oxlintrc.json
├── bunfig.toml
├── LICENSE
├── package.json
├── README.md
├── tsconfig.json
├── src/
│   └── index.ts
└── tests/
    └── index.test.ts
```

If `HAS_CLI` is yes, additionally:

```
src/
├── index.ts
└── main.ts          # runnable entry (`bun src/main.ts`); add a `bin` mapping
tests/
└── cli.test.ts      # spawns the entry and asserts --version
```

## Step-by-step workflow

Follow these steps in order. Create all files, then run verification at the end.

### Step 1: Collect information

Ask the user for the values listed above. Detect `BUN_VERSION` with
`bun --version`.

### Step 2: Create package.json

Use the template from `templates/package-json.md`. Replace all placeholders. See
the template's CLI variant section if `HAS_CLI` is yes.

### Step 3: Create tsconfig.json

Use the template from `templates/tsconfig.md`. No placeholders to replace.

### Step 4: Create the oxc + bun config files

Use the template from `templates/oxc-config.md` to create `.oxlintrc.json`,
`.oxfmtrc.jsonc`, and `bunfig.toml`. No placeholders to replace.

### Step 5: Create .gitignore

Use the template from `templates/gitignore.md`. No placeholders to replace.

### Step 6: Create LICENSE

If `LICENSE_TYPE` is `none`, skip this step and omit the `license` field from
`package.json`.

Otherwise, create a `LICENSE` file with the standard text for the chosen license.
Set the copyright year to the current year and `AUTHOR_NAME` as the copyright
holder. Use the canonical full text from https://choosealicense.com/licenses/ for
the selected license type.

### Step 7: Create README.md

If a README.md already exists with real content, do not overwrite it. If it does
not exist, or contains only a default heading, replace with:

````markdown
# <PROJECT_NAME>

<DESCRIPTION>

## Development

```bash
bun install
bun run check      # oxlint + oxfmt
bunx tsc --noEmit  # typecheck
bun test --sequential
```
````

### Step 8: Create source and tests

Use the templates from `templates/source-files.md` to create:

- `src/index.ts`
- `tests/index.test.ts`
- `src/main.ts` and `tests/cli.test.ts` (only if `HAS_CLI` is yes)

### Step 9: Install dependencies

```bash
bun install
```

### Step 10: Format and auto-fix

```bash
bun run fix
```

One-time pass so every generated file conforms (and `package.json` is sorted).
Resolve any non-auto-fixable lint errors by hand.

### Step 11: Verify

```bash
bun run check      # oxlint + oxfmt, must be clean
bunx tsc --noEmit  # typecheck, must be clean
bun test --sequential  # sample test(s) must pass
```

All three must succeed. If `HAS_CLI` is yes, also confirm the entry runs:

```bash
bun src/main.ts --version
```

If anything fails, fix it before considering scaffolding complete.

## After scaffolding

Tell the user:

1. The project is set up and `bun run check`, `bunx tsc --noEmit`, and
   `bun test --sequential` all pass.
2. Key commands: `bun run check` (lint + format check), `bun run fix` (auto-fix
   - format), `bun run typecheck`, `bun test --sequential`, `bun add <dep>` (add
     a runtime dependency — e.g. `bun add zod` for schema validation; Zod 4's
     `z.toJSONSchema` works out of the box).
3. Bun runs `src/*.ts` directly — there is no build step and nothing to compile.
4. Push to GitHub when ready.
