# Plan: README for `packages/twerk-pr-address/` + local/prod CLI dispatch

## Context

`twerk-pr-address` provides the deterministic CLI operations that back the `pr-address` skill. Today there is no `README.md`, and the skill invokes `pr-address` as a bare command (`allowed-tools: Bash(pr-address *)`), which assumes the consumer has run `uv sync` in a twerk checkout. We want two changes in this plan:

1. **Add a `README.md`** that leads with a "Get started" section — users should be able to install the skill via `npx skills`, invoke it through the `/pr-address` slash command, and have it Just Work with no further local setup.
2. **Change the skill to use `uvx` against GitHub in production**, so end users don't need to clone twerk or manage a local venv. Local developers working inside the twerk checkout must keep the fast `uv run pr-address` loop.

The tricky part is (2): the skill's `SKILL.md` invokes literal commands, so "use `uvx` in prod, `uv run` locally" requires a small dispatcher. The design below puts that dispatcher inside the skill as a bundled shell wrapper so the skill author controls the switch.

## Deliverables

1. New file: `/Users/schrockn/code/twerk/packages/twerk-pr-address/README.md`
2. New file: `/Users/schrockn/code/twerk/skills/pr-address/scripts/pr-address-run` (wrapper; executable)
3. Edit: `/Users/schrockn/code/twerk/skills/pr-address/SKILL.md` (allowed-tools + every `pr-address ...` invocation)
4. (Verify) `.claude/skills/pr-address/` and `.agents/skills/pr-address/` are symlinks into `skills/pr-address/` — editing the canonical source is enough. AGENTS.md confirms this layout.

## Mechanism: local vs prod dispatch

A single shell wrapper bundled with the skill at `scripts/pr-address-run`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Explicit override wins.
case "${TWERK_PR_ADDRESS_MODE:-}" in
  local) exec uv run pr-address "$@" ;;
  prod)  exec uvx --from "git+https://github.com/dagster-io/twerk" pr-address "$@" ;;
esac

# Auto-detect: are we inside a twerk checkout?
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -n "$repo_root" && -f "$repo_root/packages/twerk-pr-address/pyproject.toml" ]]; then
  exec uv run --project "$repo_root" pr-address "$@"
fi

# Default: prod — ephemeral uvx from GitHub.
exec uvx --from "git+https://github.com/dagster-io/twerk" pr-address "$@"
```

Key properties:

- **Prod users** (skill installed via `npx skills`, no twerk checkout) → `uvx` pulls the latest twerk from GitHub, resolves the uv workspace, runs `pr-address` from the `twerk-pr-address` package.
- **Local devs** (inside a twerk checkout) → `uv run --project <repo_root> pr-address` runs the workspace build. `--project` makes it work even if cwd is a subdirectory.
- **Override** via `TWERK_PR_ADDRESS_MODE=local|prod` for testing or forcing a mode.

The `SKILL.md` `allowed-tools` change from `Bash(pr-address *)` to a matcher that covers the wrapper. The simplest path is to use the skill-relative script path — Claude Code skills can reference their own `scripts/` directory, and the wrapper call becomes `pr-address-run ...` after a one-line PATH/shim step documented in the README, **or** `"$CLAUDE_PROJECT_DIR/skills/pr-address/scripts/pr-address-run"` style. Exact allowed-tools glob must be verified against how Claude resolves skill-relative paths — see Verification.

### uvx invocation to verify

`uvx --from "git+https://github.com/dagster-io/twerk" pr-address` relies on uv honoring the workspace definition in the root `pyproject.toml` when pulled from git and resolving `twerk-pr-address` (which exposes the `pr-address` console script) plus its workspace `twerk-core` dep. This is the expected behavior of uv workspaces, but must be smoke-tested during implementation. If it does not work cleanly, the fallback is to use a `uv tool install` flow documented in the README and drop `uvx`.

## README content (target: ~60–90 lines)

Order matters — Get Started first, context last.

1. **Title + one-line tagline**
   - `# twerk-pr-address`
   - One sentence: "CLI operations that back the `pr-address` Claude Code skill — fetches PR feedback from GitHub and executes resolution mutations."

2. **Get started** (the lead section, per user request)
   - Install the skill with `npx skills`:
     ```
     npx skills add dagster-io/twerk@pr-address --agent codex claude-code -y
     ```
     (matches the canonical twerk install flag from `.agents/skills/skill-management/SKILL.md`).
   - Requires `uv` on PATH (link to [uv install docs](https://docs.astral.sh/uv/getting-started/installation/) — but don't invent a URL; quote the canonical install shell line: `curl -LsSf https://astral.sh/uv/install.sh | sh`).
   - Requires `gh` authenticated (`gh auth status`).
   - Invoke the skill in Claude Code: `/pr-address` on a branch with an open PR.
   - That's it — the skill dispatches to `uvx` under the hood, so no local clone is needed.

3. **How it works** (2–3 sentences)
   - The skill bundles a wrapper (`scripts/pr-address-run`) that selects `uv run` (if inside a twerk checkout) or `uvx --from git+https://github.com/dagster-io/twerk pr-address` (otherwise).
   - Override with `TWERK_PR_ADDRESS_MODE=local|prod`.
   - Cite the file path so readers can audit it.

4. **Local development**
   - Clone twerk, `uv sync` at the repo root.
   - Inside the checkout, the wrapper auto-uses `uv run pr-address` — so editing `packages/twerk-pr-address` and re-invoking the skill picks up changes immediately.
   - Run tests: `just` at the repo root, or `uv run pytest packages/twerk-pr-address`.

5. **What it provides** (concise)
   - Standalone CLI: `pr-address` console script (from `pyproject.toml`).
   - Twerk plugin: `twerk pr-address …` (via `twerk.plugins` entry point).
   - All operations nested under an `exec` subgroup — run `pr-address exec --help` for the list.
   - One-liner per category (don't enumerate flags):
     - Feedback fetch / composite: `get-feedback`, `prepare-run`, `get-pr-for-branch`, `get-reviews`, `get-review-comments`, `get-discussion-comments`
     - Thread mutations: `resolve-thread`, `resolve-thread-with-reply`, `unresolve-thread`, `add-review-thread-reply`
     - Replies / comments / reactions: `reply-to-review`, `reply-to-discussion`, `add-issue-comment`, `add-reaction`

6. **Relationship to the `pr-address` skill**
   - The skill (`.claude/skills/pr-address/SKILL.md`) provides the LLM-driven classification, batching, and code-change orchestration.
   - This package provides the deterministic, testable operations the skill invokes.
   - The skill never pushes; this package never pushes.

7. **See also**
   - Skill source: `.claude/skills/pr-address/SKILL.md`
   - clinkr (the dual-mode CLI framework used by every operation): `packages/twerk-core/src/twerk_core/clinkr/README.md`

## Style / conventions

- Match twerk's concise tone — short paragraphs, no marketing language, no emojis.
- Backticks for CLI names, file paths, operation names, and env vars.
- Don't document individual operation flags (that's what `--help` is for).
- Don't duplicate skill content — link to it.

## Critical files to reference while writing

- `packages/twerk-pr-address/pyproject.toml` — entry points, deps, Python version.
- `packages/twerk-pr-address/src/twerk_pr_address/cli/main.py` — `build_cli()` / `main()`.
- `packages/twerk-pr-address/src/twerk_pr_address/cli/pr_address/__init__.py` — `exec` subgroup convention.
- `packages/twerk-pr-address/src/twerk_pr_address/cli/pr_address/*.py` — operation names (excluding `__init__.py`, `gateway_access.py`, `reply_formatting.py`, which are internal helpers).
- `pyproject.toml` (repo root) — workspace members + uv sources, confirms remote is `dagster-io/twerk`.
- `.claude/skills/pr-address/SKILL.md` — current allowed-tools (`Bash(pr-address *)`) and current invocations to migrate.
- `.claude/skills/ns-skill-management/SKILL.md` — canonical `npx skills` install flag.
- `packages/twerk-core/src/twerk_core/clinkr/README.md` — style reference.
- `skills/pi-plan-to-branch/` — existing skill that uses `uv run` prefix (pattern reference).

## Verification

1. **Workspace `uvx` smoke test** (the core risk):
   ```
   uvx --from "git+https://github.com/dagster-io/twerk" pr-address --help
   ```
   Must print help and exit cleanly from a directory that is **not** a twerk checkout. If this fails because of workspace resolution, the fallback is `uv tool install --from git+https://github.com/dagster-io/twerk twerk-pr-address` documented in the README — update the wrapper's prod branch accordingly.
2. **Wrapper auto-detect, local mode**: inside `/Users/schrockn/code/twerk`, run `scripts/pr-address-run --help` — should invoke via `uv run` (verify by adding `set -x` or checking process tree once).
3. **Wrapper auto-detect, prod mode**: from `/tmp` (outside any git repo), run the same — should hit the `uvx` branch.
4. **Override**: `TWERK_PR_ADDRESS_MODE=local scripts/pr-address-run --help` from `/tmp` should fail (no uv workspace present) — confirms override wins.
5. **Skill allowed-tools**: verify the updated `allowed-tools` glob actually permits the wrapper invocation by running `/pr-address` on a throwaway branch and watching for permission prompts.
6. **Operation-list audit**: every operation listed in the README matches a real module under `src/twerk_pr_address/cli/pr_address/` (excluding the internal helpers noted above).
7. **Formatting**: `just dprint-fix` then `just` at the repo root; expect green.

## Self-destruct

This plan file is a durable spec for the branch it lives on, not a
permanent artifact. Once the plan is fully implemented, the final
commit of this branch must delete this file (`plan-add-pr-address-readme-and-uvx-dispatch.md`). A
merged PR whose branch still contains its own plan file is evidence
the plan was not fully carried out.
