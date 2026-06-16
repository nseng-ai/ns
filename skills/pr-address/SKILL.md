---
name: pr-address
description: "Address GitHub PR review feedback with the pr-address session-store workflow."
---

# pr-address

Use `pr-address exec ...` helpers for a single PR feedback-addressing run. The durable rule is: **files carry what the agent authored; the payload session carries what the pipeline produced.** This skill is still used by `/code:pr-feedback-watch`; keep it focused on the retained single-PR workflow.

## Retained workflow

1. Prepare or collect feedback.

   ```bash
   pr-address exec prepare-run --harness-session-id "$HARNESS_SESSION_ID" --format json
   # or, when the PR number is known:
   pr-address exec get-feedback <pr-number> --format json
   ```

2. Build the classification template.

   ```bash
   pr-address exec classification-template --pr-number <pr-number> --format json
   ```

3. Author the classification outside the worktree, then validate it.

   ```bash
   pr-address exec validate-feedback-classification \
     --pr-number <pr-number> \
     --classification-file <classification.json> \
     --format json
   ```

4. Build a single-PR plan.

   ```bash
   pr-address exec plan-feedback --pr-number <pr-number> --format json
   ```

5. For each approved batch, author explicit decisions outside the worktree and build the resolver payload.

   ```bash
   pr-address exec build-resolve-thread-batch-payload \
     --pr-number <pr-number> \
     --batch-id <batch-id> \
     --decisions-file <decisions.json> \
     --format json
   ```

6. Apply the prepared resolver payload only when the user has approved mutation.

   ```bash
   pr-address exec resolve-thread-batch --from-build <payload-path> --format json
   ```

7. After code changes are checkpointed, record the checkpoint and finalize the run.

   ```bash
   pr-address exec record-batch-checkpoint \
     --pr-number <pr-number> \
     --batch-id <batch-id> \
     --commit-sha <sha> \
     --format json

   pr-address exec get-feedback <pr-number> --include-resolved --format json
   pr-address exec finalize-run --pr-number <pr-number> --format json
   ```

## Retained helper surface

Collection and setup:

- `prepare-run`
- `get-feedback`
- `download-feedback`
- `map-branch-prs`
- `classification-template`
- `read-feedback-detail`
- `read-feedback-details`

Planning:

- `validate-feedback-classification`
- `plan-feedback`

Mutation support:

- `build-resolve-thread-batch-payload`
- `resolve-thread-batch`
- `resolve-thread-with-reply`
- `reply-to-review`
- `reply-to-discussion`
- `record-batch-checkpoint`
- `finalize-run`

Every helper supports `--format json`. Use `--json-schema` before relying on a helper shape you have not used in this session.

## Classification rules

Classify every required review, unresolved review thread, and relevant discussion comment as either `actionable` or `informational`.

- `actionable` items require non-empty `summary`, non-empty `action_summary`, and a `complexity` of `pre_existing`, `local`, `single_file`, `cross_cutting`, or `complex`.
- `informational` items require an `informational_reason` such as `resolved_reference`, `automation`, `acknowledgement`, `approval`, `question_only`, `fyi`, `noise`, `already_addressed`, or `other`.
- Do not use stack-only dispositions or stack-wide helper names; they are no longer part of this skill.

## Mutation safety

- Do not mutate GitHub until the user approves the exact batch and message decisions.
- Prefer `resolve-thread-batch --from-build <payload-path>` over ad-hoc per-thread commands.
- Use `resolve-thread-with-reply`, `reply-to-review`, and `reply-to-discussion` only for targeted manual follow-up.
- Keep classification and decision scratch files outside the git worktree unless the user explicitly asks to preserve them.

## References

- `references/cli-collection.md` — collection helpers and detail lookup.
- `references/feedback-classifier.md` — classification packet rules.
- `references/cli-planning.md` — single-PR planning.
- `references/cli-mutation.md` — resolver payloads and GitHub mutation helpers.
- `references/cli-lifecycle.md` — session lifecycle and checkpoints.
- `references/cli-reference.md` — JSON envelope and CLI notes.
