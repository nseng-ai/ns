# oxc + bun config templates

Three files, no placeholders -- use as-is.

`ultracite` auto-detects "oxlint mode" by finding `.oxlintrc.json` in the project
root, then runs `oxfmt` then `oxlint`. Both config files below are discovered
automatically from the root; `bunfig.toml` scopes `bun test --sequential` to `tests/`.

## `.oxlintrc.json`

**Target path:** `.oxlintrc.json`

Extends ultracite's bundled core ruleset (a non-React baseline) and switches off
the rules that fight idiomatic CLI/library TypeScript while keeping
`typescript/no-explicit-any` as an error.

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "ignorePatterns": ["node_modules/**"],
  "extends": ["./node_modules/ultracite/config/oxlint/core/.oxlintrc.json"],
  "rules": {
    "arrow-body-style": "off",
    "complexity": "off",
    "curly": "off",
    "default-case": "off",
    "eqeqeq": "off",
    "func-names": "off",
    "func-style": "off",
    "import/consistent-type-specifier-style": "off",
    "max-lines": "off",
    "class-methods-use-this": "off",
    "no-accumulating-spread": "off",
    "no-alert": "off",
    "no-bitwise": "off",
    "no-console": "off",
    "no-else-return": "off",
    "no-empty-function": "off",
    "no-eq-null": "off",
    "no-inline-comments": "off",
    "no-lonely-if": "off",
    "no-negated-condition": "off",
    "no-plusplus": "off",
    "no-shadow": "off",
    "no-nested-ternary": "off",
    "no-throw-literal": "off",
    "no-unmodified-loop-condition": "off",
    "no-use-before-define": "off",
    "no-useless-constructor": "off",
    "no-void": "off",
    "no-warning-comments": "off",
    "prefer-const": "off",
    "prefer-destructuring": "off",
    "prefer-object-spread": "off",
    "prefer-template": "off",
    "require-await": "off",
    "sort-keys": "off",
    "typescript/array-type": "off",
    "typescript/consistent-type-definitions": "off",
    "typescript/consistent-type-imports": "off",
    "typescript/no-dynamic-delete": "off",
    "typescript/no-explicit-any": "error",
    "typescript/no-import-type-side-effects": "off",
    "typescript/no-inferrable-types": "off",
    "typescript/no-non-null-assertion": "off",
    "typescript/parameter-properties": "off",
    "unicorn/catch-error-name": "off",
    "unicorn/no-array-for-each": "off",
    "unicorn/consistent-existence-index-check": "off",
    "unicorn/consistent-function-scoping": "off",
    "unicorn/no-array-reduce": "off",
    "unicorn/no-array-sort": "off",
    "unicorn/no-await-expression-member": "off",
    "unicorn/no-hex-escape": "off",
    "unicorn/no-lonely-if": "off",
    "unicorn/no-nested-ternary": "off",
    "unicorn/no-typeof-undefined": "off",
    "unicorn/no-useless-undefined": "off",
    "unicorn/number-literal-case": "off",
    "unicorn/numeric-separators-style": "off",
    "unicorn/prefer-at": "off",
    "unicorn/prefer-code-point": "off",
    "unicorn/prefer-negative-index": "off",
    "unicorn/prefer-number-properties": "off",
    "unicorn/prefer-set-has": "off",
    "unicorn/prefer-spread": "off",
    "unicorn/prefer-string-replace-all": "off",
    "unicorn/prefer-logical-operator-over-ternary": "off",
    "unicorn/prefer-math-min-max": "off",
    "unicorn/prefer-math-trunc": "off",
    "unicorn/prefer-string-slice": "off",
    "unicorn/prefer-ternary": "off",
    "unicorn/prefer-type-error": "off",
    "unicorn/switch-case-braces": "off",
    "unicorn/text-encoding-identifier-case": "off"
  }
}
```

## `.oxfmtrc.jsonc`

**Target path:** `.oxfmtrc.jsonc`

```jsonc
// oxfmt configuration (ultracite-style).
// https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "ignorePatterns": ["node_modules/**", "**/*.md"],
  "arrowParens": "always",
  "bracketSameLine": false,
  "bracketSpacing": true,
  "endOfLine": "lf",
  "experimentalSortPackageJson": true,
  "jsxSingleQuote": false,
  "printWidth": 80,
  "quoteProps": "as-needed",
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "useTabs": false,
}
```

## `bunfig.toml`

**Target path:** `bunfig.toml`

```toml
# Bun configuration. Tests use Bun's built-in runner (`bun test --sequential`).
[test]
root = "tests"
```
