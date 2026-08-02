# Points: customizing ns workflows with hooks, prompts, and text content

A **point** is a named place an extension defines where repository configuration
alters platform behavior. Extension authors **define** points; repository
consumers **install** hooks, prompts, or text content at them.

Durable design rationale lives in [ADR 0031](../adr/0031-point-system.md) and
[ADR 0051](../adr/0051-text-content-points.md); canonical vocabulary lives in
[`ts/packages/public/sdk/CONTEXT.md`](../../ts/packages/public/sdk/CONTEXT.md).

## The model in one minute

A point accepts exactly one installation kind:

- **hook** — command strings the owning workflow runs.
- **prompt** — LM-facing content whose source the SDK selects. The SDK never
  executes prompts or invokes an LM.
- **text-content** — one uninterpreted text value whose source the SDK selects.
  The SDK never renders the text, interprets placeholders, or invokes an LM.

A point also declares cardinality:

- **many** — installations add behavior, as with a sequence of hook commands.
- **one** — one installation replaces default content. Text-content points are
  always cardinality one.

The full point id is normally `<group>.<workflow>.<leaf>`, such as
`flow.submit.pre`. The SDK joins definitions with installations into a **point
catalog** that workflows consume and users can inspect.

## For consumers: installing at points

### Discover what is available

```sh
ns extension points            # every defined point and its active source
ns extension point <id>        # detail for one point
```

Example output:

```text
ns points:
- example.output-format (text-content, one) — conventional text-content .ns/text-content/example.output-format.txt
- flow.submit.pr-inventory (prompt, one) — default ./prompts/pr-inventory-default.md
- flow.submit.pre (hook, many) — repo ns.toml commands: just
```

Diagnostics identify points defined but not installed, cardinality-one points
with an installation in effect, and installations that reference undefined
points.

### Install a hook

Hooks are installed in the repository-root `ns.toml` `[points]` table, keyed by
full point id, with an array of command strings:

```toml
[points]
"flow.submit.pre" = ["just"]
```

Hook execution semantics:

- Each entry is whitespace-split and executed directly, with **no shell**. Pipes,
  globs, and `&&` therefore require a wrapper script or `just` recipe.
- Commands run sequentially; the first failure aborts the surrounding workflow
  step.
- Workflow flags that skip hooks are execution controls, not source-resolution
  behavior.

### Install a prompt

Prompt content can be installed in either of two ways:

1. Create the conventional `.ns/prompts/<point-id>.md` file:

   ```text
   .ns/prompts/flow.submit.pr-inventory.md
   ```

2. Set the point to a repository-relative path in `ns.toml`:

   ```toml
   [points]
   "flow.submit.pr-inventory" = "docs/prompts/pr-inventory.md"
   ```

Prompt source precedence (first match wins) is:

1. The descriptor's development environment-variable override, when declared
   and set.
2. The `ns.toml` `[points]` entry.
3. The conventional `.ns/prompts/<point-id>.md` file.
4. The extension descriptor's `default` file.

The SDK selects and reports the source. The owning workflow reads the selected
content and performs any LM interaction itself.

### Install text content

Text-content points use the same path-based installation model:

1. Create the conventional `.ns/text-content/<point-id>.txt` file:

   ```text
   .ns/text-content/example.output-format.txt
   ```

2. Set the point to a repository-relative path in `ns.toml`:

   ```toml
   [points]
   "example.output-format" = "docs/output-format.txt"
   ```

Text-content source precedence is the descriptor's declared development
override, `ns.toml`, conventional file, then descriptor default. Resolution is
fail-closed: once a source is selected, a missing, unreadable, or invalid source
is an error for the consuming workflow rather than a reason to try a
lower-precedence source.

Text-content is intentionally uninterpreted by the SDK. A workflow may use the
selected value as a format, literal, template, or another kind of text, but that
workflow owns any grammar, placeholder validation, and rendering.

### Rules and limitations

- Installations are project-only; there is no global/XDG tier.
- Installing an undefined point id produces an installed-but-undefined error.
- Hook points accept command arrays. Prompt and text-content points accept a
  non-empty path string. Mismatched values are rejected.
- Settings such as typed extension tables or shared model policy are **not**
  points. They remain manifest-declared settings rather than lifecycle or
  content customization sites.

## For extension authors: defining points

Declare points as static metadata in the extension descriptor exported from
`exports["./ns-extension"]` and created with `defineExtension()`:

```ts
import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	group: "example",
	points: [
		{
			id: "example.pre",
			accepts: "hook",
			cardinality: "many",
			description: "Runs before the example workflow.",
		},
		{
			id: "example.instructions",
			accepts: "prompt",
			cardinality: "one",
			default: "./prompts/instructions-default.md",
			description: "LM-facing instructions for the example workflow.",
		},
		{
			id: "example.output-format",
			accepts: "text-content",
			cardinality: "one",
			default: "./text-content/output-format-default.txt",
			developmentOverrideEnvVar: "EXAMPLE_OUTPUT_FORMAT",
			description: "Selected output-format text for local development.",
		},
	],
});
```

Field reference:

| Field                       | Required | Meaning                                                                                                                                                                                                      |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                        | yes      | Full point id. First-party convention: `<group>.<workflow>.<leaf>`.                                                                                                                                          |
| `accepts`                   | yes      | `"hook"`, `"prompt"`, or `"text-content"`.                                                                                                                                                                   |
| `cardinality`               | yes      | `"many"` adds behavior; `"one"` selects one installation. Text-content must be `"one"`.                                                                                                                      |
| `default`                   | no       | Cardinality-one Prompt/Text-content only: a package-relative POSIX path that cannot escape the package directory. Prompt defaults conventionally use `.md`; Text-content defaults conventionally use `.txt`. |
| `developmentOverrideEnvVar` | no       | Cardinality-one Prompt/Text-content only: the environment variable whose value names a development override path. This is descriptor metadata, not repository config.                                        |
| `description`               | no       | Human-facing description shown by point introspection.                                                                                                                                                       |

Point definitions are discovered from descriptor modules declared by `ns.toml`
`extensions`; production does not scan `.ns/extensions` or parse point metadata
from `package.json`.

Define a Hook when consumers need executable behavior. Define a Prompt when the
selected content is LM-facing. Define Text-content when the SDK should select
one uninterpreted text value. Do not use Prompt for deterministic text merely to
reuse its source ladder, and do not add a workflow-specific `ns.toml` parser.

## For workflow implementers: consuming the catalog

The consumption API is the internal workspace export
`@nseng-ai/sdk/project-config/points`, not the public author API at the package
root.

Build the catalog with one of these APIs:

- `loadPointCatalog({ repoRoot, gateway, preferredDescriptors })` builds it
  synchronously from known definitions. Pass the owning extension's preloaded
  descriptor so defaults and manifest provenance remain canonical.
- `loadPointCatalogWithDescriptors({ ... })` also discovers definitions from
  extension descriptors declared in the repository's `ns.toml`.

Consume each kind through its matching seam:

- `hookCommandsForPoint(catalog, id)` returns installed Hook command strings.
  The owning workflow controls execution.
- `resolvePromptPointSource(catalog, id)` selects the active Prompt source;
  `resolvePromptPointPath(repoRoot, source)` resolves non-environment sources to
  a readable path and label. The workflow reads the file and invokes an LM if
  its behavior requires one.
- `resolveTextContentPointSource(catalog, id)` selects the active Text-content
  source; `resolveTextContentPointPath(repoRoot, source)` resolves
  non-environment sources to a readable path and label. The workflow reads and
  interprets the text according to its own contract.

These APIs select and report sources. They do not read content on the workflow's
behalf, execute Hooks, invoke an LM, render Text-content, or interpret
placeholders. Diagnostics accompany the catalog; workflows should fail on
errors that gate the point they consume and may surface unrelated diagnostics
as warnings.

Do not parse `ns.toml` directly or hand-roll a content precedence ladder in
workflow code. The catalog is the single source-selection path.

## Worked example

Suppose an extension defines cardinality-one `example.output-format` as
Text-content with a packaged default. A repository can override it without TOML
by creating:

```text
.ns/text-content/example.output-format.txt
```

The catalog then reports that conventional file as the active source. The
example workflow reads its text and applies whatever output-format contract it
defines. The SDK does not know whether the content is literal output, a format
string, or a template, and does not render it.

A production example is the Objectives extension's
`objective.autorun.pr-title` Text-content Point, whose packaged default is:

```text
[obj:{{objectiveSlug}}] [autorun:{{autorunOrdinal}}] {{existingTitle}}
```

A repository can replace it with
`.ns/text-content/objective.autorun.pr-title.txt` or a `[points]` path. Objectives
interprets the selected text as a title template, requires each placeholder
exactly once, and rejects empty, multiline, or over-length rendered titles.
`ns objective exec autorun-pr-title` computes a title without touching GitHub.
