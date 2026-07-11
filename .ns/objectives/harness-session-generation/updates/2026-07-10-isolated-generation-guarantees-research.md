# Isolated-Generation Guarantees Established for Claude Code and Codex

## Summary

The first roadmap row — establish enforceable isolated-generation behavior for Claude Code and Codex — is complete. The evidence is a source-backed guarantee matrix with controlled probe results in `docs/research/claude-codex-isolated-generation-guarantees.md`, pinned to Claude Code 2.1.206 and codex-cli 0.136.0 (openai/codex source read at tag `rust-v0.136.0`).

Load-bearing findings:

- **Claude Code `--bare` breaks native login** (OAuth/keychain are never read; probe-confirmed `Not logged in`, exit 1). The isolated profile must build on `--safe-mode`, which is probe-confirmed to suppress project and user CLAUDE.md, skills, plugins, hooks, and MCP while native OAuth keeps working. Companion flags: `--setting-sources ""`, `--tools ""`, `--disable-slash-commands`, `--strict-mcp-config`, `--no-session-persistence`, `--system-prompt`, empty temp-dir cwd, allowlist-constructed environment.
- **`--system-prompt` does not suppress CLAUDE.md**; today's Pi fast draft leaks the full project CLAUDE.md/AGENTS.md chain plus user `~/.claude/CLAUDE.md` into every draft (probe-confirmed).
- **Codex `--ignore-user-config` is the documented auth/behavior splitter** (config.toml dropped, auth kept), but it covers only the user and profile config layers. Project `AGENTS.md` needs `-c project_doc_max_bytes=0` (today's Reviews Codex profile leaks it — acceptable for Reviews, disqualifying for isolated generation).
- **Four Codex guarantees are unenforceable by flags** and must be explicit capability rejections or LBYL preflight failures: no-tools (15 intrinsic tools remain; only read-only sandbox containment), no ambient `$HOME/.agents/skills`, no global `$CODEX_HOME/AGENTS.md` (loaded unconditionally at `core/src/config/mod.rs:2491`), and true system-prompt replacement (no exec instructions flag at 0.136.0).
- **Config-root redirection kills login on both harnesses** (fresh `CLAUDE_CONFIG_DIR` → not logged in even with keychain credentials; fresh `CODEX_HOME` → 401). Codex has a probe-confirmed maximal-isolation fallback: fresh `CODEX_HOME` containing only an `auth.json` symlink preserves login while dropping all `CODEX_HOME` behavior.
- **Every auth-breaking configuration probed failed explicitly** (non-zero exit plus diagnostic). The fail-explicitly design rule is implementable as-is; no silent degradation was observed.

## Objective Impact

- Roadmap row "Research — Establish enforceable isolated-generation behavior for Claude Code and Codex" is `[x]` with the artifact as evidence. The prototype row is now blocked only by the two grilling rows and the consumer-semantics inventory row.
- The assumption that native login can be preserved while suppressing behavioral configuration is validated with caveats (fully on Claude Code; on Codex with explicit rejections). The ambient-tools risk materialized for Codex exactly as the contract anticipated; the auth/config-coupling risk is de-risked with concrete mechanisms. Both are annotated in `objective.md`.
- Material input for the consumer-semantics inventory and Reviews migration: the existing Reviews Claude runner (`--bare`) cannot use harness-native subscription login — it silently depends on callers supplying `ANTHROPIC_API_KEY`. The unified contract must treat auth mode as an explicit profile decision.
- The recommended per-harness isolated invocations (full command line, env allowlist, cwd strategy, preflight rejections) are recorded in the research artifact and are ready inputs for the fake-harness prototype.

## Follow-Ups

- Residual uncertainties flagged in the artifact, to resolve during prototype/conformance work: Codex `base_instructions`/`developer_instructions` reachability via `-c`; `-c mcp_servers={}` as an MCP kill switch; Codex `--output-schema` strictness; SIGINT/cancellation semantics on both CLIs.
- Version drift is a live risk (`--bare` semantics and `--json-schema` validation both changed within 2.1.x). The future conformance suite should re-run the marker/auth probes per harness version rather than trusting this snapshot — that is the honest implementation of "unsupported guarantees fail explicitly."
