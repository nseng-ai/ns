# `sklish` — standalone installer for agent skills shipped by Python packages

## Context

Python packages that ship with agent skills have no standard way to tell
users which skills to install. `npx skills add <owner>/<repo> --skill
<names>…` is the documented invocation, but the user has to know the
source and skill names — typically from a README. `sklish` is a small,
standalone CLI that reads declarative skill manifests from installed
Python packages' entry-point metadata and batches `npx skills add`
invocations.

`sklish` is its own package, separate from twerk. Plugins (twerk's or
anyone else's) opt in with a few lines in `pyproject.toml`.

## Contract: declarative manifest via entry points

A new entry-point group, `sklish.skills`. The key is the source
(`<owner>/<repo>`); the value is a whitespace-separated list of skill
names owned by the declaring distribution.

```toml
# twerk-objectives/pyproject.toml
[project.entry-points."sklish.skills"]
"dagster-io/twerk" = "objective objective-create objective-list objective-progress objective-reconcile"
```

```toml
# twerk-pr-address/pyproject.toml
[project.entry-points."sklish.skills"]
"dagster-io/twerk" = "pr-address"
```

Design notes:

- **Duck-typed TOML.** No shared schema package. Plugins write strings;
  `sklish` reads strings. Nothing imports a `SkillManifest` class
  anywhere.
- **Survives into wheels.** Entry points are first-class package
  metadata. `[tool.*]` tables don't; ruled out.
- **Batch-friendly.** Multiple packages can declare the same source.
  `sklish` aggregates across distributions, groups by source, dedupes
  skill names.
- **No Python imports at install time.** `sklish install` uses
  `importlib.metadata.entry_points()`; it never imports declaring
  modules. Packages with broken imports are still introspectable.

## CLI surface

```
sklish list                       # Print every manifest: dist -> source -> skills
sklish sources                    # Print declared sources (deduped)
sklish install [SOURCE...]        # Install skills. Default: all sources. Positionals filter.
  --scope {user,project,both}     # Prompts if absent (default: project).
  --dry-run                       # Print `npx` commands without running them.
```

Examples:

```
sklish install --scope project
# -> npx skills add dagster-io/twerk --skill objective objective-create \
#      objective-list objective-progress objective-reconcile pr-address \
#      --agent codex claude-code -y

sklish install dagster-io/twerk --scope user --dry-run
# Prints one command, scoped to user (appends -g), does not execute.
```

## Behavior

### Discovery

`sklish` reads
`importlib.metadata.entry_points(group="sklish.skills")`. Each entry
yields `(dist_name, source, names_string)`. Split `names_string` on
whitespace, group by `source`, dedupe per source preserving first-seen
order.

### Batching

One `npx skills add <source> --skill <names…> --agent codex claude-code
-y` per unique source. `--agent codex claude-code -y` is passed verbatim
— not a user knob.

### Scope

- `project` — no extra flag (default `npx skills add` behavior).
- `user` — append `-g`.
- `both` — run once with `-g`, once without.
- Absent — prompt interactively, default `project`.

### Pre-flight

- If `npx` is not on `PATH` and not `--dry-run`: exit non-zero with a
  friendly error that mentions `--dry-run`. The `--dry-run` path bypasses
  this check.

### Dry run

`shlex.join` each intended invocation; print; no execution.

### Error handling

- Unknown positional source (not declared by any installed package) →
  exit non-zero with the list of known sources.
- Non-zero exit from any `npx skills add` → propagate the exit code;
  fail-fast (don't run subsequent sources).

## What `sklish` is not (v1)

- Not a skill authoring tool. Authoring stays in the source repo;
  discovery stays in `npx skills`.
- Not a wrapper around anything other than `npx skills add`. Other
  providers can land later via new entry-point groups (`sklish.foo-skills`)
  — explicitly out of scope for v1.
- Not a replacement for direct `npx skills add` when the user knows
  exactly what they want. It's a convenience for the "install every skill
  my packages ship" case.

## Package layout

```
sklish/
├── src/sklish/
│   ├── cli.py          # click group: list / sources / install
│   ├── discovery.py    # entry-point reader + batching
│   └── invocation.py   # npx command builder + runner
├── tests/{unit,scenario}/
├── pyproject.toml
└── README.md
```

Runtime deps: stdlib + `click`. No dependency on twerk. Tests use a fake
entry-point source (same pattern as twerk's `PluginEntryPointSource`).

## Rollout to twerk (separate branch, later)

- Add `[project.entry-points."sklish.skills"]` to
  `packages/twerk-objectives/pyproject.toml` and
  `packages/twerk-pr-address/pyproject.toml`.
- Document `sklish install` in twerk's README as the recommended way to
  install skills.
- No Python code changes inside twerk.

## Open questions

1. **Entry-point key characters.** Source names contain `/` and `-`.
   Verify `pip`, `build`, `hatchling`, `uv`, and `setuptools` all
   round-trip them cleanly before locking the format.
2. **Disagreement across declarations.** Two packages declaring the same
   skill under the same source is benign (dedupe). No other collision
   modes to handle in v1.
3. **Repo placement.** New standalone repo on GitHub vs. a subdirectory
   in an existing monorepo — decide before `gt create` on the fresh
   branch.

## Self-destruct

This plan file is a durable spec for the branch it lives on, not a
permanent artifact. Once the plan is fully implemented, the final commit
of this branch must delete this file (`plan-sklish-skills-installer.md`).
A merged PR whose branch still contains its own plan file is evidence
the plan was not fully carried out.
