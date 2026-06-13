# TypeScript Planned-Branch Recipes: Design Retrospective

> Status: removed and parked. This document preserves the historical design for a possible future revival. The examples below are non-runnable after the cleanup that removed `@asdl/ts-plans` and all active `.plan.ts` branch-context commands, tools, and CLI operations.

## What the prototype tried to add

The prototype explored a typed recipe layer for branch-context plans. The active branch-context workflow already supported Markdown source-branch plans, branch context creation, Branch Memory attachment, and implementation prompt loading. TypeScript recipes attempted to add a second plan source format with explicit structure, deterministic rendering, validation-command recording, and optional Mermaid previews.

The experiment deliberately scoped evaluation to trusted local Pi usage. It was never a sandbox for untrusted code.

## Historical declarative API sketch

The package exposed `definePlan(input)` from `@asdl/ts-plans`.

```ts
interface DefinePlanInput {
  title?: string;
  summary?: string;
  goal: string;
  context?: string;
  phases: readonly DefinePlanPhaseInput[];
}

interface DefinePlanPhaseInput {
  title: string;
  prompt?: string;
  tasks: readonly string[];
}
```

Representative historical example:

```ts
import { definePlan } from "@asdl/ts-plans";

export default definePlan({
  title: "Preview title",
  summary: "Summary text",
  goal: "Build the thing",
  context: "Existing context",
  phases: [
    {
      title: "Phase one",
      prompt: "Prompt text",
      tasks: ["Task A", "Task B"],
    },
  ],
});
```

Historical validation rules included:

- `goal` had to be non-empty.
- At least one phase was required.
- Strings had to be non-empty where required.
- Inputs had to be plain JSON-like objects, not Dates, Maps, class instances, or functions.
- A phase could have empty `tasks` only when `prompt` was non-empty.

## Historical imperative recording API sketch

The prototype also exposed `planRecipe(metadata, fn)` with a recording runtime.

```ts
interface PlanRecipeMetadata {
  title?: string;
  summary?: string;
}

interface PlanRecipeRuntime {
  readonly cwd: string;
  readonly signal: AbortSignal | undefined;
  goal(text: string): void;
  context(text: string): void;
  phase(title: string, body: PlanRecipePhaseBody): Promise<void>;
  task(prompt: string): void;
  note(text: string): void;
  validateWithShell(command: string): void;
}

type PlanRecipePhaseBody = () => void | Promise<void>;
type PlanRecipeFunction = (plan: PlanRecipeRuntime) => void | Promise<void>;
```

Representative historical example:

```ts
import { planRecipe } from "@asdl/ts-plans";

export default planRecipe({ title: "Imperative", summary: "Runtime summary" }, async (plan) => {
  plan.goal("Build the imperative plan");
  plan.context("Runtime context");
  plan.note("cwd=" + plan.cwd);
  await plan.phase("Runtime phase", async () => {
    plan.task("Do the runtime task");
    plan.note("Remember this");
    plan.validateWithShell("echo validate only");
  });
  plan.task("Final task");
});
```

`validateWithShell` recorded validation commands into the rendered plan. The preview/rendering path did not execute those commands.

## Historical host and rendering model

The host rendered trusted `.plan.ts` source content by:

1. Writing source to a temporary `recipe.plan.ts` file under a package-local `.ts-plan-preview-tmp` directory.
2. Dynamically importing that file.
3. Verifying the default export was a branded recipe from `definePlan(...)` or `planRecipe(...)`.
4. Rejecting named `metadata` exports.
5. Rendering a text or Mermaid preview.
6. Cleaning up the temporary directory.

Historical host functions included:

```ts
previewTsPlanRecipeFromContent(content, { key, cwd, format?, signal? });
renderTsPlanRecipeImplementationInstructionsFromContent(content, { key, cwd, signal? });
```

Text preview rendered headings, goal, context, phases, tasks, notes, and recorded validations. Mermaid preview returned pure flowchart content while keeping the trust notice separate. Implementation rendering used text content and returned title, summary, and trust-notice metadata.

## Trust model

The prototype's trust notice was:

```text
Trust boundary: this preview evaluated a local .plan.ts file as trusted TypeScript code with local system permissions. The preview command records and renders plan instructions; it does not execute recorded validation commands, create branches, write Branch Memory, or send an implementation prompt.
```

This was an honest boundary: evaluating local TypeScript code is substantially different from reading Markdown. The prototype treated recipe files as trusted local code with local system permissions, not as untrusted plan data.

## Historical branch-context integration

The prototype mapped `.plan.ts` into the branch-context workflow as a Pi-only extension of saved plans and attached plans:

- Local plan store file name: `<slug>.plan.ts`.
- Branch Memory key: `<branch-context-slug>.plan.ts`.
- Write command: `/branch-context:write-ts-plan`.
- Create command: `/branch-context:create-ts`.
- Preview command: `/branch-context:preview-ts`.
- Implement command: `/branch-context:impl-ts`.
- Tool: `write_source_branch_ts_plan_file`.
- CLI hidden operation: `branch-context exec preview-ts [key-or-slug] [--preview-format text|mermaid] [--format json]`.

Those integration points have been removed and should not be treated as active contracts.

## Behaviors tests covered

Historical tests covered declarative recipes, imperative recipes, trust notices, validation-command recording without shell execution, text rendering, Mermaid rendering, rejected malformed default exports, rejected named metadata exports, branch-context saved-plan selection, attached-plan fallback behavior, Pi command registration, and the hidden preview CLI operation.

## Lessons learned

- Typed recipe plans made plan structure explicit and enabled deterministic rendering/previews, but introduced a second planning language alongside Markdown.
- Imperative recording was expressive but increased trust and execution-model complexity.
- The trust boundary was honest but heavy: evaluating local TypeScript code is substantially different from reading Markdown.
- Pi-only evaluation created cross-harness ambiguity for the branch-context skill family.
- The package and integration added broad maintenance surface across workspace dependencies, Pi commands/tools, CLI hidden operations, tests, docs, context vocabulary, and lockfile state.
- Future revival should start from an explicit product/use-case decision and a stronger trust/portability story rather than dormant code.

## Additional lessons from later viewer and validation exploration

A later unmerged prototype stack explored a saved `.plan.ts` viewer, structured inspection API, pre-save validation, and a more detailed graph UI. It sharpened several conclusions:

- A useful viewer needed a structured model API, not just rendered Markdown or Mermaid. Once the UI needed outline, graph, rendered text, and source panes, `@asdl/ts-plans` had to expose stable model types and an inspection function. That turned the recipe package from a renderer into an API surface other tools could depend on.
- Mermaid was an export format, not the interaction model. The graph-detail branch moved from a flat flow diagram toward an outline/tree with selectable nodes and a sticky detail pane because real plan text is too long for diagram boxes. Future graph work should start from an inspectable plan model plus UI-specific node identifiers, with Mermaid as an optional serialization.
- The write tool had to evaluate the recipe before saving it. Otherwise invalid trusted code could be persisted, slugged, and later attached as if it were a valid plan. Pre-save preview validation was the right safety shape, but it made writing a plan an execution-bearing operation, not a passive file write.
- Repeated previews made determinism and side effects more important. The viewer requested structured, text, Mermaid, and source views separately; each evaluated trusted TypeScript again unless the host cached a single inspected model. Any future revival should require recipe evaluation to be side-effect-free and deterministic, or centralize evaluation so one inspected model feeds all renderers.
- First-class `validateWithShell` was the wrong abstraction pressure. The later refinement removed dedicated validation items and treated shell commands, tests, and checks as ordinary task or prompt text. That better matches agent implementation plans: checks are instructions for the later implementation session, not a special mini-executor inside the recipe runtime.
- Rich phase prompts mattered more than long task arrays. Making `tasks` optional exposed that micro-task lists encouraged over-controlling the downstream agent. The better shape was a coherent, self-contained phase prompt with only a small number of coarse tasks when they add navigational value.
- Showing both source and rendered instructions introduced an explicit precedence problem. The prototype resolved this by treating `.plan.ts` source as source of truth and telling implementers to inspect it if rendered output conflicted. That is honest, but it also undercuts portability: a future design should minimize source/render divergence or define a canonical normalized model as the handoff artifact.
- A browser viewer sharpened the trust split. The local server could evaluate trusted TypeScript; the browser should only receive source, JSON, text, and Mermaid and must not evaluate plan code. That implies path-safe saved-plan IDs, clear trust notices in both CLI and UI, and careful separation between source inspection and code execution.
- Listing saved `.plan.ts` files turned the local plan store into a user-facing product surface. The viewer needed repo/source-branch metadata, opaque IDs, path traversal defenses, missing-file behavior, and sorted summaries. That is much more lifecycle surface than “support one alternate plan file extension.”

## Rejected alternatives during removal

- Keep `@asdl/ts-plans` as a dormant package. Rejected because dormant runtime code still creates dependency, test, and API surface.
- Leave fail-fast commands or TODO stubs. Rejected because users and agents should not see unavailable workflows as active capabilities.
- Keep generic plan-file kind abstractions. Rejected because the active branch-context workflow is Markdown-only.

## Revival path

A future revival should deliberately reintroduce a package and integration after deciding:

1. The product use case that requires typed executable plans instead of Markdown.
2. Whether execution is trusted-local only, sandboxed, or avoided entirely through a declarative data format.
3. How non-Pi agents and CLI-only workflows can inspect, render, and implement the same plans.
4. Which commands/tools become public contracts and how they are documented.
5. What validation and preview guarantees users should expect.

This document should be used as input to that design, not as evidence that any `.plan.ts` runtime support currently exists.
