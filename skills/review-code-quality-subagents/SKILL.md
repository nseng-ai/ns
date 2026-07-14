---
name: review-code-quality-subagents
disable-model-invocation: true
description: Run the standard code-smell, DRY, TypeScript-style, and reinvented-abstraction reviews inline in separate review-only subagents without using external review-model APIs.
metadata:
  internal: true
---

# Review code quality with subagents

Run this fixed code-quality review suite against one pinned branch diff:

1. `ns-typescript-style-tripwire`
2. `reinvented-abstractions-tripwire`
3. `code-smell-review`
4. `dry-but-not-too-dry`

Each review gets a fresh subagent so its doctrine and context cannot contaminate the others. Do not add other configured reviews implicitly. This workflow uses the current harness's subagents; it must not invoke `ns reviews run`, Codex, Claude Code, or another external model CLI.

## Input

Treat everything after the skill command as a natural-language review request, not positional arguments:

```text
/skill:review-code-quality-subagents <what should be reviewed>
```

Examples:

```text
/skill:review-code-quality-subagents Review the current Graphite branch against its parent.
/skill:review-code-quality-subagents Review PR #3600.
/skill:review-code-quality-subagents Review the provisioning change on fail-soft-slot-provisioning-resize-coverage against slots-provisioned-ignored-files.
```

Interpret the request using repository and Graphite evidence, then resolve one exact merge-base comparison. Common resolutions:

- “current branch/change” means `TARGET_REF=HEAD` and the current Graphite parent from `gt parent --no-interactive` is `BASE_REF`;
- an explicit “X against Y” means `TARGET_REF=X` and `BASE_REF=Y` after both refs are verified;
- a PR request means resolve its exact head and base refs from PR metadata rather than assuming trunk.

Do not treat arbitrary words as ordered ref slots. Do not silently widen a branch review to the whole stack or trunk. If the requested scope has more than one plausible comparison, show the candidate interpretation briefly and ask one clarifying question. Once resolved, pin `BASE_REF` and `TARGET_REF` for the entire run.

## Preflight

1. Confirm `BASE_REF` and `TARGET_REF` resolve with `git rev-parse`.
2. Use merge-base semantics throughout: `git diff "$BASE_REF"..."$TARGET_REF"`.
3. Record `git log "$BASE_REF".."$TARGET_REF" --oneline`, `git diff --stat "$BASE_REF"..."$TARGET_REF"`, and `git diff --name-only "$BASE_REF"..."$TARGET_REF"`.
4. Stop if the diff is empty.
5. Run `ns reviews list --format json` and confirm that all four fixed suite keys are configured. Ignore other configured review keys. Require a readable `.ns/reviews/<key>/review.md` for each suite key; stop on suite/definition drift rather than silently skipping a review.

## Subagent contract

Dispatch exactly one fresh `task` subagent for each of the four suite keys, in the order listed above. Batch all independent review tasks in one subagent-tool call when the harness supports it. Review subagents are read-only: they must not edit files, mutate git or Branch Memory, publish findings, or launch another model CLI.

Each task prompt must include all of the following because the subagent starts cold:

```text
You are the review-only subagent for REVIEW_KEY in REPO_ROOT.

Read and obey REPO_ROOT/.ns/reviews/REVIEW_KEY/review.md as the authoritative review definition. Read applicable AGENTS.md files and any references that the review definition explicitly requires. Review only the merge-base diff BASE_REF...TARGET_REF. The pinned commit list is COMMITS and the changed paths are CHANGED_PATHS.

Do not edit files, mutate git or Branch Memory, publish findings, invoke `ns reviews run`, or launch Codex, Claude Code, or any other model CLI. Repository-local deterministic scanners explicitly required by the review definition are allowed when they do not modify tracked files.

Return a self-contained report for this review only. Follow the definition's finding format and thresholds exactly. Ground every finding in the diff with file:line evidence and a concrete explanation. Report `No findings` when nothing meets the definition's bar. Include a short coverage note naming anything the review required but could not inspect.
```

Replace every uppercase placeholder with the pinned run evidence. Do not summarize or reinterpret a review definition in the dispatch prompt; the subagent must read the source file itself.

A failed or non-final subagent result is not a completed review. Inspect its diagnostics/session evidence and retry only that review once when the failure is operational and safely recoverable. Otherwise report it as incomplete; never substitute parent-agent judgment silently.

## Aggregate

After every subagent completes:

1. Present one section per review in the fixed suite order: `## <review-key>`.
2. Preserve each review's own severity, ordering, wording, and no-finding result. Lightly normalize formatting only.
3. Do not merge, rerank, or suppress findings across reviews. If two reviews identify the same underlying issue, add a brief cross-review note after both original findings remain visible.
4. End with:
   - reviews completed and incomplete;
   - finding counts per review;
   - validation/scanner commands reported by subagents;
   - the exact reviewed range, `BASE_REF...TARGET_REF`;
   - an explicit statement that the workflow made no edits and did not invoke external review-model APIs.

This skill is advisory and read-only. It does not fix findings, write review logs, publish comments, or mutate PR state.
