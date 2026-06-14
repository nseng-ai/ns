# Contract Inventory Audit

## Summary

Reviewed the current Python `handoff` package, public docs, handoff skills, Pi extension consumers, root plugin tests, `justfile`, `pyproject.toml`, and `CONTEXT-MAP.md` for the TypeScript port contract inventory.

Fresh grep evidence found no active `asdl handoff` user-facing references:

```bash
rg -n "\basdl handoff\b" README.md docs src packages ts .agents skills tests justfile pyproject.toml CONTEXT-MAP.md
# no matches
```

Active docs/skills/Pi code use standalone `handoff list/delete/gc` and `/handoff:*`. The remaining Python/plugin references are implementation/config/test ownership: Python package metadata, root uv/just config, `tests/scenario/test_plugins.py`, and `CONTEXT-MAP.md` pointing to the current Python package context.

Updated `contract-inventory.md` with the audit summary, plugin-retirement decision, Pi/skill consumer contract, and runtime diagnostic note. Marked the first roadmap row complete.

## Objective Impact

The first roadmap item is complete. Plugin retirement is currently unblocked: no active user-facing or agent-facing instruction requires preserving `asdl handoff`. The durable public surface for the port remains standalone `handoff` plus Pi/skills.

Docs that say "Python CLI" should be updated during the TypeScript shim cutover, not before parity. Root plugin tests and Python workspace/config references remain expected deletion/cutover work after TypeScript parity lands.

## Follow-Ups

- Implement the next roadmap item: add `@asdl/clinkr` markdown renderer support if still needed.
- Rerun the `asdl handoff` grep immediately before deleting the Python package.
- During shim cutover, update docs/skills wording from Python CLI to the TypeScript/default `handoff` CLI.
- During Python deletion, remove `asdl_handoff` plugin smoke imports/tests and root workspace/config references.
