# vibechk

`vibechk` is a lightweight CLI for checking whether an agent-context change makes an autonomous coding run cheaper or faster.

The core v1 workflow is:

1. Prepare two clean git workdirs: a **baseline** with the old context and a **treatment** with the new context.
2. Write one plan file that describes the task for the agent.
3. Run the same plan in both workdirs.
4. Compare the captured metrics, transcripts, and resulting diffs.
5. Paste the Markdown comparison into your PR.

`vibechk` does not create workdirs, push branches, create PRs, or judge solution quality. It captures evidence so a human can review it.

## How vibechk differs from promptfoo

`vibechk` is sometimes confused with general LLM eval tools like [promptfoo](https://github.com/promptfoo/promptfoo). They solve different problems:

- **promptfoo** evaluates LLM _outputs_: it runs prompts/models/providers against test cases with assertions and graders to answer "is the answer good, correct, or safe?" It is a large, mature platform with many providers, red-teaming, a web UI, and CI/CD gating.
- **vibechk** evaluates an agent _run's cost and speed_: it runs the same plan in a baseline vs. treatment git workdir and reports metric deltas (wall time, tokens, cost) plus transcripts and diffs to answer "did this context change make an autonomous coding run cheaper or faster?"

`vibechk` deliberately does not grade solution quality — it captures evidence for a human to judge. The overlap is only the word "eval": promptfoo asks _is the model's answer good?_, while `vibechk` asks _did my context change make the agent run cheaper or faster?_

## Current status

Implemented today:

- `vibechk run`
- `vibechk show`
- `vibechk diff`
- `vibechk runs`
- the `claude` runner adapter
- local bundle storage and local result branches

Not implemented yet:

- `codex` and `pi` runner adapters
- `vibechk publish`
- automatic GitHub PR body updates

Until `publish` exists, generate a report with `vibechk diff` and paste it into the PR manually.

## Prerequisites

- A checkout of this repo. From the workspace, run commands as `uv run vibechk ...`.
- `git` on `PATH`.
- For real runs today, `claude` on `PATH` and authenticated/configured for non-interactive use.
- One or two clean git workdirs checked out on named branches. Detached HEAD is rejected.

If you install `vibechk` as a normal console script later, drop the `uv run` prefix from the examples.

## Prepare workdirs

Create or choose two complete directory views of the project you want the agent to edit.

For a comparison:

- `BASELINE_WORKDIR` should contain the old context.
- `TREATMENT_WORKDIR` should contain the new context you are evaluating.

Use absolute paths so you can run `uv run vibechk` from this workspace:

```bash
BASELINE_WORKDIR="/absolute/path/to/myproject-baseline"
TREATMENT_WORKDIR="/absolute/path/to/myproject-treatment"
```

For example, using git worktrees from the repository you want to evaluate:

```bash
git -C /absolute/path/to/myproject worktree add -b vibechk-baseline "$BASELINE_WORKDIR" main
git -C /absolute/path/to/myproject worktree add -b vibechk-treatment "$TREATMENT_WORKDIR" my-context-change
```

Before each run, both workdirs must be clean:

```bash
git -C "$BASELINE_WORKDIR" status --short
git -C "$TREATMENT_WORKDIR" status --short
```

Both commands should print nothing.

## Write the plan

A plan is plain text, usually Markdown. `vibechk` passes it verbatim to the runner and stores a snapshot in the bundle.

Example:

```bash
PLAN="$PWD/plan.md"
cat > "$PLAN" <<'MD'
# Plan

Make the smallest code change that demonstrates the new context is useful.
Run the relevant tests and leave a short note in the diff explaining what changed.
MD
```

Keep the same plan for the baseline and treatment runs. If the plans differ, the comparison report warns you.

## Choose a store

A store is where local run bundles are persisted. Use `--store` for reproducible examples:

```bash
STORE="$PWD/.vibechk-store"
```

If you omit `--store`, `vibechk` uses:

1. `$VIBECHK_HOME`, when set
2. `$XDG_STATE_HOME/vibechk`, when set
3. `~/.local/state/vibechk`

## Run baseline and treatment

Run the baseline first:

```bash
set -o pipefail

uv run vibechk run \
  --plan "$PLAN" \
  --workdir "$BASELINE_WORKDIR" \
  --runner claude \
  --store "$STORE" \
  | tee baseline-vibechk.log

BASELINE_ID=$(awk '/Run ID:/ {print $3}' baseline-vibechk.log)
echo "$BASELINE_ID"
```

Run the treatment with the same plan:

```bash
uv run vibechk run \
  --plan "$PLAN" \
  --workdir "$TREATMENT_WORKDIR" \
  --runner claude \
  --store "$STORE" \
  | tee treatment-vibechk.log

TREATMENT_ID=$(awk '/Run ID:/ {print $3}' treatment-vibechk.log)
echo "$TREATMENT_ID"
```

If you do not want shell variables, copy each `Run ID:` value from the command output and use it in later commands.

Each successful run:

- creates an 8-character run id
- stores `plan.md`, `transcript.txt`, `diff.patch`, and `bundle.json`
- captures git provenance from the starting workdir
- commits agent-produced changes to a local `vibechk/<run-id>` branch when changes exist
- switches the workdir back to its starting branch

`vibechk` applies no default runtime budget. Stop the runner yourself if you need a limit.

If the runner exits non-zero, `vibechk` still writes a failed bundle with whatever transcript, metrics, and diff were available, then exits non-zero.

## Inspect runs

List local bundles:

```bash
uv run vibechk runs --store "$STORE"
```

Machine-readable listing:

```bash
uv run vibechk runs --store "$STORE" --format json
```

Render one run:

```bash
uv run vibechk show "$BASELINE_ID" --store "$STORE" > baseline-report.md
```

Run ids can be abbreviated to a unique prefix:

```bash
uv run vibechk show "${BASELINE_ID:0:4}" --store "$STORE"
```

## Compare two runs

Generate a Markdown comparison:

```bash
uv run vibechk diff "$BASELINE_ID" "$TREATMENT_ID" --store "$STORE" > vibechk-report.md
```

The report includes:

- biggest available metric deltas
- a metrics table with unavailable values as `null`
- runner/model/version/configuration differences
- the shared plan in a collapsible block
- baseline and treatment diffs
- result branch names, when branches were created

Open the report and paste the useful section into your PR:

```bash
open vibechk-report.md
```

## Review and push result branches

`vibechk` creates result branches only in the workdirs where changes exist. It never pushes them.

Inspect a result branch:

```bash
git -C "$BASELINE_WORKDIR" branch --list 'vibechk/*'
git -C "$BASELINE_WORKDIR" show --stat "vibechk/$BASELINE_ID"
```

Push a result branch with normal git tooling if you want the PR report to link to branch refs that others can fetch:

```bash
git -C "$BASELINE_WORKDIR" push origin "vibechk/$BASELINE_ID"
git -C "$TREATMENT_WORKDIR" push origin "vibechk/$TREATMENT_ID"
```

## Single-run workflow

You can also capture one run and render a single-run report:

```bash
uv run vibechk run \
  --plan "$PLAN" \
  --workdir "$TREATMENT_WORKDIR" \
  --runner claude \
  --store "$STORE" \
  | tee single-run-vibechk.log

RUN_ID=$(awk '/Run ID:/ {print $3}' single-run-vibechk.log)
uv run vibechk show "$RUN_ID" --store "$STORE" > vibechk-run.md
```

## Troubleshooting

### `requires a clean workdir`

Commit, stash, or remove existing changes before running `vibechk`:

```bash
git -C "$WORKDIR" status --short
```

### `detached HEAD state`

Check out a branch before running:

```bash
git -C "$WORKDIR" switch my-branch
```

### `Runner 'claude' is not installed or not on PATH`

Install/configure the Claude CLI, or run from a shell where `claude` is available:

```bash
which claude
```

### `No run matches prefix` or `Run prefix is ambiguous`

Use `vibechk runs --store "$STORE"` to find the full run id, then retry with the full id or a longer unique prefix.
