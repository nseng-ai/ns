# dprint plugin catalog

Reference for dprint plugin URLs and default configurations. The agent should use these URLs and
config blocks when assembling `dprint.json`.

## markdown

- **URL:** `https://plugins.dprint.dev/markdown-0.21.1.wasm`
- **Includes:** `**/*.md`
- **Default config:**

```json
"markdown": {
  "lineWidth": 100
}
```

- **Notes:** The `lineWidth` setting controls prose wrapping. 100 is a good default that matches
  common Python/ruff conventions. The `textWrap` option defaults to `"always"` (wraps prose to
  lineWidth).

## toml

- **URL:** `https://plugins.dprint.dev/toml-0.7.0.wasm`
- **Includes:** `**/*.toml`
- **Default config:**

```json
"toml": {
  "lineWidth": 100
}
```

- **Notes:** Formats `pyproject.toml`, `Cargo.toml`, and any other TOML files. The lineWidth should
  generally match the markdown plugin for consistency.
