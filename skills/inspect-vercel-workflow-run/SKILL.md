---
name: inspect-vercel-workflow-run
disable-model-invocation: true
description: "Inspect one Vercel Workflow run and produce a read-only evidence-backed diagnosis. Invoke with a dashboard run URL or wrun ID."
---

# inspect-vercel-workflow-run

Diagnose one Vercel Workflow run from bounded, locally cached evidence. Finish with a report; leave source, deployments, runs, and external state unchanged.

## Safety boundary

- Use only read operations: Workflow `inspect`, `vercel whoami`, `vercel inspect`, and `vercel logs`.
- Keep all collected evidence in a fresh mode-0700 directory outside the repository. Preserve it after the diagnosis and report its path.
- Treat decrypted payloads as sensitive. Workflow decryption is audit-logged and may expose prompts, credentials, or environment values.
- Decrypt only justified individual steps. Never decrypt a whole run or a step list by default.
- Quote minimal error text. Redact tokens, authorization headers, private keys, environment values, embedded credentials, and authenticated URLs.
- Stop after diagnosis. Source investigation, reproduction, edits, deployment, reruns, and Vercel or GitHub mutation require a separate request.

When collection stops early, preserve the evidence directory, list successful artifacts, state the failing boundary, and give actionable recovery guidance. Do not substitute dashboard scraping, credential discovery, dependency installation, source edits, deployment, or a rerun.

## 1. Parse and preflight

Accept exactly one target plus an optional explicit environment:

- A bare ID must match `^wrun_[A-Za-z0-9]+$`.
- A dashboard URL must use HTTPS and have exactly the path `/<team>/<project>/workflows/runs/<wrun-id>` on `vercel.com`, apart from an optional trailing slash. Extract decoded, non-empty `team`, `project`, and `runId` segments. Reject extra path segments, credentials, fragments, an unexpected host, or an invalid run ID rather than guessing.
- A dashboard URL may have no query or exactly one `environment` query value. Accept only `production` or `preview`. Reject duplicate or empty environment values and all unrelated query keys.
- Resolve the environment from the URL and explicit user input. Equal values are accepted; conflicting values are a safe stop that names both values. When only one is present, use it. Default to `production` only when both are absent.

For a bare ID, inspect the current linked project's `.vercel/project.json` without printing secrets. Resolve its project name or ID and owning team/org ID. If the link is absent, malformed, or does not identify one project and team, stop and ask the user either to run `vercel link` separately or invoke the skill with the full dashboard URL. Do not link the project during diagnosis.

Authenticate before run queries:

```bash
vercel whoami
```

Resolve the Workflow CLI without installing dependencies:

1. Prefer `workflow` when `command -v workflow` succeeds.
2. Otherwise inspect the current project's package manager and use its execution surface only if it can resolve the already-installed `workflow` binary (for example, `pnpm exec workflow`, `npm exec --no -- workflow`, or `yarn workflow`).
3. Confirm the chosen executable with `inspect --help`; do not use a package-runner form that downloads missing software.
4. If none resolves, stop with guidance to install/expose the project's compatible Workflow CLI.

Before continuing, confirm exactly one tuple `{runId, team, project, environment}`, successful Vercel authentication, and a working Workflow CLI.

## 2. Create the evidence cache

Create and retain a private directory outside the worktree:

```bash
umask 077
evidence_dir="$(mktemp -d "${TMPDIR:-/tmp}/vercel-workflow-run.XXXXXX")"
chmod 700 "$evidence_dir"
printf 'Evidence directory: %s\n' "$evidence_dir"
```

Keep predictable names: `run.json`, `steps.json`, `events.json`, `deployment.json`, `runtime-logs.jsonl`, and `step-<step-id>.json`. Never save evidence under the repository.

Continue only after verifying the directory exists, is outside the worktree, and has mode 0700.

## 3. Cache undecrypted topology

Substitute the resolved Workflow command and confirmed tuple in these read-only forms:

```bash
<workflow-command> inspect run "$run_id" \
  --backend vercel --project "$project" --team "$team" --env "$environment" \
  --json >"$evidence_dir/run.json"

<workflow-command> inspect steps --runId "$run_id" \
  --backend vercel --project "$project" --team "$team" --env "$environment" \
  --json --sort asc --limit 200 >"$evidence_dir/steps.json"

<workflow-command> inspect events --runId "$run_id" \
  --backend vercel --project "$project" --team "$team" --env "$environment" \
  --json --sort asc --limit 500 >"$evidence_dir/events.json"
```

These files are bounded oldest-first prefixes, not presumed complete histories. Validate that each
required output is JSON and that steps/events are top-level arrays before interpreting it. Treat
malformed output as a safe stop. Count each array: fewer than its cap establishes completeness for that
query; exactly the cap means `potentially truncated` because CLI JSON omits cursor and `hasMore`
metadata. Record each cap-equal artifact and cap in `Collection limits`; do not silently raise limits or
imply that all pages were read.

> **Future CLI push-down:** replace cap-equality inference and procedural collection with a tested
> read-only helper that paginates Workflow results and returns bounded items plus explicit
> completion/continuation metadata.

Derive the deployment ID and the narrow run start/end interval from run metadata and events. Do not assume the current deployment or choose an arbitrary broad window. If metadata sources disagree on deployment identity, stop and report the disagreement.

Cache deployment metadata and bounded runtime logs:

```bash
vercel inspect "$deployment_id" --scope "$team" --format=json \
  >"$evidence_dir/deployment.json"

vercel logs "$deployment_id" --scope "$team" --project "$project" --no-branch \
  --since "$run_start" --until "$run_end" --limit 1000 --expand --json \
  >"$evidence_dir/runtime-logs.jsonl"
```

If deployment-scoped logs are unavailable, use the same project, scope, environment, interval, limit, `--no-branch`, and JSON filters without guessing another deployment. Record the limitation. Collect all levels: an application-level failure object may be logged at info level even when its Workflow step completed.

Continue only when the cache identifies run status, the obtained oldest-first step/event prefixes,
deployment identity, and bounded runtime logs, or stop with an inventory of partial artifacts. If a
prefix is potentially truncated, do not claim complete chronology or complete terminal-state coverage.

## 4. Find the causal frontier

Use the already oldest-first step and event prefixes to locate the earliest point in the collected
evidence where an application-level failure could have entered orchestration. When either prefix is
potentially truncated, make only causal claims supported by that prefix and independent evidence. Later
history may be absent, so stop or state `not established` whenever missing history could change a
classification.

Classify evidence by meaning, not merely Workflow status:

- **Primary/domain failure:** earliest meaningful application-level failure returned by a step, including a `completed` step whose output may encode `{ok:false}`.
- **Terminal workflow failure:** final explicit throw or failed step that marks the run failed, but only when complete evidence or independent run metadata establishes it; otherwise `not established`.
- **Secondary failure:** later cleanup, reporting, notification, or fallback work that also failed but did not cause the original failure.

Do not treat the final `FatalError` as primary without evidence. Correlate step status, events, and logs to select the smallest decryption set: normally one primary candidate and any directly related fallback/reporting candidate. Record one sentence explaining why each selected step can distinguish the causal chain.

Continue only with a minimal, reasoned list of individual step IDs.

## 5. Decrypt minimally

Record in working notes: “Decryption is audit-logged and payloads may be sensitive.” Decrypt selected steps one at a time:

```bash
<workflow-command> inspect step "$step_id" --runId "$run_id" \
  --backend vercel --project "$project" --team "$team" --env "$environment" \
  --json --decrypt >"$evidence_dir/step-$step_id.json"
chmod 600 "$evidence_dir/step-$step_id.json"
```

Validate each file as JSON before reading it. Expand the set only when current evidence leaves two concrete causal paths indistinguishable; record the competing paths and why the additional step resolves them. On authorization failure, stop decryption and report the classifications supported by undecrypted evidence.

Continue when payload evidence supports an exact domain symptom and any secondary failures, or explicitly conclude that the authorized encrypted payloads did not expose a diagnosable domain failure.

## 6. Correlate and report

Return this contract:

```markdown
# Vercel Workflow run diagnosis

## Target

- Run: …
- Team/project/environment: …
- Deployment: …
- Evidence directory: … (may contain sensitive decrypted payloads)

## Timeline

- <timestamp> — <step/event, status, interpretation> (`<evidence filename>`)

State whether this is a complete timeline or a bounded oldest-first prefix.

## Primary/domain failure

<safe minimal quote and evidence, or "none established"; qualify claims based on a truncated prefix>

## Terminal workflow failure

<safe minimal quote and evidence, "none observed in the collected prefix", or "not established" when later history may be missing>

## Secondary failures

<safe minimal quote and evidence, or "none observed">

## Ranked hypotheses

1. <hypothesis>
   - Prediction: <falsifiable observation>
   - Probe: `<one narrow read-only command>`

## Recommended next debugging command

`<one command that creates the tightest feedback loop for a later debugging session>`

## Collection limits

<missing/inaccessible/malformed evidence; every potentially truncated artifact with its exact cap and
which chronology or terminal-state claims remain unestablished; or "none" only when all required
queries are complete>

No source edits, deployment, workflow rerun, or external mutation was performed.
```

Include a concise evidence-backed timeline with timestamps and filenames. Produce 3–5 ranked hypotheses only after the causal chain; each needs a prediction and a narrow distinguishing probe. Recommend exactly one next debugging command, then stop.
