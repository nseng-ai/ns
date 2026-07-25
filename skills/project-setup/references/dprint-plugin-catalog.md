# dprint plugin catalog

Per-plugin notes and rationale. The plugin URLs and default config blocks have one source:
`../assets/dprint-default.json` (the complete default template); this file does not repeat them.

## markdown

- The `lineWidth` setting controls prose wrapping. 100 is a good default that matches common
  Python/ruff conventions.
- The `textWrap` option defaults to `"always"` (wraps prose to lineWidth).

## toml

- Formats `pyproject.toml`, `Cargo.toml`, and any other TOML files.
- The lineWidth should generally match the markdown plugin for consistency.
