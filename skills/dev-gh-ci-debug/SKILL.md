---
name: dev-gh-ci-debug
description: "Debug a failing GitHub Actions run end-to-end from an Actions run URL/ID, PR URL/number, Graphite PR URL, or current branch. Uses `gh pr` to resolve PR checks to run/job URLs when needed, then `gh run view --log-failed` to diagnose failed steps and return a structured fix."
allowed-tools:
  - "Bash(gh pr *)"
  - "Bash(gh run *)"
  - "Bash(gh api *)"
  - "Bash(git branch *)"
  - "Bash(git status *)"
  - "Read"
  - "Grep"
  - "Glob"
metadata:
  internal: true
---

<!-- PUBLIC SKILL: Do not reference asdl-internal module paths or class names in this file. Describe CLI operations, not implementation. See AGENTS.md § "Public Skill Authoring". -->

# dev-gh-ci-debug

A focused playbook for diagnosing GitHub Actions CI failures from a run URL, run ID, PR URL/number, Graphite PR URL, or the current branch. Narrower than `dev-gh` (which is the broad `gh` CLI reference); this skill is a diagnostic recipe, not a command catalog.

## When to use

- User pastes a GitHub Actions run URL (e.g. `https://github.com/<owner>/<repo>/actions/runs/<id>`, optionally with `/job/<jid>`).
- User gives a bare run ID and asks to debug it.
- User pastes a PR URL or Graphite PR URL (e.g. `https://github.com/<owner>/<repo>/pull/<n>` or `https://app.graphite.com/github/pr/<owner>/<repo>/<n>`).
- User says "debug CI", "why did CI fail", "look at gh actions run …", "investigate the failing workflow", or asks about failing checks on the current branch.

Defer to `dev-gh` for general `gh` questions (PRs, issues, API, auth). Defer to `dev-just-fix` when the failure is local `just` output and no run is involved.

## Workflow

### 1. Normalize the input

- **Actions URL form** `https://github.com/<owner>/<repo>/actions/runs/<id>[/job/<jid>]` → extract `run_id = <id>`, `repo = <owner>/<repo>`, and (if present) `job_id = <jid>`.
- **Bare run ID** → require the repo. Use `--repo <owner>/<repo>` explicitly on every `gh run` call rather than relying on the current directory's origin.
- **GitHub PR URL / PR number** → resolve the PR with `gh pr view <pr> --repo <owner>/<repo> --json number,url,headRefName,statusCheckRollup`.
- **Graphite PR URL** `https://app.graphite.com/github/pr/<owner>/<repo>/<n>` → treat `<n>` as the GitHub PR number and resolve it with the same `gh pr view` command.
- **Current branch / no explicit run** → resolve the branch's PR first:

  ```
  gh pr view --repo <owner>/<repo> --json number,url,headRefName,statusCheckRollup
  ```

  If that cannot infer the PR, get the branch name and look it up explicitly:

  ```
  git branch --show-current
  gh pr list --repo <owner>/<repo> --head <branch> --json number,url,headRefName,statusCheckRollup
  ```

- **After resolving a PR** → inspect `statusCheckRollup` or run `gh pr checks <pr> --repo <owner>/<repo>`; choose failed check runs' `detailsUrl` values, extract their `run_id` and optional `job_id`, then continue with the run-summary workflow below.

### 2. Run summary (cheap, orienting)

```
gh run view <run_id> --repo <owner>/<repo>
```

This shows: workflow name, triggering event, per-job status, per-step ✓/✗, and the `##[error]` / `##[warning]` annotations. Read the annotations block first — it often names the root cause before you touch any logs.

### 3. Failed logs only (skip the firehose)

```
gh run view <run_id> --repo <owner>/<repo> --log-failed
```

Streams logs from **failed** steps only. If a specific job is of interest (e.g. the URL had a `/job/<jid>` segment, or `--log-failed` returns too much across a matrix), narrow it:

```
gh run view <run_id> --repo <owner>/<repo> --log-failed --job <job_id>
```

Avoid plain `--log` — it dumps every step including successes and is often hundreds of MB.

### 4. Parse annotations and locate the step

Each log line is tab-separated: `<job>\t<step_name>\t<ISO timestamp>\t<line>`. `##[error]…` lines are the ones that matter. The `<step_name>` maps 1:1 to a `name:` (or the generated name of a `run:` block) under `jobs.<job>.steps` in the workflow YAML.

Common Actions meta-errors to recognize on sight:

- `Unable to process file command 'output' successfully` together with `Invalid format '<something>'` → a value written to `$GITHUB_OUTPUT` contained newlines. Fix the producer (e.g. emit compact JSON with `jq -c`, or use the heredoc form `key<<EOF … EOF`).
- `Process completed with exit code N` with nothing else → the step ran a shell command that exited non-zero; the real error is usually a few lines above.
- `Node.js 20 actions are deprecated` → informational, not a failure. Ignore unless the user explicitly asks.
- `The operation was canceled` → upstream cancel (often `cancel-in-progress` concurrency), not a real bug.

### 5. Read the workflow YAML and any invoked scripts

From the run summary you have the workflow name. Open `.github/workflows/<name>.yml`, find the failing step, and follow it:

- If the step is inline `run: |` shell — the bug is usually right there (quoting, `$GITHUB_OUTPUT` shape, missing env var, wrong `shell:`).
- If the step calls a repo script (e.g. `./scripts/foo.sh`), read that script next.
- If the step runs tests / lint / type-check against production code, read the relevant source files.

Common categories of root cause, in rough order of frequency:

1. **Script output shape** — pretty-printed JSON fed into `$GITHUB_OUTPUT`, missing newline terminator, unquoted expansion.
2. **Environment / secrets** — missing `secrets.X`, wrong scope on `permissions:`, missing `with:` input.
3. **Checkout depth / ref** — `actions/checkout@v4` without `fetch-depth: 0` when the step needs history.
4. **Matrix expansion** — `fromJson(...)` on an output that wasn't valid JSON (see category 1).
5. **Production code** — actual lint/type/test failure surfaced by CI; in that case hand off to `dev-just-fix` for the local fix loop.

### 6. Propose a fix

Identify the minimum change: file path, line number, before → after. Prefer fixing the producer (e.g. the script emitting bad JSON) rather than patching the consumer (e.g. mangling the value in the workflow). Do not suppress or skip the check.

If the harness is in plan/read-only mode, stop at the diagnosis — do not edit. Otherwise apply the fix per normal repo conventions.

Where possible, verify locally before re-running CI (e.g. run the script with sample input, pipe into `jq`, confirm the shape).

### 7. Rerun only what failed

After a fix lands:

```
gh run rerun <run_id> --repo <owner>/<repo> --failed
gh run watch <run_id> --repo <owner>/<repo>
```

`--failed` reruns only failed jobs (cheaper, faster, preserves the successful jobs' results). `watch` streams status until the run finishes.

## Reporting format

Return a single `DIAGNOSIS` block so the user can act without rereading the logs:

```
## dev-gh-ci-debug: DIAGNOSIS

**Run**: <URL>
**Workflow**: <name>.yml
**Failing job / step**: <job> / <step>
**Error**: <exact ##[error] line, trimmed>

**Root cause**: <one sentence>

**Fix**: <file>:<line>
<before>
→
<after>

**Verify locally**: <command the user can run to confirm the fix>
**Rerun**: `gh run rerun <run_id> --repo <owner>/<repo> --failed`
```

If the root cause spans multiple files (e.g. a script + a workflow both need changes), list each under **Fix** in the order they should be applied.

## Notes

- Prefer `--log-failed` over `--log`. Always.
- Always pass `--repo <owner>/<repo>` when the run might be in a different repo than the current directory's origin (common when debugging someone else's PR or a fork's run).
- `gh run view` returns a non-zero exit code when the run itself failed; this is expected and does not mean the `gh` call itself errored.
- For a step that writes to `$GITHUB_OUTPUT`, the producer must emit single-line values or use the heredoc form — there is no middle ground, and the failure message is unhelpful.
