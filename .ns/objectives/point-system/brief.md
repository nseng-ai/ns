# Point System — design brief

Distilled from the 2026-07-06 grilling/wayfinding session (working notes: Branch Memory
entry `sdlc-composition-notes` on `add-flow-submit-hooks`). This brief is the decided
model; at objective closure its stable parts graduate into an ADR and CONTEXT.md
vocabulary.

## The idea

A user defines their own SDLC for their engineers and agents by composing the extensions
they install. Extensions bring new nouns (Objectives, handoffs, PR stacks) and integrate
them into the lifecycle. The point system is the mechanism: **extension authors define
points; consumers install hooks and prompts at them; the kernel computes the point
catalog; "your SDLC" is an emergent, introspectable view.**

## Vocabulary

- **Point** — the canonical noun: a named place an extension defines where consumer
  config alters platform behavior. "Lifecycle point" is prose framing ("ns defines points
  in the software development lifecycle"); the mechanism is lifecycle-agnostic and purely
  mechanical points are legitimate.
- **Hook** — a script that runs (argv list, whitespace-split, no shell).
- **Prompt** — pure LM content. A prompt is NOT a kind of hook.
- **Install** — what consumers do (hooks/prompts at points). **Define** — what extension
  authors do (points). Consumers never define.
- **Point catalog** — the computed view joining definitions with installations
  ("catalog" per kernel vocabulary; "registry" stays areg's).
- Rejected names for the point: moment, event (left unclaimed deliberately), socket,
  mount point, site, station, join point, hook point; slot/phase/step/stage/checkpoint/
  seam were already claimed in this repo. Banned framing: unqualified "extension point".

## Point definitions (extension manifest)

Static `ns.points` array beside `ns.commands` in the extension package manifest — no code
execution needed to compute the catalog:

```json
{
  "ns": {
    "group": "flow",
    "points": [
      { "path": ["submit", "pre"], "accepts": "hook", "semantics": "additive",
        "description": "Runs before flow submit checkpoints and submits the stack." },
      { "path": ["submit", "pr-description"], "accepts": "prompt", "semantics": "override",
        "default": "./src/submit/pr-description-default.md",
        "description": "System prompt for the PR title and managed body." }
    ]
  }
}
```

- **Ids**: full id = `<group>.<path segments joined with .>` (e.g. `flow.submit.pre`).
  The group is the enforced namespace root — structural, not validated after the fact.
  `<group>.<workflow>.<leaf>` is a first-party norm, not a platform rule.
- **Typing, two axes**: `accepts: hook | prompt` (exactly one kind per point) and
  `semantics: additive | override`. Additive = zero..N installed, run in order.
  Override = a builtin default exists; installing replaces it.
- **`default`** (override prompt points): package-relative markdown file, escape-checked
  like command `entry`; moves builtin prompts out of TS constants into introspectable files.

## Installations (consumer config)

Definitions and installations are two halves with two authors (function signature vs call
site; git defines pre-commit, the repo installs the script). The point id is the join key.

- Single `[points]` table in repo-root `ns.toml`, keyed by full point id, value typed by
  the point: additive hook point → array of command strings; override prompt point →
  markdown file path. (`[install]` was considered as the table name; kept `[points]`.)
- Conventional path `.ns/prompts/<point-id>.md` counts as an installation with no TOML
  line; the catalog folds it in and reports the source. Prompt files use id-based names.
- **Resolution ladder, v1 = project-only.** Hook points: `[points]` or nothing (`--no-hooks`
  is a flag, not a tier). Prompt points: dev env var (reported by catalog) → `[points]`
  path → conventional path → manifest default. No global (XDG) tier for installations —
  that tier serves extension availability, not repo behavior.

## Settings

Settings are typed plain config, NOT points, and keep extension-rooted TOML tables
(`[roaster.diff]` etc.) with schemas declared in the extension manifest. Unification lives
in machinery, not table shape. Net `ns.toml` anatomy: `[points]` (installations) +
`[<extension>.*]` (settings), both declared, both validated, both introspectable.

## Execution semantics

- Hooks exec directly (no shell), sequentially; first failure aborts the surrounding
  workflow step.
- **The platform resolves prompts; it never executes them.** A prompt point is an LM
  interaction the defining extension already performs, whose content the consumer can
  override — cross-harness parity holds structurally. Agentic work at a lifecycle moment
  is expressed as a hook that shells out to an agentic CLI.

## Placement and surfaces

- Config management (shared single-parse `ns.toml` loader, declared schemas, point
  catalog) is kernel/core platform — the four existing ad-hoc smol-toml parsers
  (flow.hooks, roaster.*, areg.agents, ns-init harnesses) retire onto it.
- CLI surfaces hide under the `ns extension` group (singular): the extension-management
  home (`install`, `update`, …) plus `ns extension points` (catalog) and
  `ns extension point <id>` (detail: definition, type, semantics, default, installations,
  winning source).

## Deliberately excluded / fog

- Reified lifecycle (stage graph, ordering, validation) — emergent view only for now;
  likely re-enters someday via noun grouping + an SDLC view (`ns lifecycle` reserved as a
  lens over the catalog).
- "Noun" stays prose, not a modeled concept (earliest future step: inert manifest metadata).
- No third `accepts` kind (first-class agent task) pending the runner/harness story.
- No points accepting both hooks and prompts until a real case appears.
- No global installation tier until a real cross-repo need appears.
- Pi/skills/harness-artifact management is out of scope (skill-management-subsystem).

## Migration consequences

- `[flow.hooks].pre_submit` (shipped in PR #3051) is provisional → `[points]."flow.submit.pre"`.
- `.ns/prompts/pr-description.md` ladder and `plans-write` direct read → declared override
  prompt points with id-based filenames and manifest defaults.
- roaster / areg / ns-init settings → declared settings through the shared loader.
