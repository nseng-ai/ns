# asdl_core.sessions

Harness-neutral session parsing and source adapters for local agent logs.

## Rules

- **Stdlib-only dependencies**. All imports in this subpackage must be from the Python standard library or from `asdl_core.sessions` itself.
- **No imports from parent `asdl_core`**. Do not import `aretro`, Graphite, GitHub, brmem, Objective code, CLI utilities, or sibling `asdl_core` subpackages.
- **Adapter isolation**. Harness-specific details stay in adapter modules under `adapters/`.
- **Harness-neutral models**. Shared models in `types.py` must not expose Pi-only, Claude-only, or Codex-only field names.
- **Vocabulary**. Use `harness` for the tool/runtime that produced the log; reserve `provider` for model/API metadata inside logs.
- **Privacy**. Do not retain raw transcript text or full tool outputs in normalized models.
- **Canonical imports**. `__init__.py` files stay empty/docstring-only; consumers import canonical modules directly.
