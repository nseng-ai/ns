# Manual E2E: one repo, two branches, no worktrees

This is the simplest end-to-end smoke test for `vibechk`.

It demonstrates the core workflow with:

- one existing git repo
- one working tree
- two branches run serially
- one shared plan
- generated `vibechk/<run-id>` result branches
- the default local `vibechk` store

The commands below assume you are testing from this repository with `uv run vibechk`.
If `vibechk` is installed as a command, replace `uv run vibechk` with `vibechk`.

## 1. Preflight

Run from a clean repo where creating two temporary branches is okay.

```bash
git branch --show-current
git status --short
uv run vibechk --version
command -v claude
```

Stop if `git status --short` prints anything.

Remember your starting branch so you can switch back later.

## 2. Create baseline and treatment branches

Create the baseline branch:

```bash
git switch -c vibechk-e2e-baseline
```

Create the treatment branch with extra context:

```bash
git switch -c vibechk-e2e-treatment
mkdir -p .vibechk-e2e-context

cat > .vibechk-e2e-context/INSTRUCTIONS.md <<'MD'
For the vibechk E2E demo, use this phrase:

treatment branch context worked
MD

git add .vibechk-e2e-context/INSTRUCTIONS.md
git commit -m "Add vibechk E2E treatment context"
```

Now:

- `vibechk-e2e-baseline` represents the old context.
- `vibechk-e2e-treatment` represents the new context.

## 3. Write one shared plan outside the repo

The plan lives under `/tmp` so it does not dirty either branch.

```bash
mkdir -p /tmp/vibechk-serial-demo

cat > /tmp/vibechk-serial-demo/plan.md <<'MD'
Create a file named vibechk-e2e-output.txt.

If .vibechk-e2e-context/INSTRUCTIONS.md exists, read it and write its demo phrase into the file.

If that file does not exist, write exactly:

baseline default context worked

Do not modify any other files. Stop after writing the file.
MD
```

## 4. Run baseline

```bash
git switch vibechk-e2e-baseline

uv run vibechk run \
  --plan /tmp/vibechk-serial-demo/plan.md \
  --workdir . \
  --runner claude
```

Copy the printed run ID:

```text
Run ID: BASELINE_RUN_ID
```

Verify the source branch was restored clean and the generated result branch has the expected file:

```bash
git branch --show-current
git status --short
git show vibechk/BASELINE_RUN_ID:vibechk-e2e-output.txt
```

Expected file contents:

```text
baseline default context worked
```

## 5. Run treatment

```bash
git switch vibechk-e2e-treatment

uv run vibechk run \
  --plan /tmp/vibechk-serial-demo/plan.md \
  --workdir . \
  --runner claude
```

Copy the printed run ID:

```text
Run ID: TREATMENT_RUN_ID
```

Verify the source branch was restored clean and the generated result branch has the expected file:

```bash
git branch --show-current
git status --short
git show vibechk/TREATMENT_RUN_ID:vibechk-e2e-output.txt
```

Expected file contents:

```text
treatment branch context worked
```

## 6. Inspect evidence

List recent runs:

```bash
uv run vibechk runs
```

If you lost a run ID, use this list to find it by timestamp, starting branch, and workdir.

Generate a comparison report:

```bash
uv run vibechk diff BASELINE_RUN_ID TREATMENT_RUN_ID \
  > /tmp/vibechk-serial-demo/comparison.md

open /tmp/vibechk-serial-demo/comparison.md
```

Expected comparison includes:

- baseline and treatment run IDs
- wall-time delta
- the shared plan
- baseline diff with `baseline default context worked`
- treatment diff with `treatment branch context worked`
- generated result branches named `vibechk/<run-id>`

## 7. Cleanup

Switch back to your original branch:

```bash
git switch YOUR_ORIGINAL_BRANCH
```

Optionally delete the tutorial branches and generated result branches:

```bash
git branch -D vibechk-e2e-baseline vibechk-e2e-treatment
git branch -D vibechk/BASELINE_RUN_ID vibechk/TREATMENT_RUN_ID
rm -rf /tmp/vibechk-serial-demo
```

## Pass criteria

This passes if:

1. The same repo and working tree were used for both runs.
2. Branch switching was serial: baseline first, then treatment.
3. Both source branches stayed clean after `vibechk run`.
4. Two generated `vibechk/<run-id>` result branches were created.
5. `vibechk runs` and `vibechk diff` produced readable evidence.
6. The comparison report clearly shows different output caused by branch-specific context.
