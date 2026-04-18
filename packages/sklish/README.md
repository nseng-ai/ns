# sklish

Standalone installer for agent skills declared by installed Python packages.

Python packages that ship with agent skills tell users which ones to install by
declaring a `sklish.skills` entry point in their `pyproject.toml`. `sklish`
reads those manifests and batches `npx skills add` invocations.

## Declaring skills

```toml
[project.entry-points."sklish.skills"]
"dagster-io/twerk" = "objective objective-create objective-list"
```

The key is the source (`<owner>/<repo>`); the value is a whitespace-separated
list of skill names owned by the declaring distribution.

## CLI

```
sklish list    (--all | --package NAME ...)    # one row per skill: dist -> source -> skill
sklish install (--all | --package NAME ...)    # install skills via npx skills add
  --scope {user,project,both}                  # prompts if absent (default: project)
  --dry-run                                    # print commands without running
```

`--package` is repeatable and filters by declaring Python distribution name
(e.g. `twerk-pr-address`). `--all` includes every declaring package. The two
flags are mutually exclusive; exactly one must be provided.

`sklish install` runs one `npx skills add <source> --skill <names…> --agent
codex claude-code -y` per unique source. Pass `-g` for user scope, or omit for
project scope. `both` runs the command twice.
