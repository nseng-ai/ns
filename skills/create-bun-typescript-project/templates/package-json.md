# package.json template

**Target path:** `package.json`

## Placeholders

- `<PROJECT_NAME>` -- project name (e.g., `my-cool-tool`)
- `<DESCRIPTION>` -- one-line description
- `<AUTHOR_NAME>` -- author full name
- `<AUTHOR_EMAIL>` -- author email
- `<LICENSE_TYPE>` -- `MIT`, `Apache-2.0`, `BSD-3-Clause`, or omit the field if `none`
- `<BUN_VERSION>` -- output of `bun --version` (e.g., `1.3.6`)

## Template

```json
{
  "name": "<PROJECT_NAME>",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "<DESCRIPTION>",
  "license": "<LICENSE_TYPE>",
  "author": "<AUTHOR_NAME> <<AUTHOR_EMAIL>>",
  "packageManager": "bun@<BUN_VERSION>",
  "scripts": {
    "check": "ultracite check",
    "fix": "ultracite fix",
    "typecheck": "tsc --noEmit",
    "test": "bun test --sequential",
    "ci": "bun run check && bun run typecheck && bun test --sequential"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/bun": "^1.3.0",
    "@types/node": "^22",
    "oxfmt": "^0.43.0",
    "oxlint": "^1.57.0",
    "typescript": "^5",
    "ultracite": "^7.4.0"
  }
}
```

Notes:

- `ultracite` selects oxlint mode because `.oxlintrc.json` exists; it shells out
  to `oxlint` + `oxfmt`, both installed above. Keep `ultracite`/`oxlint` on
  compatible majors (ultracite 7.x expects oxlint 1.x).
- `bun run fix` re-sorts the keys of this file (oxfmt
  `experimentalSortPackageJson`). That is expected; commit the sorted result.

## CLI variant

If `HAS_CLI` is yes, add a `bin` mapping and a `start` script. Bun executes the
`.ts` entry directly (the file begins with `#!/usr/bin/env bun`):

```json
{
  "bin": {
    "<PROJECT_NAME>": "src/main.ts"
  },
  "scripts": {
    "start": "bun src/main.ts"
  }
}
```

Merge the `bin` object and the `start` key into the template above (do not create
a second `scripts` block).
