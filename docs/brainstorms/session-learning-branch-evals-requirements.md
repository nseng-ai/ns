---
date: 2026-04-24
topic: session-learning-branch-evals
codename: vibechk
---

# Session Learning via Branch-Memory Evals (`vibechk`)

## Problem Frame

Twerk sessions produce a lot of implicit learning — what context actually mattered for planning, what gaps in docs or skills slowed implementation down, what surprises showed up mid-execution — and none of it is captured today. We also have no concrete way to tell whether adding a skill or doc file *actually* improves future sessions on the same kind of work.

The goal is a deliberately crude, **opt-in plugin** — codename `vibechk` — that does two things:

1. Captures a plain-text summary of "what was in context" at two natural moments — right after branch creation (planning session) and right after implementation (impl session) — and parks both into `brmem` on the branch.
2. Uses git branching itself as the eval substrate: a sibling branch off the parent applies the impl-session suggestions, re-plans with the captured planning context, and re-implements. Tool-call counts and token costs from each implementation get posted into the PR body so the two runs can be compared later by a prompt-driven read of the PRs.

**Core architectural commitment**: none of this behavior is baked into the existing `brmem-branch-create` / `brmem-branch-impl` skills. The skills gain *optional prompt-based hook contracts*; `vibechk` plugs into those hook contracts by installing prompt files at known paths. If `vibechk` is not installed, the base skills behave exactly as they do today. The prompts *are* the hook points.

No external eval tool, no schema'd note format, no automated chain. Steel-thread prototype meant to test whether the *workflow* is useful before investing in infrastructure.

---

## Actors

- A1. **User**: engineer driving twerk; invokes each skill explicitly and reviews outputs. Opts into `vibechk` by installing its prompt files.
- A2. **Planning session agent**: the Claude Code session during which a plan is produced. If `vibechk`'s post-create hook is installed, also authors `plan-session-notes.txt` at branch-creation time following the hook prompt.
- A3. **Impl session agent**: the session that executes `brmem-branch-impl` on the Impl branch. If `vibechk`'s post-impl hook is installed, also authors `impl-session-notes.txt` and records telemetry into the PR body following the hook prompt.
- A4. **Eval session agent**: the session that invokes `vibechk-branch-eval`; creates `ImprovedContextBranch` off the parent, carries notes forward, and applies the doc/skill/code suggestions from `impl-session-notes.txt`.
- A5. **Second impl session agent**: the session that plans and implements on `Impl2` using the improved context and the carried-forward planning notes.
- A6. **Comparison session agent** (later, out of v1 scope for automation but flagged here): prompt-driven reader of the two PRs.

A2–A5 are session *roles*, not distinct agents. They may all be the same Claude Code session at different times, or different sessions entirely. Telemetry cleanliness depends on them being different sessions — see Dependencies / Assumptions.

---

## Key Flows

```
                        Base
                       /    \
                      /      \
               Impl (F2)   ImprovedContextBranch (F3)
                   |              |
                  PR1            Impl2 (F4)
                                  |
                                 PR2
```

- F1. **Plan capture** (vibechk-gated)
  - **Trigger:** user invokes `brmem-branch-create` at the end of a brainstorm or plan session.
  - **Actors:** A1, A2
  - **Steps:** existing branch-creation behavior runs; plan file is stashed into brmem on the new branch. After that, the skill checks for the post-create hook prompt file (see R6); if absent, it terminates normally. If present, A2 reads the prompt and — following its instructions — writes a plain-text summary of the planning session context and stashes it into brmem on the new branch under `plan-session-notes.txt`.
  - **Outcome:** new Impl branch exists; brmem on that branch contains the plan, plus `plan-session-notes.txt` if `vibechk` is installed.
  - **Covered by:** R1, R2, R3, R6, R15

- F2. **Implementation with reflection** (vibechk-gated)
  - **Trigger:** user is on the Impl branch and invokes `brmem-branch-impl`.
  - **Actors:** A1, A3
  - **Steps:** existing impl-loading behavior runs (now also loading `plan-session-notes.txt` if present); implementation proceeds. When implementation completes, the skill checks for the post-impl hook prompt file; if absent, it terminates normally. If present, A3 reads the prompt and — following its instructions — summarizes the implementation session into brmem under `impl-session-notes.txt`, extracts telemetry from the current session's JSONL transcript, and writes a telemetry block into the PR body (creating the PR as needed).
  - **Outcome:** Impl branch has both notes files in brmem if `vibechk` is installed; PR1 body contains a telemetry block.
  - **Covered by:** R4, R5, R6, R7, R10, R11, R15

- F3. **Eval-branch spawn**
  - **Trigger:** user on the Impl branch invokes `vibechk-branch-eval`.
  - **Actors:** A1, A4
  - **Steps:** create `ImprovedContextBranch` off the same parent (Base) using the repo's branch-creation plugin; copy `plan-session-notes.txt` and `impl-session-notes.txt` from Impl's brmem to ImprovedContextBranch's brmem; A4 reads `impl-session-notes.txt` and applies the suggested doc/skill/code changes as one or more commits on ImprovedContextBranch.
  - **Outcome:** ImprovedContextBranch exists, has the two notes files in brmem, and has commits that implement the improvement suggestions.
  - **Covered by:** R8, R9, R12

- F4. **Second implementation** (vibechk-gated for the notes/telemetry)
  - **Trigger:** user on ImprovedContextBranch invokes the existing plan/brainstorm flow + `brmem-branch-create` to produce `Impl2`, then runs `brmem-branch-impl` on it.
  - **Actors:** A1, A5
  - **Steps:** `plan-session-notes.txt` already on ImprovedContextBranch is carried forward as source material for re-planning; `brmem-branch-create` stashes the new plan onto Impl2 and (via `vibechk`'s post-create hook) a fresh `plan-session-notes.txt`; `brmem-branch-impl` runs as in F2, producing a fresh `impl-session-notes.txt` and writing telemetry to PR2 via `vibechk`'s post-impl hook.
  - **Outcome:** Impl2 branch exists with its own plan + notes; PR2 body contains a telemetry block comparable to PR1's.
  - **Covered by:** R1–R7, R10, R11

- F5. **Comparison** (out of v1 build scope; workflow endpoint, not automated here)
  - **Trigger:** user asks a Claude Code session to compare PR1 and PR2.
  - **Actors:** A1, A6
  - **Steps:** agent reads both PR bodies, extracts telemetry blocks, reads the code diffs, and produces a prose assessment.
  - **Outcome:** human-readable comparison. No dedicated tooling required in v1.

---

## Requirements

**Hook contracts (base-skill changes)**

- R6. The `brmem-branch-create` and `brmem-branch-impl` skills gain *optional prompt-based hook contracts*. After their primary work completes, each skill checks for a well-known repo-local prompt file; if present, it reads the file and follows its instructions inline (same pattern as the existing `.twerk/prompts/brmem-branch-create.md` plugin point). If absent, the skill terminates normally — the base skills are unchanged in behavior for repos that do not opt in.
  - `brmem-branch-create` post-hook path: `.twerk/prompts/brmem-branch-create-post.md` (proposed; exact filename deferred to planning).
  - `brmem-branch-impl` post-hook path: `.twerk/prompts/brmem-branch-impl-post.md` (proposed; exact filename deferred to planning).
- R15. The hook mechanism is generic: any plugin (not just `vibechk`) can occupy a hook file. v1 assumes at most one plugin per hook point; coexistence of multiple plugins at the same hook point is a v2 concern.

**Session notes capture (vibechk content)**

- R1. When `vibechk`'s post-create hook is installed, invoking `brmem-branch-create` causes the planning session agent to write a plain-text summary of the planning session context and stash it into brmem on the new branch under the key `plan-session-notes.txt`. Content of the hook prompt is part of what `vibechk` ships.
- R2. The content of `plan-session-notes.txt` is a free-form prose summary covering: what context was examined, what alternatives were considered, what was decided and why, and anything repo-specific that surfaced during planning. No required schema beyond "summary of what is in context."
- R3. `plan-session-notes.txt` sits alongside the plan file in brmem on the same branch and is loaded by `brmem-branch-impl` in the same sweep as the plan.
- R4. When `vibechk`'s post-impl hook is installed, the end of `brmem-branch-impl` causes the impl session agent to write a plain-text summary of the implementation session into brmem under the key `impl-session-notes.txt`. Content of the hook prompt is part of what `vibechk` ships.
- R5. The content of `impl-session-notes.txt` is a free-form prose summary covering: what went well, what was surprising, what gaps in documentation were felt, what skills would have helped, what codebase changes would make future implementations easier. No required schema.

**Telemetry (vibechk content)**

- R7. `vibechk`'s post-impl hook prompt MUST instruct the agent to extract a tool-call count and a token total for the current Claude Code session by parsing the relevant JSONL transcript under `~/.claude/projects/<project>/`.
- R10. The extracted numbers MUST be written into the body of the PR associated with the current branch, in a clearly delimited block (e.g., an HTML-commented section, a fenced `vibechk:` block, or a trailer — exact format deferred to planning). If a PR does not exist yet, one is created.
- R11. The telemetry format MUST be machine-extractable by a subsequent prompt-driven read of the PR body (i.e., consistent delimiters and key names), but does NOT need to be schema-validated or parsed by code in v1.

**Eval-branch workflow (vibechk skill)**

- R8. A new skill named `vibechk-branch-eval` MUST, when invoked from an Impl branch, create an `ImprovedContextBranch` off the parent of Impl using the repo's existing branch-creation plugin contract.
- R9. The `vibechk-branch-eval` skill MUST copy `plan-session-notes.txt` and `impl-session-notes.txt` from Impl's brmem to ImprovedContextBranch's brmem, using `brmem copy` or equivalent.
- R12. After copying notes, the `vibechk-branch-eval` skill MUST read `impl-session-notes.txt` and apply the suggested doc/skill/code changes as commits on ImprovedContextBranch. The session agent (A4) judges how to interpret each suggestion; no programmatic translation is required in v1.

**Plugin packaging**

- R16. `vibechk` is delivered as three artifacts: (a) a template prompt file that a user installs at the `brmem-branch-create` post-hook path, (b) a template prompt file that a user installs at the `brmem-branch-impl` post-hook path, and (c) the `vibechk-branch-eval` skill. Installation mechanism (copy-in, symlink, a dedicated install command, etc.) is deferred to planning.

**Storage contract**

- R13. Both notes files are stored in brmem as plain `.txt` entries — not in namespaces like `memjectives` or `objectives`. Base namespace is acceptable for the prototype. Re-namespacing is an explicit v2 concern.
- R14. Notes are never written into the working tree. They live only in brmem (git refs outside the working tree) and are read via `brmem get`.

---

## Success Criteria

- A user can take the same starting plan, run it through the full workflow (Base → Impl → ImprovedContextBranch → Impl2), and end up with two PRs each carrying their own telemetry block, without hitting a missing command or undefined step.
- A Claude Code session pointed at both PRs can read the telemetry blocks and the diffs and produce a coherent comparison without the user having to teach it the schema.
- `impl-session-notes.txt` from a real session actually contains suggestions concrete enough that A4 can act on them without asking the user for clarification on the "main" recommendations. If every session produces vague notes, the prototype has failed regardless of infra correctness.
- The v1 implementation does not require any additions to the brmem storage layer or the Graphite/branch plugin contract — it only adds (a) optional post-hook checks in the two existing `brmem-branch-*` skills, (b) the `vibechk-branch-eval` skill, and (c) two template hook prompts plus one install step.
- When `vibechk` is *not* installed, `brmem-branch-create` and `brmem-branch-impl` behave byte-for-byte as they do today. A passing test proves the base-skill behavior is unchanged in the no-hook case.

---

## Scope Boundaries

- No structured schema for notes files. Plain `.txt`, prose, explicit prototype trade-off.
- No automatic chaining from Impl to Impl2. User invokes each skill explicitly at each step.
- No external eval tool integration (Braintrust, Langfuse, promptfoo, custom headless harness) in v1.
- No reuse of `skill-creator`'s telemetry patterns (`timing.json`, `benchmark.json`, sub-agent meters). Design from scratch against JSONL transcripts.
- No harness-level hooks (Claude Code `Stop` hooks, SessionEnd hooks). Telemetry is pulled on-demand by the skill, not pushed by the harness.
- No built-in comparison command. Comparison is a separate, prompt-driven read of the two PRs — flagged as F5 but not a v1 deliverable.
- No collision-handling for notes files that already exist on a branch. Overwrite-on-write is acceptable for v1; if this causes pain, revisit in v2.
- No carry-forward semantics between Impl2's fresh `plan-session-notes.txt` and the one that rode over from ImprovedContextBranch. They are independent entries; naming may differ if needed.
- No changes to memjectives, objectives, or their storage models. Notes are deliberately a separate, lighter-weight artifact.
- No multi-plugin coexistence at a single hook point in v1. If a second plugin wants the post-impl hook, the user merges the prompts by hand or we revisit in v2.
- `vibechk` is not baked into `brmem-branch-create` or `brmem-branch-impl`. The base skills remain plugin-agnostic.

---

## Key Decisions

- **Notes are plain `.txt`, not structured.** Explicit prototype choice; prioritizes "test the workflow" over "design the schema." A structured format is a plausible v2 but carries risk of over-designing before we know what's useful.
- **Telemetry comes from JSONL transcripts.** Rejected: harness Stop hooks (timing awkwardness relative to the skill), user-paste `/cost` output (breaks automation), skipping telemetry (kills the eval premise). Parsing is crude but self-contained.
- **Branch structure is the eval mechanism.** No parallel eval infrastructure. Two PRs with telemetry blocks = the eval artifact.
- **`vibechk` is an opt-in plugin, not baked behavior.** The two base skills gain generic, optional post-hook checks; `vibechk` occupies those hook points by installing prompt files. This keeps the substrate (brmem + the base skills) clean and lets the plugin evolve independently.
- **Hook points are prompts, not code.** Same pattern as the existing `.twerk/prompts/brmem-branch-create.md` plugin contract. A hook file's presence enables the behavior; its content defines the behavior.
- **Only one new skill.** `brmem-branch-create` and `brmem-branch-impl` gain post-hook checks (thin additions); `vibechk-branch-eval` is the single new skill shipped as part of `vibechk`. Impl2 reuses the existing create/impl pair.
- **Skill name: `vibechk-branch-eval`.** The plugin codename is `vibechk`; the A/B eval skill carries the codename so discoverability and naming lineage stay aligned.
- **Ignore `skill-creator`'s telemetry conventions.** Explicit instruction from the user. Do not inherit its file layout, field names, or sub-agent-scoped model.

---

## Dependencies / Assumptions

- **brmem infrastructure exists.** `brmem put`, `brmem get`, `brmem list`, `brmem copy` all exist and are exercised by the existing `brmem-branch-create` / `brmem-branch-impl` skills. (Verified.)
- **Branch-creation plugin contract exists.** `.twerk/prompts/brmem-branch-create.md` is a real, repo-local plugin prompt that `brmem-branch-create` reads. The new `vibechk-branch-eval` skill will follow the same contract shape for its branch creation step; the new post-hook contracts follow the same "read and execute a repo-local prompt file" pattern. (Verified.)
- **Claude Code writes JSONL transcripts at a known location.** Assumed path: `~/.claude/projects/<encoded-project-path>/*.jsonl`, one file per session, with tool_use and usage records on each assistant turn. (Partially verified — planning should confirm the exact schema, field names, and how to identify "the current session's file" without ambiguity.)
- **`gh pr edit --body` or an equivalent MUST let the skill write the telemetry block.** Assumed available via existing gh CLI usage in twerk. (Verified at a high level; planning should confirm interaction with Graphite's `gt submit` flow and whether the body is overwritten or preserved.)
- **For telemetry to be meaningfully comparable, Impl and Impl2 should run in distinct Claude Code sessions**, not as different branches in the same long-lived session, because the JSONL file aggregates the whole session regardless of branch. This is a user-facing discipline for v1, not something the skill enforces. Worth calling out in the skill's prose.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R7] [Needs research] How to uniquely identify "the current session's JSONL file" — filename-encoded session ID, `lsof` on an open file handle, an env var set by Claude Code (e.g., `CLAUDE_CODE_SESSION_ID`), or most-recently-modified heuristic. Needs a short spike against a real JSONL directory.
- [Affects R7] [Technical] Exact field paths in the JSONL for `tool_use` count and token totals (input + cached + output). Confirm by inspecting a real file.
- [Affects R10] [Technical] Where in the PR body the telemetry block lives, and how it survives subsequent `gt submit` runs that may rewrite the body.
- [Affects R4, R6] [Technical] Are the post-hook prompts read+executed by the current session agent in-line, or should they fire separate sub-agents? The existing `.twerk/prompts/brmem-branch-create.md` is read in-line; default to the same pattern unless there's a reason to differ.
- [Affects R6, R15] [Technical] Exact filenames and directory convention for the post-hook prompts. `.twerk/prompts/brmem-branch-create-post.md` / `...-impl-post.md` are the proposed defaults; alternatives include a `.twerk/prompts/hooks/` subdirectory or per-plugin naming like `vibechk.post-create.md`.
- [Affects R16] [Technical] Installation mechanism for the `vibechk` plugin — manual copy of template files, a dedicated `twerk plugin install vibechk` command, or symlink from a shipped templates directory.
- [Affects R9] [Technical] Namespacing strategy for `brmem copy` when moving notes between Impl and ImprovedContextBranch. Base namespace is acceptable per R13 but the copy command's exact invocation needs pinning down.
- [Affects R12] [Technical] What "apply the suggestions" concretely looks like when the suggestions are vague — planning should define a minimum rigor bar (e.g., "the agent must commit at least one change or document why each suggestion was skipped") so this step doesn't become a no-op.
- [Affects F2] [Technical] Where exactly `brmem-branch-impl` ends today — does it return to the user naturally, or is there a post-step the plugin already owns? Determines where the post-impl hook inserts.

---

## Next Steps

-> `/ce-plan` for structured implementation planning.
