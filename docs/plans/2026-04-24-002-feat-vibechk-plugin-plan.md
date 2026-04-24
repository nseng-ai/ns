---
title: "feat: vibechk — opt-in plugin for session-learning branch evals"
type: feat
status: active
date: 2026-04-24
origin: docs/brainstorms/session-learning-branch-evals-requirements.md
---

# feat: vibechk — opt-in plugin for session-learning branch evals

## Overview

Ship `vibechk` — a deliberately crude, opt-in plugin that captures per-session learning into `brmem` on each branch, uses git branching as the eval substrate, and writes tool-call + token telemetry into PR bodies for later prompt-driven comparison.

The plan lands three things:

1. **Two optional prompt-based post-hook contracts** on the existing `brmem-branch-create` and `brmem-branch-impl` skills. Hooks are LBYL: if the prompt file at a well-known path exists, the skill reads and follows it after its primary work; if absent, the skill terminates exactly as it does today.
2. **One new skill**, `dev-vibechk-branch-eval`, that operates the A/B branch workflow: create a sibling branch off the parent of the current Impl branch, copy forward the two notes files via `brmem copy`, and apply the impl-session-notes suggestions as commits.
3. **One packaged helper** — a small Python script that parses the current Claude Code session's JSONL transcript and emits tool-call + token totals as JSON, invoked from the post-impl hook prompt.

`vibechk` ships with the `dev-` prefix and `metadata.internal: true`. This is a dogfooding prototype; graduation drops the prefix and internal flag (per `AGENTS.md § Dev Skill Naming Convention`).

---

## Problem Frame

Twerk sessions produce a lot of implicit learning — what context mattered for planning, what docs/skills were missing at impl time, what surprises appeared mid-execution — and none of it is captured today. The repo also has no concrete way to tell whether adding a skill or a doc file actually improves future sessions on the same kind of work (see origin: `docs/brainstorms/session-learning-branch-evals-requirements.md`).

`vibechk` addresses this without modifying the substrate. `brmem`, Graphite, the branch-creation plugin contract, and the two base skills remain plugin-agnostic. `vibechk` plugs into them through prompt files at known paths and a single new skill — so repos that don't want `vibechk` behavior are entirely unaffected.

---

## Requirements Trace

Origin R-IDs carried forward verbatim; plan-local requirement nesting follows the origin's groupings for traceability.

**Hook contracts (base-skill changes)**
- R6. `brmem-branch-create` and `brmem-branch-impl` gain optional prompt-based post-hook contracts. Hook files at well-known paths, read verbatim when present, skipped silently when absent.
- R15. Hook mechanism is generic (not vibechk-specific). One plugin per hook point in v1.

**Session notes capture (vibechk content)**
- R1–R3. `plan-session-notes.txt` stashed into `brmem` on the new branch by vibechk's post-create hook.
- R4–R5. `impl-session-notes.txt` stashed into `brmem` on the current branch by vibechk's post-impl hook.

**Telemetry (vibechk content)**
- R7. Tool-call count + token totals extracted by parsing the current session's JSONL transcript under `~/.claude/projects/<encoded-cwd>/`.
- R10–R11. Telemetry written to the PR body in a machine-extractable, delimited block.

**Eval-branch workflow (vibechk skill)**
- R8. `vibechk-branch-eval` creates `ImprovedContextBranch` off the parent of the current Impl branch using the repo's branch-creation plugin.
- R9. Copies both notes files from Impl's brmem to ImprovedContextBranch's brmem via `brmem copy`.
- R12. Applies the impl-session-notes suggestions as commits with a minimum rigor bar.

**Plugin packaging**
- R16. Delivered as three artifacts: two template default-prompt files + one skill; install is manual copy of the default-prompts + `npx skills` registration of the skill.

**Storage contract**
- R13–R14. Notes stored as plain `.txt` entries in brmem under a dedicated namespace (`vibechk`); never written into the working tree.

**Origin actors:** A1 (User), A2 (Planning session agent), A3 (Impl session agent), A4 (Eval session agent), A5 (Second impl session agent), A6 (Comparison session agent — out of scope).
**Origin flows:** F1 (Plan capture — vibechk-gated), F2 (Implementation with reflection — vibechk-gated), F3 (Eval-branch spawn), F4 (Second implementation), F5 (Comparison — out of scope).

---

## Scope Boundaries

- **No structured schema for notes files.** Plain `.txt`, prose; origin-gated prototype trade-off.
- **No automatic chaining from Impl to Impl2.** User invokes each skill explicitly.
- **No external eval tool integration** (Braintrust, Langfuse, promptfoo). Pure in-repo plugin.
- **No reuse of `skill-creator`'s telemetry patterns** (`timing.json`, `benchmark.json`). Origin explicitly excludes these.
- **No harness-level Claude Code hooks** (`Stop`, `SessionEnd`). Telemetry pulled on-demand by the skill, not pushed by the harness.
- **No built-in comparison command.** Comparison is a separate prompt-driven read of the two PRs; out of scope for this plan.
- **No multi-plugin coexistence at a single hook point.** If another plugin later wants the post-impl hook, the user merges prompts by hand.
- **No auto-seeding of hook prompts.** Users copy vibechk's default-prompts to `.twerk/prompts/` manually — same pattern as `brmem-branch-create`'s primary plugin.
- **No new gateway methods on `twerk_core.gh.PRGateway`.** PR body edits go through direct `gh pr edit --body-file` shelling from the hook prompt.
- **Not graduating to publishable vibechk yet.** Ships as `dev-vibechk-branch-eval` with `metadata.internal: true`.

### Deferred to Follow-Up Work

- **Comparison skill / command.** Origin F5 (later).
- **`vibechk` graduation.** Drop `dev-` prefix + `internal: true` flag after the prototype validates.
- **Structured schema for notes files.** Origin Scope Boundaries flag this as v2.
- **Multi-plugin coexistence at hook points.** Origin R15 flags this as v2.
- **Concurrent-session robustness for JSONL identification.** Single-session assumption in v1.

---

## Context & Research

### Relevant Code and Patterns

- `skills/brmem-branch-create/SKILL.md` — the existing plugin-prompt contract split (skill owns bundle + `brmem put`; plugin owns branch creation). Post-hook addition in U1 mirrors its Step 8 seam.
- `skills/brmem-branch-create/default-prompt.md` — canonical shape for a shipped default-prompt (scope statement, input, contract, default behavior, pre-flights, output, customization guidance). `vibechk` ships analogous files for its two hook templates.
- `skills/brmem-branch-impl/SKILL.md` — currently has no plugin hook; ends at Step 6 (Begin implementation) open-ended. Step 7 seam is where the post-impl hook inserts.
- `packages/twerk-core/src/twerk_core/brmem/{put,get,list,check,copy,group}.py` — canonical CLI shapes; key finding: `brmem copy` is **namespace-scoped**, not key-scoped. Two-file copy requires both notes to live in a shared namespace (vibechk uses `vibechk` namespace).
- `.agents/skills/graphite/SKILL.md` (lines 210–249) — PR body editing convention: never heredoc, always `gh pr edit --body-file /tmp/pr-body.md`; for append, first `gh pr view <num> --json body -q .body`.
- `skills/dev-gh/references/gh.md` (lines 496–499) — read-modify-write pattern for PR bodies.
- `.agents/skills/ns-skill-management/SKILL.md` — skill packaging: `skills/<name>/` canonical, `.agents/skills/<name>` and `.claude/skills/<name>` are symlinks; canonical install flag `--agent codex claude-code -y`.

### Institutional Learnings

- `docs/brainstorms/retire-workbr-for-brmem.md` — "The plugin is **data, not code** — a single free-form markdown file the agent reads and follows." vibechk's hook prompts follow this philosophy.
- `AGENTS.md § "Public Skill Authoring"` — public skills must not reference twerk-internal module paths. `dev-vibechk-branch-eval/SKILL.md` may reference internals while prefixed `dev-`; must be scrubbed at graduation.
- `AGENTS.md § "GitHub Backend Interactions"` — any code touching GitHub must consult the `dev-gh` skill. `gh pr edit` usage in U3's extractor and U5's hook prompt falls under this rule.
- `AGENTS.md § "Branch Creation and PR Submission (Graphite)"` — prefer `gt create` over `git branch` for new branches. `vibechk-branch-eval` (U4) delegates branch creation to `.twerk/prompts/brmem-branch-create.md` so repo policy (Graphite vs git) is honored.

### External References

- Claude Code JSONL transcript format was confirmed by direct inspection of `/Users/schrockn/.claude/projects/-Users-schrockn-code-twerk/*.jsonl` during planning. No external docs were needed.

### Verified Empirically

| Claim | Evidence |
|---|---|
| JSONL filename == sessionId | First record of file `<sessionId>.jsonl` has `sessionId` field matching filename (stem) |
| Session tokens + tool uses are reachable | Aggregating `message.usage.{input,output,cache_creation,cache_read}_tokens` over `type == "assistant"` records + counting `tool_use` content blocks gave sane totals for a live file |
| `cwd` → project-dir mapping | `/Users/schrockn/code/twerk` maps to `-Users-schrockn-code-twerk` |
| No `CLAUDE_CODE_SESSION_ID` env var | `env | grep -i claude` shows only `ENTRYPOINT`, `CLAUDECODE`, `EXECPATH` |

---

## Key Technical Decisions

- **LBYL hook check, not required file.** Unlike `brmem-branch-create`'s primary plugin (which aborts if missing), the two post-hooks are pure LBYL: test for file existence and skip silently on absence. Guarantees base-skill behavior is unchanged when `vibechk` is not installed.
- **Hook filenames: flat, parallel to primary plugin.** `.twerk/prompts/brmem-branch-create-post.md` and `.twerk/prompts/brmem-branch-impl-post.md`. No subdirectory. Preserves discoverability and matches the existing `.twerk/prompts/<skill-name>.md` convention.
- **Dedicated `vibechk` brmem namespace.** Both notes files live under `vibechk/plan-session-notes.txt` and `vibechk/impl-session-notes.txt`. Consequence: `vibechk-branch-eval` can copy both with a single `brmem copy --namespace vibechk --from-branch <impl> --to-branch <improved>` call. If notes were in `base`, we'd need two `get`/`put` pairs.
- **JSONL session identification: mtime heuristic.** Most-recently-modified `*.jsonl` in `~/.claude/projects/<encoded-cwd>/` where encoding replaces `/` with `-`. Documented v1 limitation: concurrent sessions in the same project directory will break the heuristic. Acceptable for prototype; called out in the hook prompt and SKILL.md.
- **Telemetry extraction via a tested Python script, not inline prompt computation.** Pushes mechanical computation out of the LLM prompt per the spirit of the `ns-refac-cli-push-down` skill. Script lives in `skills/dev-vibechk-branch-eval/scripts/extract-session-metrics.py`, invoked from the hook prompt, emits JSON to stdout.
- **PR body format: HTML-delimited block for machine extraction, human-readable inside.** Delimiter: `<!-- vibechk:telemetry:start -->` / `<!-- vibechk:telemetry:end -->`. Content is markdown bullets. Idempotent update (read body, strip old block if present, append fresh) so repeated hook runs do not accrete duplicates.
- **PR-must-exist precondition at telemetry time.** If no PR exists on the branch when the post-impl hook runs, the hook prints "No PR for this branch yet — run `gt submit --no-interactive` first, then re-trigger telemetry by re-running `brmem-branch-impl` on a fresh session" and stops cleanly. Avoids coupling vibechk to PR-creation concerns. This is the single most user-visible rough edge of the prototype; see Risks.
- **`allowed-tools` widening on `brmem-branch-impl`.** Must add `Bash(brmem put *)`, `Bash(gh pr view *)`, `Bash(gh pr edit *)`, `Bash(python3 *)`, `Bash(ls *)`, and `Write`. The skill's core "read-only on brmem" rule changes to: "Read-only on brmem for the core workflow; an optional post-hook may direct writes under its own guidance." Documented explicitly in the SKILL.md Rules section.
- **`dev-` prefix + `metadata.internal: true` at first ship.** Follows `AGENTS.md § Dev Skill Naming Convention`. Graduation is a separate PR.
- **Skill package layout.** `vibechk` is a **single skill** directory, not a new Python package. The two default-prompts ship as sibling files next to `SKILL.md`; the extractor script lives under `scripts/`. Users install the default-prompts by manual copy to `.twerk/prompts/`; the skill itself is installed via `npx skills`.
- **No programmatic unit tests for the skills themselves.** Skills are LLM-instruction artifacts and follow the existing repo pattern of "Manual verification scenarios" in each SKILL.md. The one exception is `extract-session-metrics.py`, which is normal Python and gets pytest coverage.

---

## Open Questions

### Resolved During Planning

- **Hook file naming and layout** — flat, `.twerk/prompts/brmem-branch-create-post.md` and `brmem-branch-impl-post.md`. Resolved in Key Technical Decisions.
- **JSONL session identification** — mtime of the latest file in the `cwd`-encoded project directory. Documented limitation.
- **Namespace for vibechk notes** — `vibechk` namespace; enables single-call `brmem copy`.
- **How the eval skill applies suggestions** — per R12 rigor bar: commit at least one change OR document why each suggestion was skipped. Enforced by prompt discipline in the SKILL.md, not by code.
- **Where the telemetry block lives in the PR body** — append-by-delimiter, idempotent. Documented in U3/U5.
- **PR-absent behavior** — hook reports cleanly and does not attempt PR creation. Documented in Key Technical Decisions.
- **Dev prefix vs published skill** — ship as `dev-vibechk-branch-eval` now; graduate later.

### Deferred to Implementation

- **Exact `allowed-tools` pattern granularity** for `brmem-branch-impl`. `Bash(gh *)` is simpler but broad; `Bash(gh pr view *)` + `Bash(gh pr edit *)` is narrower. Implementer should pick the narrowest pattern that covers real hook operations; confirm against the current `gh pr view/edit` flag shapes at implementation time. Do NOT widen to `Bash(*)`.
- **`gt submit` interaction with the telemetry block.** Empirically, `gt submit` should leave an already-edited body intact, but this needs a manual verification pass at implementation time. If `gt submit` overwrites the body, the prototype gains a small manual re-trigger step; document it.
- **Exact format of the `extract-session-metrics.py` JSON output.** Field names (`session_id`, `tool_uses`, `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `assistant_messages`, `latest_timestamp`) are sketched below but may be adjusted based on what the hook prompt actually needs to render into the PR body.
- **Whether `ls`/`stat` or a pure-Python `os.scandir()` drives the mtime sort.** Implementer picks; matters only for cross-platform behavior, which twerk is not currently claiming.
- **Rollback of a partially-applied vibechk hook** — e.g., the hook writes the notes but the PR edit fails. Minimum acceptable: print the failure clearly, leave the notes in brmem, exit non-zero. Richer compensation (remove the notes) is out of scope.

---

## Output Structure

New and modified files produced by this plan, repo-relative:

    skills/
    ├── brmem-branch-create/
    │   └── SKILL.md                              # MODIFIED (U1)
    ├── brmem-branch-impl/
    │   └── SKILL.md                              # MODIFIED (U2) — widen allowed-tools, add Step 7
    └── dev-vibechk-branch-eval/                  # NEW (U4-U6)
        ├── SKILL.md                              # skill workflow: eval-branch spawn + apply
        ├── default-prompt-create-post.md         # vibechk's post-create hook template
        ├── default-prompt-impl-post.md           # vibechk's post-impl hook template
        └── scripts/
            ├── __init__.py                       # empty
            ├── extract_session_metrics.py        # JSONL → metrics JSON
            └── tests/
                ├── __init__.py                   # empty
                ├── conftest.py                   # pytest fixtures (tmp JSONL)
                └── test_extract_session_metrics.py

    .agents/skills/
    └── dev-vibechk-branch-eval                   # NEW symlink → ../../skills/dev-vibechk-branch-eval (U7)

    .claude/skills/
    └── dev-vibechk-branch-eval                   # NEW symlink → ../../.agents/skills/dev-vibechk-branch-eval (U7)

    skills-lock.json                              # MODIFIED (U7) — register new skill

    AGENTS.md                                     # MODIFIED (U7 or U8) — one-line pointer to the post-hook convention

Per `AGENTS.md § Package Import Rules`, `__init__.py` files stay empty.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Hook flow (base skill + vibechk, side-by-side)

```
brmem-branch-create                          brmem-branch-impl
----------------------                       ----------------------
Steps 1-7: existing                          Steps 1-6: existing (load + implement)
Step 8: Report (existing)                    Step 7: NEW — Optional post-hook
Step 9: NEW — Optional post-hook               ├── if .twerk/prompts/
   ├── if .twerk/prompts/                     │      brmem-branch-impl-post.md exists:
   │      brmem-branch-create-post.md          │      Read it, follow it inline
   │      exists:                              │   (vibechk instructs agent to:
   │      Read it, follow it inline            │      - summarize session →
   │   (vibechk instructs agent to:            │        brmem put vibechk/impl-session-notes.txt
   │      - summarize planning →               │      - run extract_session_metrics.py
   │        brmem put vibechk/                 │      - read current PR body (abort if no PR)
   │        plan-session-notes.txt)            │      - append <!-- vibechk:telemetry --> block
   └── else: return (no-op)                    │      - gh pr edit --body-file)
                                               └── else: return (no-op)
```

### JSONL record shape (verified)

```
first record                         assistant record (message payload)
{                                    {
  "type": ...,                         "type": "assistant",
  "sessionId": "<uuid>",               "message": {
  "permissionMode": ...                  "role": "assistant",
}                                        "content": [
                                           { "type": "tool_use", ... },    # counted
                                           { "type": "text", ... }
                                         ],
                                         "usage": {
                                           "input_tokens": N,              # summed
                                           "output_tokens": N,             # summed
                                           "cache_creation_input_tokens": N,# summed
                                           "cache_read_input_tokens": N    # summed
                                         }
                                       }
                                    }
```

### Extractor output sketch

```json
{
  "session_id": "a93378a6-c26b-44c2-8b4d-44135bffef32",
  "jsonl_path": "/Users/you/.claude/projects/.../a93378a6-c26b-44c2-8b4d-44135bffef32.jsonl",
  "assistant_messages": 79,
  "tool_uses": 36,
  "input_tokens": 175,
  "output_tokens": 201985,
  "cache_creation_input_tokens": 558626,
  "cache_read_input_tokens": 6838439,
  "latest_timestamp": "2026-04-24T20:35:37.866Z"
}
```

### PR body telemetry block shape

```
<!-- vibechk:telemetry:start -->
## vibechk telemetry

- Session: `a93378a6-c26b-44c2-8b4d-44135bffef32`
- Assistant messages: 79
- Tool uses: 36
- Input tokens: 175
- Output tokens: 201,985
- Cache creation tokens: 558,626
- Cache read tokens: 6,838,439
- Captured at: 2026-04-24T20:35:37.866Z
<!-- vibechk:telemetry:end -->
```

Idempotent update: the hook reads the existing body, strips any existing delimited block, appends a fresh one, writes back.

---

## Implementation Units

- U1. **Add optional post-hook to `brmem-branch-create`**

**Goal:** Teach `brmem-branch-create` to run an optional post-hook after its report step, without changing any existing behavior when the hook file is absent.

**Requirements:** R6, R15

**Dependencies:** None.

**Files:**
- Modify: `skills/brmem-branch-create/SKILL.md`
- Test: manual verification scenarios inside the SKILL.md file (existing convention; extend with new cases)

**Approach:**
- After Step 8 "Report", add Step 9 "Optional post-hook". The step checks for `.twerk/prompts/brmem-branch-create-post.md`; if present, reads it verbatim and follows its instructions; if absent, returns.
- Do NOT mirror the primary plugin's "Require the plugin to exist" rule — the post-hook is LBYL.
- Do NOT widen `allowed-tools`. The hook prompt's directives run under the existing toolset (`Bash(brmem put *)` is already allowed).
- Add one sentence under "Rules" explaining that an optional post-hook may run after Step 8.
- Add three new entries to "Manual verification scenarios":
  - Hook absent → skill behaves byte-for-byte as today.
  - Hook present and instructs additional `brmem put` calls → calls succeed after the primary stash.
  - Hook present but malformed/unreadable → skill reports the hook error after the primary stash succeeded (partial success is acceptable).

**Patterns to follow:**
- `skills/brmem-branch-create/SKILL.md` Step 1 "Ensure the plugin exists" — but with `git rev-parse --show-toplevel` already done; the post-hook check is a simple file-exists test followed by a `Read`.

**Test scenarios:**
- Happy path — Hook file absent; primary stash succeeds; skill terminates at Step 8 as today.
- Happy path — Hook file present; skill performs primary stash, then reads the hook file, then follows its instructions to issue additional `brmem put --namespace vibechk plan-session-notes.txt --stdin` calls; final report mentions both the primary plan entry and the vibechk entry.
- Edge case — Hook file exists but is empty; skill completes primary stash and logs "hook file empty; no further action" without error.
- Error path — Hook file exists but `Read` fails (e.g., permission denied); primary stash already succeeded; skill surfaces the hook read error but does NOT rollback the primary stash.
- Integration scenario — With vibechk's `default-prompt-create-post.md` copied to `.twerk/prompts/brmem-branch-create-post.md`: invoking `brmem-branch-create` produces both `base/plans/<slug>.md` and `vibechk/plan-session-notes.txt` on the new branch; `brmem list --branch <new>` returns both.

**Verification:**
- `diff` between post-Step-8 behavior today and post-Step-8 behavior with hook absent is empty.
- Rules section acknowledges the optional hook.

---

- U2. **Add optional post-hook to `brmem-branch-impl` and widen `allowed-tools`**

**Goal:** Teach `brmem-branch-impl` to run an optional post-hook after implementation completes, and widen its toolset to admit what vibechk's hook needs.

**Requirements:** R6, R15

**Dependencies:** None (U1 not strictly required, but reviewing them together keeps the two skill changes consistent).

**Files:**
- Modify: `skills/brmem-branch-impl/SKILL.md`
- Test: manual verification scenarios inside the SKILL.md file

**Approach:**
- Add a new Step 7 "Optional post-implementation hook" after Step 6 "Begin implementation". LBYL check for `.twerk/prompts/brmem-branch-impl-post.md`; if present, read and follow; if absent, return.
- Widen `allowed-tools` to add: `Bash(brmem put *)`, `Bash(gh pr view *)`, `Bash(gh pr edit *)`, `Bash(python3 *)`, `Bash(ls *)`, `Write`. Pick narrow `gh` patterns where possible; do NOT use `Bash(*)`.
- Update the "Read-only on `brmem`" rule: "Read-only on `brmem` for the core workflow. An optional post-hook at `.twerk/prompts/brmem-branch-impl-post.md` may direct `brmem put` calls under its own guidance; the skill's core steps 1–6 remain read-only."
- Add manual verification scenarios covering hook-absent (unchanged behavior), hook-present (writes to brmem + edits PR body), and PR-absent (hook aborts cleanly).

**Patterns to follow:**
- U1's post-hook seam pattern, adapted to `brmem-branch-impl`'s Step 6 exit.
- `.agents/skills/graphite/SKILL.md` PR body editing guidance — hook prompt must use `/tmp/pr-body.md` + `--body-file`, never heredoc.

**Test scenarios:**
- Happy path — Hook file absent; implementation runs, skill terminates at Step 6 as today; no new writes to brmem; no PR edits.
- Happy path — Hook file present, PR exists: after implementation, hook reads JSONL → writes `impl-session-notes.txt` → appends telemetry block to PR body → terminates cleanly.
- Happy path — Hook file present, repeated run (same session): telemetry block is updated in place, not duplicated. (Validates the idempotent delimiter-strip-and-append.)
- Edge case — Hook file present, impl-session-notes already exists in brmem on this branch: overwrite is acceptable for v1; the hook prompt must declare this explicitly.
- Error path — Hook file present, no PR on branch: hook prints the "run `gt submit` first" message and exits without touching brmem.
- Error path — Hook file present, `extract_session_metrics.py` exits non-zero: hook surfaces the error, does NOT write notes, does NOT edit PR body; implementation itself is unaffected.
- Error path — Hook file present, `gh pr edit` fails (auth/network): hook has already written notes to brmem; it surfaces the PR-edit failure and leaves notes in place (partial state is acceptable for v1 per Open Questions).
- Integration scenario — With vibechk installed and a PR present: after an impl session, `brmem get vibechk/impl-session-notes.txt --branch <current>` returns a prose summary and `gh pr view <num> --json body -q .body` contains a single `<!-- vibechk:telemetry:start -->` block.

**Verification:**
- Hook-absent behavior is indistinguishable from today's — the widened `allowed-tools` is observable only when the hook is present.
- The core "read-only on `brmem`" guarantee is preserved for steps 1–6.

---

- U3. **Build `extract_session_metrics.py` helper with pytest coverage**

**Goal:** Ship a tested Python script that identifies the current Claude Code session's JSONL file, aggregates token + tool-use totals, and emits JSON to stdout.

**Requirements:** R7

**Dependencies:** None.

**Files:**
- Create: `skills/dev-vibechk-branch-eval/scripts/extract_session_metrics.py`
- Create: `skills/dev-vibechk-branch-eval/scripts/__init__.py` (empty)
- Create: `skills/dev-vibechk-branch-eval/scripts/tests/__init__.py` (empty)
- Create: `skills/dev-vibechk-branch-eval/scripts/tests/conftest.py`
- Create: `skills/dev-vibechk-branch-eval/scripts/tests/test_extract_session_metrics.py`

**Approach:**
- Single-file Python 3.11+ script, stdlib-only (json, pathlib, sys, argparse, os).
- CLI shape: `python3 extract_session_metrics.py [--cwd <path>] [--jsonl <file>] [--home <dir>]`.
- Defaults: `cwd` from `os.getcwd()`, `home` from `~`, `jsonl` derived by picking max-mtime `*.jsonl` in `<home>/.claude/projects/<encode(cwd)>/` where `encode` replaces `/` with `-`.
- Aggregation: iterate lines; for each `type == "assistant"` record, sum `message.usage.{input,output,cache_creation_input,cache_read_input}_tokens` and count `message.content[]` blocks with `type == "tool_use"`.
- Output JSON with keys: `session_id`, `jsonl_path`, `assistant_messages`, `tool_uses`, `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `latest_timestamp`.
- Exit codes: 0 success, 1 no JSONL found, 2 parse failure on a required line.
- Use frozen dataclass or a Pydantic model for the output shape per `CLAUDE.md` Development Rules.
- **Secret safety:** JSONL transcripts may contain pasted secrets, private file paths, or credentials. Parse-error output (stderr or stdout) MUST surface only the JSONL filename, line number, and error category — never the raw line content or any field value from the line. Tests must include a parse-error fixture that confirms no JSONL bytes leak to stderr or stdout.
- **Sandbox sanity check before committing to the default discovery path:** During implementation, verify that `Bash(python3 ...)` launched from within the `brmem-branch-impl` skill can actually read files under `~/.claude/projects/`. Claude Code's sandboxing treats Bash-spawned processes differently from the `Read` tool; if the discovery path is blocked, promote `--jsonl <path>` to the primary interface and document it in the hook prompt. Note the result explicitly in the U8 verification pass.
- Test directory is `skills/dev-vibechk-branch-eval/scripts/tests/` — a skill-local convention rather than twerk's package-level `tests/{unit,integration,...}/` layout because this helper is not a package. Note this in the test file docstring so reviewers do not flag it as a convention violation.

**Execution note:** Implement test-first. Write `test_extract_session_metrics.py` with a fixture JSONL mirroring the verified shape from the Technical Design section; iterate until the script passes.

**Technical design:** *(directional — one-file layout, frozen dataclass for output, argparse CLI)*

```
extract_session_metrics.py (sketch)

@dataclass(frozen=True)
class SessionMetrics:
    session_id: str
    jsonl_path: str
    assistant_messages: int
    tool_uses: int
    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int
    latest_timestamp: str | None

def encode_cwd(cwd: str) -> str: ...
def find_latest_jsonl(home: Path, cwd: str) -> Path | None: ...
def aggregate(jsonl: Path) -> SessionMetrics: ...
def main() -> int: ...
```

**Patterns to follow:**
- `CLAUDE.md § Tech Stack` — Python 3.11+, frozen dataclasses, modern type syntax.
- `AGENTS.md § Package Import Rules` — empty `__init__.py` files; import from canonical paths.
- pytest conventions from existing scenario tests (e.g., `packages/twerk-pr-address/tests/scenario/test_operations.py`): functional tests, `tmp_path`, no test classes.

**Test scenarios:**
- Happy path — Fixture JSONL with 3 assistant turns and 5 tool_use blocks; output contains correct sums, counts, and session_id.
- Happy path — `--jsonl` flag overrides discovery; script uses the given file even when the cwd-based directory has other candidates.
- Edge case — Empty JSONL file (0 bytes); script exits 1 with message "no records found".
- Edge case — JSONL with only `type=="user"` records; `assistant_messages` == 0, all totals == 0; exits 0.
- Edge case — Assistant record missing `usage` key; script treats missing values as 0, does not crash.
- Edge case — Assistant record missing `content`; tool_uses counted from other records only.
- Edge case — Content block is a plain string (legacy format), not a list of dicts; script counts 0 tool_uses from that record, does not crash.
- Error path — No JSONL files in the target dir; script exits 1 with a clear message naming the directory it checked.
- Error path — JSONL contains a malformed JSON line; script exits 2, names the filename and line number, and does NOT include any characters from the offending line in the error output.
- Error path — JSONL line is well-formed JSON but assistant-with-`usage` has a non-numeric token value; script exits 2, names the filename, line number, and field name, and does NOT include the raw value.
- Integration scenario — Invoke with `--cwd=/Users/schrockn/code/twerk` against a real JSONL dir containing multiple files with different mtimes; script picks the most recent and reports its session_id.

**Verification:**
- `pytest skills/dev-vibechk-branch-eval/scripts/tests/` passes.
- `python3 skills/dev-vibechk-branch-eval/scripts/extract_session_metrics.py` in this repo produces a JSON payload with non-zero `assistant_messages`.

---

- U4. **Create `dev-vibechk-branch-eval` skill**

**Goal:** Ship the skill that operates the A/B branch workflow from an Impl branch: spawn ImprovedContextBranch off the parent, copy notes forward, apply impl-session-notes suggestions.

**Requirements:** R8, R9, R12, R16

**Dependencies:** None at plan time (but operationally depends on U1/U2 hooks being live for end-to-end work).

**Files:**
- Create: `skills/dev-vibechk-branch-eval/SKILL.md`

**Approach:**
- Frontmatter: `name: dev-vibechk-branch-eval`, `metadata.internal: true`, `allowed-tools` including `Bash(git *)`, `Bash(gt *)`, `Bash(brmem list *)`, `Bash(brmem get *)`, `Bash(brmem copy *)`, `Read`, `Write`, `Edit`. Description must clearly disclose the branch-spawning side-effect.
- Workflow sections:
  1. Pre-flight: confirm git repo, refuse trunk, confirm current branch has `brmem list --namespace vibechk` entries for `plan-session-notes.txt` and `impl-session-notes.txt` (both required; abort otherwise).
  2. Identify parent: `git rev-parse <current-branch>^` OR read the Graphite parent if available; ask user if ambiguous.
  3. Delegate branch creation: invoke the repo's `.twerk/prompts/brmem-branch-create.md` contract by handing it a suggested slug like `<current-branch>--vibechk-improved`. Accept the plugin's final branch name. This respects repo branch policy (Graphite vs git).
  4. Copy notes: `brmem copy --namespace vibechk --from-branch <current> --to-branch <improved>`. Single call covers both files because they share the namespace.
  5. Read `impl-session-notes.txt` via `brmem get vibechk/impl-session-notes.txt --branch <improved>`.
  6. Apply suggestions: for each discrete suggestion in the notes, the skill acts on it (add doc, create skill, edit code) using normal `Read`/`Write`/`Edit` tools. **Commit discipline:** one commit per discrete suggestion using `git commit -m "<summary>"`. Tightly-coupled edits that only make sense together (e.g., three typo fixes in one doc) may land as a single commit with a message that names each sub-suggestion; never batch logically unrelated suggestions into one commit. **Rigor bar:** the session must either commit at least one change OR explicitly record why each suggestion was skipped in a final report.
  7. Report: final branch name, per-suggestion disposition (applied → commit SHA, or skipped → reason), notes carried forward.
- Add a "Manual verification scenarios" section matching the existing skill pattern.
- Update SKILL.md to reference the extractor script's location and the two default-prompts for install guidance.

**Patterns to follow:**
- `skills/brmem-branch-create/SKILL.md` — pre-flight shape, abort messages, plugin-contract invocation pattern.
- `skills/brmem-branch-impl/SKILL.md` — trunk-refusal, branch-detection idioms.
- `skills/objective-reconcile/SKILL.md` (local skill that also applies judgment-driven edits to markdown) — for tone of the "apply suggestions" workflow step.

**Test scenarios:**
- Happy path — Impl branch with both notes in `vibechk` namespace; skill creates `<impl>--vibechk-improved` off parent, copies notes, reads impl notes, commits 2 suggestion-driven changes, reports "2 applied, 0 skipped".
- Happy path — Some suggestions are vague; skill records "skipped: <suggestion> — too vague to act on without clarification" in the final report; verifies the rigor bar fires.
- Edge case — No `vibechk/impl-session-notes.txt` on the current branch; skill aborts with the specific missing-key message.
- Edge case — Only one of the two notes files present; skill aborts (both required for faithful carry-forward).
- Edge case — Parent branch is trunk (`main`/`master`); skill aborts — refusing to spawn an eval branch directly off trunk would be suspicious; re-read the origin before proceeding.
- Error path — `brmem copy` fails with `destination_conflict` because the improved branch already has `vibechk` entries (e.g., left over from a prior aborted run); skill prints guidance to re-delete the improved branch and retry, does NOT `--overwrite` automatically.
- Error path — Branch-creation plugin fails or is missing; skill aborts citing the primary plugin requirement.
- Integration scenario — End-to-end with U1/U2 hooks live: run `brmem-branch-create` on a plan, switch to Impl, run `brmem-branch-impl`, invoke `dev-vibechk-branch-eval`, confirm `ImprovedContextBranch` exists with both notes and with at least one suggestion commit.

**Verification:**
- `Manual verification scenarios` section in the SKILL.md covers the happy path, the rigor-bar scenario, and at least one abort.
- Skill does not reference twerk-internal module paths (public-skill rule — even under `dev-` prefix, keep this clean to ease graduation).

---

- U5. **Write vibechk's two default-prompt files**

**Goal:** Produce the two prompt files that users copy to `.twerk/prompts/` to activate vibechk. They encode vibechk's opinionated behavior (what notes to write, telemetry format, PR body shape) as free-form markdown.

**Requirements:** R1, R2, R4, R5, R7, R10, R11, R16

**Dependencies:** U1, U2 (hook contracts must be defined); U3 (extractor script exists so the impl-post hook can reference it).

**Files:**
- Create: `skills/dev-vibechk-branch-eval/default-prompt-create-post.md`
- Create: `skills/dev-vibechk-branch-eval/default-prompt-impl-post.md`

**Approach:**
- Both files mirror the shape of `skills/brmem-branch-create/default-prompt.md`: a scope statement up top, then input-from-skill, contract steps, default behavior, customization guidance.
- `default-prompt-create-post.md`: instructs the session agent to summarize the planning session context in prose and run `brmem put plan-session-notes.txt --namespace vibechk --branch <final-branch> --stdin` piping the summary. Includes a prompt for what the summary should contain (what was examined, alternatives considered, decisions).
- `default-prompt-impl-post.md`: instructs the session agent to (a) summarize the impl session in prose and write to `brmem put impl-session-notes.txt --namespace vibechk --branch <current> --stdin`; (b) run `python3 <repo-root>/skills/dev-vibechk-branch-eval/scripts/extract_session_metrics.py` to get metrics JSON; (c) identify the PR with `gh pr view <current> --json number,body -q '{number: .number, body: .body}'` (abort with user-guidance if none); (d) compose the telemetry block; (e) strip any prior vibechk:telemetry block from the body; (f) append the new block; (g) write the assembled body to `/tmp/vibechk-pr-body.md`; (h) `gh pr edit <num> --body-file /tmp/vibechk-pr-body.md`.
- Both files explicitly note: "This is vibechk's opinionated opinion. Edit this file to change what vibechk captures in this repo."

**Patterns to follow:**
- `skills/brmem-branch-create/default-prompt.md` structural shape.
- `.agents/skills/graphite/SKILL.md` — `--body-file` usage pattern.
- `skills/dev-gh/references/gh.md` — PR read-modify-write pattern.

**Test scenarios:**
- Test expectation: manual verification — both prompts are markdown content, not executable code. Verified via U1/U2/U9 end-to-end scenarios. No dedicated unit tests.

**Verification:**
- Running through the prompts by hand (as the session agent would) produces the expected brmem entries and PR body shape.
- Neither prompt references absolute user-specific paths.

---

- U6. **Install vibechk: symlinks, skills-lock.json, and repo-local prompt activation**

**Goal:** Make `dev-vibechk-branch-eval` discoverable via `.claude/` and `.agents/`, register it in `skills-lock.json`, and activate the hooks locally by copying the two default-prompts into `.twerk/prompts/`.

**Requirements:** R16

**Dependencies:** U4 (skill directory exists).

**Files:**
- Create symlink: `.agents/skills/dev-vibechk-branch-eval` → `../../skills/dev-vibechk-branch-eval`
- Create symlink: `.claude/skills/dev-vibechk-branch-eval` → `../../.agents/skills/dev-vibechk-branch-eval`
- Modify: `skills-lock.json` (register the new skill with `source: "skills/dev-vibechk-branch-eval"`, `sourceType: "local"`)
- Create: `.twerk/prompts/brmem-branch-create-post.md` (copy of `skills/dev-vibechk-branch-eval/default-prompt-create-post.md`)
- Create: `.twerk/prompts/brmem-branch-impl-post.md` (copy of `skills/dev-vibechk-branch-eval/default-prompt-impl-post.md`)

**Approach:**
- Prefer `npx skills add local` with the canonical `--agent codex claude-code -y` flag from `ns-skill-management`; it handles symlinks + skills-lock.json updates.
- If `skills-lock.json` is still in `UU` merge-unresolved state at implementation time, resolve that first (out of plan scope — it predates this work).
- Copying the two default-prompts into `.twerk/prompts/` is a manual `cp` step. Do NOT automate this inside a skill — it's a one-time operation per repo and an explicit opt-in gesture. Call it out in the final report.
- Verify by running `brmem-branch-create` in dry-test mode on a throwaway branch and confirming the hook fires.

**Patterns to follow:**
- `.agents/skills/ns-skill-management/SKILL.md` — canonical install flow.
- `skills-lock.json` existing entries for local skills — copy the `source`/`sourceType`/`computedHash` shape.

**Test scenarios:**
- Happy path — After install, `ls -la .claude/skills/dev-vibechk-branch-eval` resolves through two symlink hops to the real directory.
- Happy path — `cat skills-lock.json | jq '.skills["dev-vibechk-branch-eval"]'` returns the new entry.
- Edge case — `skills-lock.json` is in `UU` merge-unresolved state; installer aborts with a clear message and does NOT attempt to edit the file.
- Edge case — `.twerk/prompts/brmem-branch-create-post.md` already exists (prior plugin or manual edit); operator is warned before overwriting; `cp -n` or explicit confirmation.
- Integration scenario — Full install dry-run: create a disposable branch, invoke `brmem-branch-create`, confirm both `plans/*.md` and `vibechk/plan-session-notes.txt` land.

**Verification:**
- `skills-lock.json` entry exists and is hashable.
- Symlinks resolve.
- `.twerk/prompts/` contains both post-hook files.

---

- U7. **Update `AGENTS.md` with a one-line pointer to the post-hook convention**

**Goal:** Make the new optional post-hook contract discoverable to agents and humans reading the repo's conventions file.

**Requirements:** R6, R15, R16

**Dependencies:** U1, U2.

**Files:**
- Modify: `AGENTS.md`

**Approach:**
- Add a short section, e.g., `### Optional Post-Hooks on `brmem-branch-*` Skills`, under the existing `How to use skills` block. One or two paragraphs naming the two hook paths, the LBYL semantics, and pointing at `dev-vibechk-branch-eval` as the first and so-far only plugin using them.
- Do not describe vibechk's opinions in `AGENTS.md` — that belongs in the skill's SKILL.md. The convention note is plugin-agnostic.

**Patterns to follow:**
- Existing `AGENTS.md` sections such as `### GitHub Backend Interactions` — short, prescriptive, single-pointer style.

**Test scenarios:**
- Test expectation: none — documentation-only change. Proofread pass is sufficient; no unit tests.

**Verification:**
- Reading the new section communicates the contract to a first-time contributor without requiring them to open the skill files.

---

- U8. **End-to-end manual verification pass**

**Goal:** Run the full Base → Impl → ImprovedContextBranch workflow once with vibechk installed and confirm every artifact lands correctly.

**Requirements:** All R-IDs (integration-level verification of the plan as a whole).

**Dependencies:** U1, U2, U3, U4, U5, U6, U7.

**Files:**
- Test: ad-hoc — no files created. Results land in a short scratch document or a comment trail in the associated PR.

**Approach:**
- Pick a tiny real task in this repo (e.g., fix a typo in a doc). Run the complete flow:
  1. Start a fresh Claude Code session; brainstorm and plan the task.
  2. `brmem-branch-create` → confirm `plan.md` and `vibechk/plan-session-notes.txt` both land in brmem.
  3. Switch to the Impl branch in a fresh Claude Code session; `brmem-branch-impl` → confirm impl runs, `vibechk/impl-session-notes.txt` lands, telemetry block appears in the PR body, metrics numbers look plausible.
  4. Invoke `dev-vibechk-branch-eval` from Impl → confirm `ImprovedContextBranch` created off parent, both notes copied, at least one suggestion applied as a commit, rigor-bar report printed.
  5. Optionally continue to F4 (second impl on Impl2) to validate round-trip.
- Capture any friction or unexpected behavior and either fix inline or record as follow-up in the plan's Open Questions / Deferred to Implementation.

**Execution note:** Run this in a fresh session specifically to avoid conflating planning-session tokens with implementation-session tokens — the limitation the mtime heuristic has documented.

**Patterns to follow:**
- Existing skills' "Manual verification scenarios" sections demonstrate the manual-testing mindset this unit exercises.

**Test scenarios:**
- Test expectation: none (integration pass; findings captured as follow-ups rather than formal tests).

**Verification:**
- The full walkthrough completes without manual patching between skills.
- Both notes exist in brmem on both Impl and ImprovedContextBranch.
- PR body on Impl contains a single, well-formed telemetry block.
- Any gaps uncovered are either fixed in-pass or recorded as explicit follow-up items before the plan closes.

---

## System-Wide Impact

- **Interaction graph:**
  - `brmem-branch-create` gains a post-hook seam — any plugin installed at `.twerk/prompts/brmem-branch-create-post.md` is invoked. Today only vibechk. Future plugins must be aware of this shared slot.
  - `brmem-branch-impl` gains a post-hook seam and a widened `allowed-tools`. Same sharing concerns.
  - `dev-vibechk-branch-eval` depends on `.twerk/prompts/brmem-branch-create.md` (primary plugin) to create the improved branch — tight coupling to the existing branch-creation plugin contract.
- **Error propagation:**
  - Hook-prompt errors (read failure, malformed markdown) surface as post-primary errors. The primary stash/impl has already succeeded; the hook failure is reported but does not rewind the primary work.
  - `extract_session_metrics.py` errors surface as exit-code failures through the hook prompt; the hook halts without writing notes or editing the PR.
  - `gh pr edit` auth/network failures leave notes written but PR unchanged — acceptable partial state for v1 (see Risks).
- **State lifecycle risks:**
  - Duplicate telemetry blocks in the PR body are prevented by the idempotent strip-and-append pattern.
  - Re-running `brmem-branch-impl` in the same session accumulates tokens; telemetry will reflect the cumulative session, not the incremental impl. Documented user discipline: one fresh session per impl.
  - Overwriting notes files on re-run is acceptable per origin — v1 trade-off.
- **API surface parity:** none — vibechk adds no public CLI or gateway surface.
- **Integration coverage:**
  - U8's end-to-end walkthrough is the only integration-level verification.
  - Unit-level coverage exists for `extract_session_metrics.py`; skills rely on manual verification scenarios per repo convention.
- **Unchanged invariants:**
  - `brmem` CLI semantics — unchanged; vibechk uses existing commands (`put`, `get`, `copy`, `list`) without new flags.
  - `brmem-branch-create`'s primary-plugin requirement — unchanged; the post-hook is additive and optional.
  - `brmem-branch-impl`'s "read-only on brmem for the core workflow" guarantee — steps 1–6 remain read-only; only the optional Step 7 hook may direct writes.
  - Twerk's Graphite-preferred branch workflow — vibechk delegates branch creation to the primary plugin, which already handles `gt create`.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `extract_session_metrics.py` mtime heuristic misidentifies the session when the user runs multiple Claude Code sessions against the same cwd | Document the "fresh session per impl" discipline in both the skill SKILL.md and the `default-prompt-impl-post.md`. Escape hatch: `--jsonl <path>` flag lets the user pin the file explicitly. |
| `gt submit` or a manual PR body edit strips the vibechk telemetry block | v1 tolerance: re-run `brmem-branch-impl` (or a small refresh command later) to re-append. Documented as a known-rough-edge. |
| Widening `brmem-branch-impl`'s `allowed-tools` weakens the "read-only on brmem" invariant when the hook is not installed | Tools are still gated per-invocation by the user's permission prompt. The SKILL.md Rules section preserves the invariant for the core workflow; the hook is additive. |
| Claude Code's JSONL schema changes, breaking the extractor | Schema was verified empirically as of 2026-04-24. If schema shifts, fail fast (`extract_session_metrics.py` raises on unknown field layouts); add a schema-version check if repeated drift occurs. |
| Default-prompt files in `.twerk/prompts/` get committed and then diverge from the skill's canonical `default-prompt-*.md` | Document the "sync periodically" guidance in the skill's SKILL.md; accepted drift is the whole point of repo-local overrides. |
| Skill-lock.json merge conflict (currently present per git status) blocks the install step | Resolve the pre-existing conflict before running U6; it's pre-existing work unrelated to this plan. |
| `Write` tool in `brmem-branch-impl`'s widened `allowed-tools` is used for unrelated writes | Rules section explicitly scopes `Write` to "only in service of the optional post-hook's temp-file needs"; a reviewer or auditing tool can catch misuse. |
| Multi-plugin coexistence at a hook point (future, out of scope) | Origin R15 acknowledges this as v2. If a second plugin shows up before then, users merge prompts by hand. |

---

## Documentation / Operational Notes

- Skill's own SKILL.md documents install: copy the two default-prompts to `.twerk/prompts/`, run `npx skills add local …`.
- `AGENTS.md` (U7) adds a one-line pointer for discoverability.
- No CHANGELOG update in this plan — `CHANGELOG.md` does not exist in twerk today (per earlier research).
- Graduation runbook: future one-line PR when the prototype validates — drop `dev-` prefix in the skill directory name, in `.agents/skills/` and `.claude/skills/` symlinks, and in `skills-lock.json`; remove `metadata.internal: true`; scrub any twerk-internal references in the SKILL.md; update AGENTS.md pointer.

---

## Sources & References

- **Origin document:** `docs/brainstorms/session-learning-branch-evals-requirements.md`
- Existing skills that set the patterns to mirror:
  - `skills/brmem-branch-create/SKILL.md`
  - `skills/brmem-branch-create/default-prompt.md`
  - `skills/brmem-branch-impl/SKILL.md`
  - `skills/objective-reconcile/SKILL.md`
- `brmem` CLI source: `packages/twerk-core/src/twerk_core/brmem/`
- Install convention: `.agents/skills/ns-skill-management/SKILL.md`
- Graphite / PR body convention: `.agents/skills/graphite/SKILL.md`, `skills/dev-gh/references/gh.md`
- Twerk repo rules: `AGENTS.md`, `CLAUDE.md`
