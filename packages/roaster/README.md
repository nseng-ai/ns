# roaster

`roaster` runs markdown-defined reviewers against the current branch
diff. Once you've chosen a harness, adding a new reviewer is literally adding
a markdown file under `reviews/`.

## Quick start

```bash
# Write a reviewer.
cat > reviews/demo.md <<'EOF'
---
description: Short description.
---

Flag issues.
EOF

# Run it against the current branch diff. If exactly one supported harness
# is on PATH, it's selected automatically.
roaster review run demo
```

## CLI

```
roaster harness list        # detect known harnesses on PATH
roaster harness show        # print which harness would be used

roaster review list          # enumerate reviews/**/*.md as keys
roaster review list-matching # list reviews whose when_changed globs match the current diff
roaster review run <key>     # resolve reviews/<key>.md, run it, print findings
```

Every operation also has a JSON form for machine consumers:

```bash
roaster review run dignified-python --format json
roaster harness list --format json
```

## Graphite stack workflow

`roaster stack run <profile-slug>` is the roaster-specific Graphite workflow
for turning review findings into a generated stack of resolver branches. Start
with a safe dry run:

```bash
mkdir -p .roaster/profiles
$EDITOR .roaster/profiles/thermonuclear-stack.md
roaster stack run thermonuclear-stack --dry-run --target-branch feature/impl
```

The command is no-mutation even when it cannot proceed: with the current real
CLI adapter, an unwired local agent runner fails closed with an actionable
message instead of guessing how to run an agent.

Profile files live at `.roaster/profiles/<slug>.md`. They are loose markdown
guidance for humans and agents: roaster reads the raw text, but it does **not**
deterministically parse headings, frontmatter, checklists, or other markdown
structure. Deterministic workflow facts come from CLI flags and checked code.

The default packaged stack prompts are:

- `stack_triage.md` — triages reviewer findings into accepted/rejected/merged
  findings and resolver batches.
- `stack_resolver.md` — instructs a resolver agent to work exactly one batch
  and report validation/safety evidence.

Use `--triage-prompt` and `--resolver-prompt` to pass prompt override guidance
for those phases. The packaged defaults remain the baseline prompt resources
when overrides are not supplied.

### Run state and dashboard

Stack run artifacts are stored in Branch Memory namespace `roaster-runs` on the
implementation branch. Canonical key shapes are:

- `indexes/<impl-branch-slug>/<profile-slug>.md`
- `runs/<impl-branch-slug>/<profile-slug>/<run-slug>/manifest.md`
- `runs/<impl-branch-slug>/<profile-slug>/<run-slug>/triage.md`
- `runs/<impl-branch-slug>/<profile-slug>/<run-slug>/batches/<batch-slug>/resolver.md`

By default, a rerun resumes the latest run recorded for the implementation
branch/profile pair. Pass `--new-run` to allocate a fresh ordinal run slug, or
`--run-slug <slug>` for an explicit stable slug.

The run manifest is the durable audit/resume source of truth. In addition to
run identity and batch slugs, it records per-batch status, generated branch
names, resolver artifact locators, resolver/failure summaries when known,
dashboard comment linkage, and generated stack submission success/failure. The
raw triage and resolver markdown artifacts remain separate Branch Memory entries
so a later agent can inspect exactly what was accepted and attempted.

The current MVP publishes a persistent dashboard issue comment on the target PR
and updates that marker comment on reruns. The dashboard is the durable review
surface for humans. This path does not post inline comments, does not resolve
review threads, and does not discover or edit generated resolver PR bodies.
Generated PR marker/body helpers are pure, deferred rendering/parsing utilities;
they are not wired into production publication until an explicit PR discovery
and PR body update gateway contract exists.

### Dry run and mutation boundaries

`--dry-run` is safe: it performs planning, runs reviewer/triage collection
through the configured testable gateways, and reports intended Branch Memory,
dashboard, and Graphite actions without writing Branch Memory, posting dashboard
comments, creating branches, or invoking `gt`.

A non-dry-run stack run is explicitly Graphite/`gt`-based. The product path
requires Graphite, creates or updates generated resolver branches, and runs
`gt submit --no-interactive` after generated branches are prepared. Explicit
`--target-branch` runs fail closed unless Graphite can resolve the branch's
attach tip and `--target-pr` supplies a dashboard PR. Before any generated
branch mutation, roaster persists run artifacts and publishes the PR dashboard
so the attempted mutation has an inspectable record.

The real adapter surface is intentionally guarded. The real agent runner fails
closed until a supported local runner is explicitly wired, and automatic real
Graphite stack discovery is not implemented; pass explicit `--target-branch`
and `--target-pr` when exercising the current boundary. Do not treat this as a
fully autonomous production workflow yet.

Roaster stops instead of mutating further when it sees invalid triage output,
invalid resolver output/status, validation failures or missing validation
evidence, resolver safety flags, Branch Memory write failures, dashboard
publication failures, Graphite command failures, or unavailable required real
adapters.

Manual smoke guidance:

- `roaster stack run <profile> --dry-run --target-branch <branch>` is the safe
  smoke test and is appropriate for local validation.
- Real mutation smoke should only run on disposable Graphite branches/PRs. It
  is not required by automated tests, and automated tests must not exercise live
  GitHub or Graphite mutation.

## Project config

`roaster` reads project-level diff exclusions from the repository root `asdl.toml`:

```toml
[roaster.diff]
exclude = [
  ".agents/skills/**/*.py",
  ".claude/skills/**/*.py",
]
```

These are plain repo-relative glob patterns. `roaster` converts them to Git pathspec excludes before assembling the reviewer prompt, so excluded paths never enter the model input.

## Harness selection

`roaster` runs parsed review definitions through a unified harness
runtime. The runtime owns prompt assembly, harness detection, model support,
subprocess invocation, progress events, and stdout parsing. The first-class
harness today is **Claude Code**; adding others is a future slice.

Resolution order for which harness a review uses:

1. `--harness <name>` on the `review run` command.
2. `ASDL_ROASTER_HARNESS` environment variable.
3. The single harness detected on `PATH`, if exactly one is available.
4. Failure — either no harness is on `PATH`, or more than one is and the
   choice is ambiguous.

The Claude Code harness shells out with `-p --output-format stream-json
--verbose --bare`, passes the assembled review prompt on stdin, and uses
read-only tools (`Bash,Read`). Findings mode also supplies a structured-output
JSON schema; text mode omits that schema and returns the terminal result prose.
The runtime parses Claude's stream-json `result` event and usage metadata.

## Review definition format

A reviewer is a markdown file under `reviews/` at the repo root. Nested
subdirectories are allowed: `reviews/python/typing.md` is key
`python/typing`. The reviewer `name` comes from the filename (without its
extension) — e.g. `dignified-python.md` becomes the reviewer named
`dignified-python`. The frontmatter holds structured metadata; everything
after the closing `---` fence becomes the reviewer's instructions.

```md
---
description: Review Python diffs for violations of the team's dignified Python standards.
default_model: sonnet
when_changed:
  - "**/*.py"
---

Concrete rules for the model. The adapter wraps these with a prompt that
asks the model to emit findings as JSON.
```

Required frontmatter fields:

- `description`

Optional frontmatter fields:

- `default_model` — used when the `--model` flag is not passed.
- `when_changed` — a list of repo-relative glob patterns. `roaster review
  list-matching` selects the review only when at least one changed path in the
  current branch diff matches one of these patterns. Omit this field for
  reviewers that should always be selected. Callers can then run selected keys
  with `roaster review run <key>`.

The markdown body (after the closing fence) is required and becomes the
reviewer's `instructions`.

## Finding schema

In findings mode, the harness returns structured output of this shape:

```json
{
  "findings": [
    {
      "path": "src/app.py",
      "line": 12,
      "severity": "warning",
      "summary": "Use pathlib instead of os.path",
      "details": "Line 12 joins paths with os.path.join."
    }
  ]
}
```

`line` may be `null` for file-level findings. `severity` is one of
`info`, `warning`, `error`. An empty `findings` array means the review
passed.

## PR comments in CI

The roaster CI workflow keeps the summary comment as the complete aggregate
record for every finding. When GitHub can place a finding on a concrete PR diff
line, CI also attempts to post an inline review comment for that finding.

Inline comments require both a concrete `path` + `line` and GitHub acceptance
for that location in the PR diff. Some findings are therefore summary-only but
still valid, including:

- `line: null` file-level findings.
- Findings in files unchanged by the PR.
- Findings on lines outside the changed diff hunk.
- Binary or large files where GitHub omits patch metadata.
- Any finding from a run where GitHub rejects inline comment posting.

The summary comment includes an inline-posting status section with counts for
posted inline comments, duplicate inline comments skipped, summary-only
findings, and any inline-posting API error. Force-pushes can orphan or outdate
inline comments; stable inline markers reduce duplicate reposting, but they do
not fully solve that GitHub limitation.
