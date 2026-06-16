# Mutation helpers

Mutation helpers should run only after the user approves the exact batch and reply decisions.

## Build a resolver payload

```bash
pr-address exec build-resolve-thread-batch-payload \
  --pr-number <pr-number> \
  --batch-id <batch-id> \
  --decisions-file <decisions.json> \
  --format json
```

Decision files are agent-authored scratch data and should live outside the worktree. Each decision names a `thread_id`, `mode`, message, and optional provenance.

Supported modes:

- `fixed`
- `pre_existing`
- `explained`
- `planned`

## Apply a built resolver payload

```bash
pr-address exec resolve-thread-batch --from-build <payload-path> --format json
```

Prefer `--from-build` so mutation uses the validated payload artifact rather than re-reading ad-hoc decisions.

## Targeted manual helpers

Use these only for isolated follow-up when batch resolution is not appropriate:

```bash
pr-address exec resolve-thread-with-reply --thread-id <thread-id> --message <message> --format json
pr-address exec reply-to-review --review-id <review-id> --message <message> --format json
pr-address exec reply-to-discussion --comment-id <comment-id> --message <message> --format json
```

## Checkpoint record

After code changes are committed, connect the batch to the commit:

```bash
pr-address exec record-batch-checkpoint \
  --pr-number <pr-number> \
  --batch-id <batch-id> \
  --commit-sha <sha> \
  --format json
```
