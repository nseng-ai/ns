# PR 5 Contract Coverage Complete

## Summary

PR 5 adds the remaining contract coverage around `aretro exec collect-evidence` without changing production code. The plugin-path scenario now discovers the mounted `aretro` plugin, invokes `aretro exec collect-evidence --repo ... --format json` through that plugin path with fake git/session context, and asserts the skill-facing JSON data, fake source metadata, session summary, and deterministic `tool_usage_count` evidence item.

The standalone scenario suite now also covers the real Pi missing-session-root contract by using `PiJsonlSessionSource` with a deliberately absent `tmp_path` session root and `FakeGitGateway` git facts. It asserts a successful empty collection with the `pi_jsonl` source identity and one `session_root_missing` warning carrying the missing root source reference. Local JSON contract helpers now assert the stable `collect-evidence` data keys and nested DTO key shapes for repo, query, source, aggregate metrics, message counts, warnings, source refs, session summaries, and representative evidence items.

Verification passed with `uv run pytest packages/aretro/tests/scenario/test_aretro_cli.py tests/scenario/test_plugins.py -q`, `uv run pytest packages/aretro/tests -q`, `uv run pytest tests/scenario/test_plugins.py -q`, and the full `just` suite.

## Objective Impact

This completes roadmap PR 5 and de-risks PR 6: a branch-retrospective skill can rely on the deterministic JSON boundary through both the standalone CLI and the asdl plugin route. The coverage confirms plugin routing, Clinkr context injection, data rendering, real adapter warning behavior, and the no-raw-output contract without introducing Graphite stack metadata or semantic recommendation logic in Python.

## Follow-Ups

- PR 6 should create or update the branch retrospective skill to invoke `aretro exec collect-evidence` and interpret the returned evidence semantically.
- PR 7 should validate the steelthread against real branch sessions, including payload size, threshold usefulness, warning clarity, and association confidence.
