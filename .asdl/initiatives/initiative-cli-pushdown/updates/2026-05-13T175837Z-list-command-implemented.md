# List Command Implemented

## Summary

PR 3 is complete. The hidden `initiative exec list` command now inventories direct child directories under `.asdl/initiatives/` without reading Markdown contents or consulting git state.

The command returns a JSON contract with `root_path`, `root_exists`, sorted `entries`, relative Initiative paths, closed-marker state, file-presence booleans for `initiative.md`, `roadmap.md`, `updates/`, and `closed.md`, plus direct `updates/*.md` counts. Its Markdown renderer emits a compact table and produces no selection hint or recommendation. Clinkr now accepts `--format md` as an alias for the existing Markdown/human renderer path while preserving `--format markdown`.

Verification passed with:

- `uv run pytest packages/asdl-initiatives/tests/scenario packages/asdl-core/tests/unit/clinkr/test_format_option_dispatch.py tests/scenario/test_plugins.py`
- `just`

## Initiative Impact

The first deterministic Initiative CLI operation is now implemented behind the hidden `exec` subgroup. This confirms that the new package skeleton can host a fact-only command with standalone scenario coverage, Clinkr format coverage, and plugin smoke coverage while preserving the no-meaning/no-mutation boundary.

The roadmap now marks PR 3 complete. The broader assumptions remain mostly active: filesystem listing is implemented and testable, but reuse by the Initiative skills will be confirmed when the skills/docs are updated and later commands land.

## Follow-Ups

- Implement `initiative exec read-initiative <slug-or-path>` with explicit selection validation and raw Markdown output for the Markdown renderer.
- Keep subsequent commands fact-only: no Markdown interpretation, no Initiative selection inference, no mutation helpers.
- When skills/docs start delegating to the CLI, document the JSON fields precisely enough that agents do not rediscover the inventory contract ad hoc.
