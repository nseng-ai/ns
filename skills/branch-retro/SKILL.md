---
name: branch-retro
description: "Use when the user asks for a branch/session retrospective, wants to know what would have made branch work faster/smaller/higher quality, or asks to run/interpret `aretro` evidence. Collects deterministic evidence with `aretro exec collect-evidence` and turns it into semantic recommendations without editing files unless requested."
allowed-tools:
  - "Bash(*aretro-run *)"
  - "Bash(*aretro-run)"
  - "Bash(git status*)"
  - "Bash(git branch*)"
  - "Bash(git rev-parse*)"
  - "Bash(test -x*)"
  - "Read"
---

<!-- PUBLIC SKILL: Do not reference asdl-internal module paths or class names in this file. Describe CLI operations, not implementation. -->

# branch-retro

Produce a compact retrospective for a branch or session set. The skill collects
factual evidence with `aretro`, then uses model judgment to write source-backed
findings and actionable recommendations. Default mode is read-only.

## When to use

Use this skill when the user asks for a branch retro, branch/session
retrospective, what slowed a branch down, what should improve after branch work,
or how to interpret `aretro` evidence.

If the user asks to implement recommendations, produce the retrospective first,
then ask for confirmation and scope before editing anything.

## How `aretro` is invoked

Resolve `<skill-dir>` as the directory containing this `SKILL.md`. Define
`<aretro-runner>` as `<skill-dir>/scripts/aretro-run`.

Substitute `<aretro-runner>` for literal `aretro` examples. The command boundary
is the standalone `aretro exec collect-evidence`; do not use `asdl aretro`.

## Preflight

1. Verify `test -x <aretro-runner>`.
2. Resolve the repository root with `git rev-parse --show-toplevel`.
3. Resolve the branch with `git branch --show-current`, unless the user supplied
   a branch.
4. If not in a git repository, or the branch is detached and the user did not
   provide one, stop and report the prerequisite failure. Ask for `--repo` and
   `--branch` when needed.

## Evidence collection

Run:

```bash
<aretro-runner> exec collect-evidence \
  --repo <repo-root> \
  --branch <branch> \
  --max-sessions 20 \
  --format json
```

Pass `--session-root` only when the user provides one or a local validation uses
a fixture root.

If the JSON envelope has nonzero `exit_code`, `success: false`, or an `error`,
report the error and stop. Surface warnings, especially missing session roots or
low-confidence association.

## Interpretation rules

- Treat `evidence_items` as observations, not diagnoses.
- Use counts, session counts, association confidence, warnings, and source refs
  when making claims.
- Keep semantic recommendations in the model and make them reviewable by the
  user.
- Do not quote raw prompts, assistant prose, tool output, or command output.

Suggested interpretations:

- `repeated_file_read`: possible missing navigation docs, unclear ownership, or
  normal cross-checking; hedge unless corroborated.
- `repeated_shell_command`: possible automation helper, test target, or skill
  push-down candidate.
- `failed_tool_result`: possible command ergonomics, environment setup, or stale
  instructions.
- `large_output_observed`: possible need for filtering, narrower commands, or
  output-capping guidance.
- `token_usage_observed`: token pressure signal only; combine with other
  evidence before recommending action.
- `tool_usage_count`: activity profile; do not turn high counts alone into a
  problem statement.

## Recommendation rules

Optimize recommendations for two benefits: higher-quality outcomes and greater
agent efficiency (lower wall time and token spend). For each recommendation:

- Weigh expected benefit against implementation and maintenance cost; call out
  high-upkeep docs, brittle process, or unclear ownership.
- Treat drift risk as a first-class cost. Prefer changes whose stale state is
  obvious through tests, command failures, or existing review paths.
- Prefer executable or tested affordances over prose when evidence shows repeated
  mechanical work: CLI operations, `just` targets, package scripts, or small
  helpers with validation.
- Recommend documentation only when it sits on an existing discovery path agents
  already use, such as a relevant skill, CLI help, package README, `AGENTS.md`,
  or command output. Avoid standalone docs unless one of those paths links to
  them.
- For any doc recommendation, state the source of truth, how future agents will
  find it, and what prevents or detects drift.
- If evidence is weak, benefits are speculative, or the cheapest durable fix is
  unclear, recommend no change, follow-up measurement, or a small routing note
  instead of creating a new artifact.

## Report template

```markdown
# Branch retrospective: <branch>

## Evidence collected

- Sessions: <n>
- Source: <harness>/<adapter>
- Warnings: <summary or none>

## Findings

- <finding with evidence kind/count/source-ref summary>

## Recommendations

- <specific change, expected quality/efficiency benefit, maintenance/drift cost,
  discovery path, likely owner/file/skill area>

## Follow-up options

- <optional next steps; ask before editing>
```

## Mutation boundary

Default mode is read-only: do not write files, change code, commit, store raw
transcripts, or update durable state.

If the user asks to apply recommendations, switch to the relevant implementation
workflow (for example, skill management for skill edits, CLI push-down for helper
commands, or normal code/test workflows) and confirm scope before mutating.
