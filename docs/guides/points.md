# Points: customizing ns workflows with hooks and prompts

A **point** is a named place an extension defines where your repo's config alters
platform behavior. Extension authors **define** points; repo consumers **install**
hooks or prompts at them. This guide covers both roles.

Durable design rationale lives in [ADR 0031](../adr/0031-point-system.md);
canonical vocabulary lives in [`ts/packages/sdk/CONTEXT.md`](../../ts/packages/sdk/CONTEXT.md).

## The model in one minute

- A point accepts exactly one kind of installation:
  - **hook** — a list of script commands the workflow runs at that moment.
  - **prompt** — pure LM content the workflow resolves and consumes. The point
    system never executes prompts.
- A point has one of two cardinalities:
  - **many** — installations add behavior (e.g. pre-submit checks).
  - **one** — a single installation replaces the default content.
- The full point id is `<group>.<path segments>`, e.g. `flow.submit.pre`,
  where the group is the owning extension's namespace root.
- The SDK joins definitions with installations into a **point catalog**,
  inspectable via CLI (below).

## For consumers: installing at points

### Discover what's available

```sh
ns extension points            # catalog: every defined point + its active source
ns extension point <id>        # detail for one point
```

Example output:

```text
ns points:
- branch-context.plans-write (prompt, one) — conventional .ns/prompts/branch-context.plans-write.md
- flow.submit.pr-description (prompt, one) — default ./prompts/pr-description-default.md
- flow.submit.pre (hook, many) — repo ns.toml commands: just
```

The diagnostics section reports useful states: points defined but not installed,
cardinality-one points with an installation in effect, and installations that
reference undefined points (an error).

### Install a hook

Hooks are installed only in the repo-root `ns.toml`, in the single `[points]`
table, keyed by full point id, with a value of command strings:

```toml
[points]
"flow.submit.pre" = ["just"]
```

Hook execution semantics:

- Each entry is whitespace-split and executed directly — **no shell**, so no
  pipes, globs, or `&&`. Wrap complex logic in a script or `just` recipe.
- Commands run sequentially; the first failure aborts the surrounding workflow
  step.
- Workflow flags such as `flow submit --no-checks` skip execution; they are
  execution controls, not part of resolution.

### Install a prompt

You have two equivalent ways to install prompt content:

1. **Conventional file** (no TOML needed) — create
   `.ns/prompts/<point-id>.md`:

   ```text
   .ns/prompts/flow.submit.pr-description.md
   ```

2. **Explicit `ns.toml` entry** — a repo-relative path string:

   ```toml
   [points]
   "flow.submit.pr-description" = "docs/prompts/pr-description.md"
   ```

Prompt resolution ladder (first match wins):

1. Development environment-variable override (reported by the catalog when in
   effect; intended for extension development, not repo config).
2. `ns.toml` `[points]` entry.
3. Conventional `.ns/prompts/<point-id>.md` file.
4. The extension's manifest `default` file.

`ns extension point <id>` shows which source is currently active.

### Rules and limitations

- Installations are **project-only** in v1 — there is no global/XDG tier.
- Installing at an undefined point id is an error surfaced as an
  `installed-but-undefined` diagnostic.
- Hook points take only command arrays; prompt points take only a non-empty
  path string. Mismatched values are rejected with a diagnostic.
- Settings (typed config like `[reviews.diff]`) are **not** points. They stay
  in extension-rooted TOML tables with manifest-declared schemas.

## For extension authors: defining points

Points are declared as static metadata in the extension descriptor module
exported from `exports["./ns-extension"]` and created with `defineExtension()`:

```ts
import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	group: "flow",
	points: [
		{
			id: "flow.submit.pre",
			accepts: "hook",
			cardinality: "many",
			description: "Runs before flow submit checkpoints and submits the stack.",
		},
		{
			id: "flow.submit.pr-description",
			accepts: "prompt",
			cardinality: "one",
			default: "./prompts/pr-description-default.md",
			description: "System prompt for the PR title and managed body.",
		},
	],
});
```

Field reference:

| Field         | Required | Meaning                                                                                                                                             |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | yes      | Full point id. First-party convention: `<group>.<workflow>.<leaf>`.                                                                                 |
| `accepts`     | yes      | `"hook"` or `"prompt"`.                                                                                                                             |
| `cardinality` | yes      | `"many"` — installations add behavior; `"one"` — a single installation replaces the default.                                                        |
| `default`     | no       | Cardinality-one prompt points only: a package-relative POSIX `.md` path that must not escape the package directory. Used when nothing is installed. |
| `description` | no       | Shown in `ns extension points` output.                                                                                                              |

Author-side guidance:

- Point definitions are discovered from descriptor modules declared in
  `ns.toml` `extensions`; production no longer scans `.ns/extensions` roots or
  parses `package.json` `ns.points`.
- Your workflow reads the catalog to act on installations: hook commands via
  the catalog's hook resolution, prompt content via the active prompt source.
  The platform resolves prompt content; your workflow performs any LM
  interaction.
- Want agentic behavior at a lifecycle moment? Define a **hook** that consumers
  point at an agentic CLI — do not model it as prompt execution.
- New customization surfaces should define points (or manifest-declared
  settings) through the shared loader rather than parsing `ns.toml` directly or
  inventing a bespoke prompt ladder.

## Worked example: this repo

`ns.toml` installs one hook:

```toml
[points]
"flow.submit.pre" = ["just"]
```

So `ns flow submit` runs `just` (full repo validation) before checkpointing and
submitting the stack. Meanwhile `.ns/prompts/branch-context.plans-write.md`
installs a prompt at `branch-context.plans-write` via the conventional path —
no TOML line needed — overriding that extension's default prompt.
