---
name: branch-retro
disable-model-invocation: true
description: "Branch/session retrospective: collect deterministic Retro evidence with `ns retro exec collect-evidence` and turn it into semantic recommendations without editing files unless requested."
allowed-tools:
  - "Bash(ns retro exec collect-evidence*)"
  - "Bash(ns retro exec read-evidence-detail*)"
  - "Bash(git status*)"
  - "Bash(git branch*)"
  - "Bash(git rev-parse*)"
  - "Bash(command -v ns*)"
  - "Read"
---

<!-- PUBLIC SKILL: Do not reference ns-internal module paths or class names in this file. Describe CLI operations, not implementation. -->

# branch-retro

Produce a compact retrospective for a branch or session set. The skill collects
factual evidence with `ns retro`, then uses model judgment to write source-backed
findings and actionable recommendations.

## When to use

If the user asks to implement recommendations, produce the retrospective first,
then ask for confirmation and scope before editing anything.

## Preflight

1. Verify `command -v ns` succeeds.
2. Resolve the repository root with `git rev-parse --show-toplevel`.
3. Resolve the branch with `git branch --show-current`, unless the user supplied
   a branch.
4. Choose one safe payload session id for this invocation, using only lowercase
   letters, digits, dots, underscores, and hyphens. Examples:
   `retro-20260604t120000z-a1` or `retro-branch-retro-a1`.
5. If `ns` is unavailable, not in a git repository, or the branch is detached and
   the user did not provide one, stop and report the prerequisite failure. Ask for
   `--repo` and `--branch` when needed.

## Evidence collection

Run payload mode by default:

```bash
ns retro exec collect-evidence \
  --repo <repo-root> \
  --branch <branch> \
  --max-sessions 20 \
  --payload-mode payload \
  --payload-session-id <payload-session-id> \
  --format json
```

Pass `--session-root` only when the user provides one or a local validation uses
a fixture root.

If the JSON envelope has nonzero `exit_code`, `success: false`, or an `error`,
report the error and stop. Surface warnings, especially missing session roots or
low-confidence association.

The compact `data` object remains the primary evidence source. It includes
counts, sessions, warnings, evidence items, source refs, and a `payload_reference`
for sanitized local detail expansion. Payload artifacts are local files under the
configured/default ns temp payload root and the chosen payload session id;
cleanup/list/GC is not part of this workflow.

When compact evidence is insufficient to make or validate a recommendation, read
one targeted detail value from the payload artifact:

```bash
ns retro exec read-evidence-detail \
  --payload-path <payload-reference.payload_path> \
  --json-pointer <detail-pointer-under-/data> \
  --format json
```

Use locator hints from `detail_locator_hints` and supporting pointers from
`evidence_items`. Do not paste full payload artifacts or raw session files into
the transcript; targeted reads only.

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
- Apply the shared doc-economics rules (authoritative home:
  `docs/conventions/doc-economics.md` in the ns repo): treat drift risk as a
  first-class cost, prefer executable or tested affordances over prose for
  repeated mechanical work, and recommend documentation only when it sits on an
  existing discovery path agents already use.
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
