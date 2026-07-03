# Internal PR stack address workflow retrospective

Date: 2026-06-07

This report analyzes one `internal-pr-stack-address` run on the runner-subagent Graphite stack. The goal is to document what happened, where the workflow was efficient, where it was brittle, and which deterministic CLI push-downs would make future stack-wide feedback handling faster and more reliable.

This is a workflow report, not an ADR. It is intended to inform improvements to the `internal-pr-stack-address` skill and the `pr-address exec` helper surface.

## Session context

### Stack and branch state

The stack under analysis was:

```text
runner-subagent/address-stack-feedback
runner-subagent-child-usage-observability
runner-subagent-model-thinking-metadata
master
```

The stack-address run created the omnibus child branch:

```text
runner-subagent/address-stack-feedback
```

and committed:

```text
12dcc53c Address PR stack feedback
```

At the end of the run, Graphite reported the branch as needing restack:

```text
runner-subagent/address-stack-feedback (needs restack)
Parent: runner-subagent-child-usage-observability
```

### PRs covered

The workflow operated on two open PRs:

| PR    | Branch                                      | Role in stack                                                                |
| ----- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| #1039 | `runner-subagent-model-thinking-metadata`   | Downstack PR adding runner subagent launch metadata                          |
| #1044 | `runner-subagent-child-usage-observability` | Upstack PR adding child-session usage metadata and progress/result reporting |

### Final outcome

The workflow succeeded:

- Created/reused omnibus branch: `runner-subagent/address-stack-feedback`.
- Created omnibus commit: `12dcc53c`.
- Resolved 17 review threads through `pr-address exec resolve-thread-batch`.
- Verified both stack PRs had zero unresolved review threads after mutation.
- Posted no discussion replies; remaining discussion comments were automation/status comments.

Final verification counts from payload-mode `get-feedback`:

| PR    | Unresolved review threads after resolution | Discussion comments after resolution |
| ----- | -----------------------------------------: | -----------------------------------: |
| #1039 |                                          0 |                                    5 |
| #1044 |                                          0 |                                    5 |

## Evidence collected

### Deterministic branch retrospective evidence

`aretro exec collect-evidence` was run against branch `runner-subagent/address-stack-feedback` in payload mode.

Compact evidence:

```json
{
  "session_count": 4,
  "evidence_count": 49,
  "payload_bytes": 659139,
  "warnings": []
}
```

High-level activity signals:

| Evidence kind      | Subject            |      Count | Sessions | Summary                                            |
| ------------------ | ------------------ | ---------: | -------: | -------------------------------------------------- |
| tool usage         | `read`             |        121 |        4 | High file/context inspection volume                |
| tool usage         | `bash`             |        107 |        4 | High command orchestration volume                  |
| tool usage         | `edit`             |         63 |        3 | Significant manual code editing                    |
| failed tool result | `bash`             |          8 |        3 | Command/protocol friction                          |
| failed tool result | `edit`             |          3 |        2 | Exact-replacement edit friction                    |
| large output       | `tool_result:read` |         28 |        4 | Many large read outputs                            |
| large output       | `tool_result:bash` |         19 |        3 | Many large command outputs                         |
| token usage        | aggregate          | 244 events |        4 | ~22.8M total tokens observed including cache reads |

Notable repeated file reads:

| File                                                                | Reads | Sessions |
| ------------------------------------------------------------------- | ----: | -------: |
| `ts/packages/pi-extensions/test/dispatch-runner-subagent.test.ts`   |    10 |        4 |
| `ts/packages/pi-extensions/src/runner-subagent/subagent-process.ts` |     9 |        4 |
| `ts/packages/pi-extensions/test/runner-subagent-process.test.ts`    |     7 |        4 |
| `ts/packages/pi-extensions/src/dispatch-runner-subagent.ts`         |     6 |        4 |
| `ts/packages/pi-extensions/src/runner-subagent.ts`                  |     6 |        4 |
| `pr-address/references/cli-reference.md`                            |     5 |        1 |

Notable repeated commands:

| Command                                         | Count | Sessions |
| ----------------------------------------------- | ----: | -------: |
| `cd ts/packages/pi-extensions && bun run check` |     7 |        3 |
| `git status --short --branch`                   |     4 |        3 |
| `get-feedback 1039 ...`                         |     2 |        1 |
| `get-feedback 1044 ...`                         |     2 |        1 |
| affected runner-subagent test command           |     2 |        1 |
| `git diff --check`                              |     2 |        1 |
| `just ts-check`                                 |     2 |        2 |
| `just ts-test`                                  |     2 |        2 |

These counts include surrounding branch work, not only the stack-address invocation, but they corroborate that the run was command-heavy, output-heavy, and involved repeated manual inspection.

### Stack-address workflow evidence

Initial stack feedback prep found:

| PR    | Unresolved review threads | Discussion comments | Discussion triage      |
| ----- | ------------------------: | ------------------: | ---------------------- |
| #1039 |                         2 |                   4 | automation/status only |
| #1044 |                        11 |                   5 | automation/status only |

The first validated stack plan therefore had:

```json
{
  "actionable_items": 13,
  "approval_required_items": 6,
  "informational_items": 9,
  "automation_discussion_comments": 9
}
```

After committing the first omnibus fix and re-fetching, current feedback had changed:

| PR    | Unresolved review threads after commit/re-fetch | Change                 |
| ----- | ----------------------------------------------: | ---------------------- |
| #1039 |                                               6 | +4 new roaster threads |
| #1044 |                                              11 | unchanged              |

A fresh stack prep and stack plan were then required. The current validated plan had:

```json
{
  "actionable_items": 17,
  "approval_required_items": 7,
  "informational_items": 10,
  "automation_discussion_comments": 10
}
```

Per-PR current plans validated as:

| PR    | `single_file` items | `cross_cutting` items | Total |
| ----- | ------------------: | --------------------: | ----: |
| #1039 |                   3 |                     3 |     6 |
| #1044 |                   7 |                     4 |    11 |

Resolution payloads were built and then mutated as:

| PR    | Batch           | Threads resolved | Result  |
| ----- | --------------- | ---------------: | ------- |
| #1039 | `single_file`   |                3 | success |
| #1039 | `cross_cutting` |                3 | success |
| #1044 | `single_file`   |                7 | success |
| #1044 | `cross_cutting` |                4 | success |

Total resolved: 17/17.

## What worked well

### The safety model was sound

The workflow's main safety properties held:

- Worktree was checked before branch creation and mutation.
- Open PR coverage was verified before stack processing.
- Feedback was fetched in payload mode, avoiding raw payload dumps in the transcript.
- Classifications were validated before planning.
- A compact plan was shown before editing.
- User approval was requested before cross-cutting work and before GitHub thread mutation.
- GitHub mutations went through `build-resolve-thread-batch-payload` and `resolve-thread-batch`, not hand-written API calls.
- Feedback was re-fetched after resolution to verify zero unresolved review threads.

The final state demonstrates that the workflow can produce a correct result.

### Re-fetch-before-mutation prevented a race

The skill requires re-fetching feedback before mutation. That check mattered: four additional roaster threads appeared on PR #1039 after the initial plan. Because the workflow re-fetched before resolving threads, it caught the stale plan instead of resolving only the original 13 items and leaving new unresolved feedback behind.

This is the strongest evidence that the current safety guardrails are important and should be preserved.

### Payload-mode detail lookup kept raw feedback mostly out of context

The run used `read-feedback-details` to materialize selected thread/comment bodies into managed summary artifacts. That avoided pasting full raw feedback payloads into the main transcript and kept classification evidence more controlled.

## What was inefficient or brittle

### 1. The merged stack plan cannot directly build resolution payloads

The largest reliability failure was a shape mismatch between helpers:

- `stack-feedback-plan` produced a valid merged stack-wide plan.
- The workflow then attempted to pass that merged stack plan to `build-resolve-thread-batch-payload`.
- `build-resolve-thread-batch-payload` expects a per-PR `plan-feedback` result, not a stack-merged plan.
- The result was a very large Pydantic validation failure with many `extra_forbidden` errors.

This is a structural impedance mismatch. The stack helper is the source of truth for stack planning, but the resolution helper only understands per-PR plans. The skill currently makes the agent bridge that gap manually.

Consequences in this session:

- Extra failed command.
- Large error output in the transcript.
- Manual reconstruction of per-PR `plan-feedback` inputs.
- Re-running per-PR planning after stack planning had already validated the work.
- Increased risk of losing provenance or mismatching decisions to threads.

This is the highest-value fix area.

### 2. Too much hand-written JSON orchestration remained in the agent

The agent manually assembled JSON for:

- explicit stack input;
- stack classifications;
- current reclassification after new feedback appeared;
- per-PR `plan-feedback` wrapper objects;
- resolution decision arrays;
- four resolution payload-builder invocations;
- four mutation invocations.

This amount of hand-written JSON/Python glue is too high for a reliable agent-facing workflow. It is both token-expensive and failure-prone. The session succeeded because each step was checked, but the workflow made correctness depend on careful manual data plumbing.

### 3. Current-feedback reconciliation was manual

The workflow correctly detected that current unresolved feedback differed from the originally planned set. However, the process of understanding that difference was manual:

1. Run `get-feedback` for each PR.
2. Notice count drift (#1039 from 2 to 6 unresolved threads).
3. Inspect the new thread bodies via `read-feedback-details`.
4. Update classification manually.
5. Re-run stack planning.
6. Re-run per-PR planning for resolution payload compatibility.

This should be a deterministic comparison step. The helper surface already has enough IDs and locators to compute:

- planned threads still unresolved;
- planned threads already resolved;
- newly appeared unresolved threads;
- disappeared or outdated planned threads;
- whether mutation may proceed safely.

### 4. Helper output was too large for agent ergonomics

The session had multiple large outputs:

- `stack-feedback-prep` output was large enough to hit the transcript cap in earlier commands.
- `get-feedback` printed large manifests for both PRs.
- The failed resolution-builder call produced a very large validation error.
- `aretro` evidence confirmed large bash/read outputs across the branch work.

Large outputs have two costs:

- They consume model context and make later reasoning noisier.
- They hide the actual decision-relevant facts in pages of structural JSON.

The default agent path should write large envelopes to files and print compact summaries. Full JSON should remain available via payload references or explicit debug mode.

### 5. The skill is policy-rich but mechanically overburdened

`internal-pr-stack-address` contains good rules, but it still asks the model to execute a long procedural program. The highest-risk operations are deterministic:

- mapping stack PRs to manifests;
- validating classifications;
- merging plans;
- comparing planned vs current feedback;
- building per-PR/per-batch resolution payloads;
- summarizing mutation results.

Those should be CLI-owned. The skill should primarily define:

- when to use the workflow;
- safety/confirmation boundaries;
- when semantic classification or user judgment is required;
- which CLI helper to call next;
- what compact evidence to show.

### 6. The skill's instruction about `build-resolve-thread-batch-payload` is ambiguous for stack plans

The skill says:

> For each PR and selected `plan-feedback` batch represented in an omnibus commit: build explicit decisions ... Build the non-mutating payload ...

That is technically correct, but easy to miss after the workflow has just produced a `stack-feedback-plan` output. The skill should explicitly warn:

> `build-resolve-thread-batch-payload` currently accepts per-PR `plan-feedback` results only; do not pass the merged `stack-feedback-plan` output. If using a stack plan, derive or retrieve the corresponding per-PR plans first.

This instruction is a stopgap. The better fix is a stack-level payload builder.

## Recommended improvements

### Recommendation 1: Add a stack-level resolution payload builder

Add a deterministic helper such as:

```bash
pr-address exec build-stack-resolve-thread-payloads --format json
```

Input:

```json
{
  "stack_plan": { "...": "data from stack-feedback-plan" },
  "commit_sha": "12dcc53c",
  "decisions": [
    {
      "pr_number": 1039,
      "batch_id": "single_file",
      "thread_id": "PRRT_...",
      "action": "resolve",
      "mode": "fixed",
      "message": "Fixed in the stack-tip omnibus commit by ..."
    }
  ],
  "continue_on_error": true
}
```

Output:

```json
{
  "valid": true,
  "payloads": [
    {
      "pr_number": 1039,
      "batch_id": "single_file",
      "payload_ready": true,
      "resolved_thread_count": 3,
      "payload": { "...": "resolve-thread-batch payload" }
    }
  ],
  "summary": {
    "total_threads": 17,
    "payload_count": 4,
    "skipped": 0,
    "errors": []
  }
}
```

Expected benefits:

- Removes the biggest observed failure.
- Eliminates manual per-PR plan reconstruction.
- Keeps provenance from the validated stack plan intact.
- Lets the skill remain stack-native through resolution prep.

Maintenance cost:

- Medium. It needs schema compatibility with existing `stack-feedback-plan` and `resolve-thread-batch` payload schemas.
- Drift is detectable through scenario tests that feed a stack plan and assert emitted per-PR payloads.

Discovery path:

- `pr-address/references/cli-reference.md`.
- `internal-pr-stack-address` skill Step 7.

### Recommendation 2: Add a current-feedback reconciliation helper

Add:

```bash
pr-address exec stack-feedback-diff-current --format json
```

Input:

```json
{
  "planned": { "...": "stack-feedback-plan data" },
  "current_prep": { "...": "new stack-feedback-prep data" }
}
```

Output:

```json
{
  "safe_to_resolve_planned": false,
  "planned_still_unresolved": ["PRRT_..."],
  "planned_already_resolved": [],
  "new_unresolved_threads": [
    { "pr_number": 1039, "thread_id": "PRRT_...", "path": "...", "line": 349 }
  ],
  "missing_or_outdated_planned_threads": [],
  "summary": {
    "planned_unresolved": 13,
    "current_unresolved": 17,
    "new_unresolved": 4
  }
}
```

Expected benefits:

- Makes feedback races explicit.
- Prevents agents from resolving stale subsets.
- Avoids manually comparing manifests and counts.
- Gives a deterministic branch point: proceed, reclassify new items, or stop.

Maintenance cost:

- Low to medium. It compares IDs and manifest metadata already present in payload summaries.
- Drift is detectable with fixture tests for unchanged, newly added, already resolved, and missing-thread scenarios.

Discovery path:

- `internal-pr-stack-address` Step 7 before mutation.
- `pr-address` CLI reference.

### Recommendation 3: Add compact output modes for stack helpers

Add or standardize:

```bash
--summary-only
--output-file <path>
```

for high-volume helpers such as:

- `stack-feedback-prep`
- `stack-feedback-plan`
- `get-feedback`
- `build-resolve-thread-batch-payload`

Preferred agent behavior:

- Full data goes to a payload artifact or explicit output file.
- stdout contains only:
  - exit code;
  - validity;
  - counts;
  - payload/reference paths;
  - warnings/errors summarized compactly.

Expected benefits:

- Reduces transcript/token bloat.
- Makes failure states easier to diagnose.
- Keeps raw data accessible without forcing it into model context.

Maintenance cost:

- Medium if every helper gets new flags.
- Low if implemented as a shared envelope summarizer.

Discovery path:

- CLI help and `pr-address/references/cli-reference.md`.
- Skill should mandate compact mode for normal operation.

### Recommendation 4: Improve schema mismatch errors

The failed builder invocation should not produce hundreds of `extra_forbidden` lines when the top-level shape is obviously a stack plan.

Add a pre-validation guard to `build-resolve-thread-batch-payload`:

```text
This command expects a per-PR plan-feedback result under `plan`.
Received a stack-feedback-plan result. Use build-stack-resolve-thread-payloads or pass per-PR plan-feedback data.
```

Expected benefits:

- Faster recovery from a common misuse.
- Smaller output.
- Clearer instruction for the agent.

Maintenance cost:

- Low. Detect stack-plan-only fields such as `pr_count`, `automation_discussion_summary`, `decision_docket`, or `validation.per_pr` before model validation.

Discovery path:

- Error output itself.
- CLI reference note under `build-resolve-thread-batch-payload`.

### Recommendation 5: Store classifications as payload artifacts and reuse them

During this session, classifications were assembled inline in Python snippets. The workflow should store each PR's classification packet as a managed artifact.

Add to `stack-feedback-plan` or a new helper:

- classification artifact paths;
- classification hashes;
- validation result references;
- per-PR plan artifact paths.

Expected benefits:

- Easier reruns after feedback drift.
- Better audit trail.
- Less risk of losing exact semantic decisions between stack planning and per-PR resolution prep.

Maintenance cost:

- Medium. Requires artifact lifecycle conventions.
- Drift risk is low if artifacts are generated by existing helpers.

Discovery path:

- payload session summary;
- stack plan output.

### Recommendation 6: Split `internal-pr-stack-address` into policy plus shorter command sequence

The current skill is long and precise, but much of its length describes deterministic orchestration. After the helper additions above, rewrite the skill around this shape:

1. Preflight stack and PR coverage.
2. Run `stack-feedback-prep` in compact/payload mode.
3. Classify each PR from templates.
4. Run `stack-feedback-plan`.
5. Create/reuse omnibus branch.
6. Execute approved batches.
7. Run `stack-feedback-diff-current`.
8. Run `build-stack-resolve-thread-payloads`.
9. Ask for final confirmation.
10. Run `resolve-thread-batch` payloads.
11. Verify with `get-feedback` compact summaries.

Move fallback details to a reference file.

Expected benefits:

- Lower token cost every time the skill loads.
- Fewer opportunities for the model to choose the wrong helper shape.
- Clearer separation between semantic judgment and deterministic mechanics.

Maintenance cost:

- Low after CLI helpers exist.
- Until helpers exist, keep the current detailed workflow but add a prominent warning about per-PR plan requirements.

Discovery path:

- `.agents/skills/internal-pr-stack-address/SKILL.md`.
- Optional `references/resolution-payloads.md` for fallback mechanics.

## Suggested implementation roadmap

### Phase 1: Low-cost hardening

1. Add the explicit warning to `internal-pr-stack-address` and `pr-address/references/cli-reference.md`:
   - `build-resolve-thread-batch-payload` expects per-PR `plan-feedback`, not `stack-feedback-plan`.
2. Add pre-validation shape detection to `build-resolve-thread-batch-payload` for stack-plan input.
3. Update the skill to redirect large helper outputs to files and print compact summaries.

This phase would have prevented the largest visible failure and reduced output bloat.

### Phase 2: Stack-native resolution prep

1. Add `build-stack-resolve-thread-payloads`.
2. Add scenario tests:
   - one PR, one batch;
   - two PRs, two batches;
   - missing decisions;
   - duplicate decisions;
   - decision references thread from wrong PR/batch;
   - all skipped;
   - mixed fixed/explained/pre-existing.
3. Update `internal-pr-stack-address` Step 7 to use the new stack helper.

This phase removes manual per-PR plan reconstruction.

### Phase 3: Race/reconciliation support

1. Add `stack-feedback-diff-current`.
2. Add scenario tests for:
   - no change;
   - new unresolved thread;
   - planned thread already resolved;
   - planned thread absent/outdated;
   - mixed changes across multiple PRs.
3. Update skill to require this helper before mutation.

This phase makes mid-run feedback drift deterministic and cheap to handle.

### Phase 4: Skill simplification

1. Move fallback mechanics into a reference file.
2. Keep `SKILL.md` focused on:
   - triggers;
   - safety boundaries;
   - confirmation points;
   - compact command sequence;
   - mutation rules.
3. Keep the CLI reference as the source of truth for helper schemas.

This phase reduces prompt burden and makes future runs faster.

## Proposed success metrics

Future stack-address runs should target:

| Metric                                         |        Current observed session |                               Target |
| ---------------------------------------------- | ------------------------------: | -----------------------------------: |
| Manual JSON/Python snippets for orchestration  |                            Many |                                  0-2 |
| Failed helper invocations from schema mismatch |                         1 major |                                    0 |
| Full helper JSON dumps in transcript           |                        Multiple |                         0 by default |
| Reclassification after feedback drift          |                          Manual | Deterministic diff + explicit branch |
| Resolution payload build steps                 | 4 manual per-PR/per-batch calls |             1 stack-level build call |
| Skill body required for normal run             |        Long procedural workflow |       Short policy + command routing |

## Conclusion

The `internal-pr-stack-address` workflow produced the correct result and its safety model is worth preserving. The main problem is not missing guardrails; it is that too much deterministic orchestration remains in the agent's prompt-level workflow.

The most important improvement is to make resolution prep stack-native. `stack-feedback-plan` already gives the agent a validated stack plan, but `build-resolve-thread-batch-payload` currently requires per-PR `plan-feedback` data. Bridging that mismatch manually caused the largest error and added unnecessary complexity. A stack-level resolution payload builder, plus a current-feedback reconciliation helper, would make the workflow substantially faster, less token-heavy, and more reliable.
