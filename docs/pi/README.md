# Pi in This Repo

Repo-specific notes for using and extending Pi in `asdl`.

## Project-local Pi extensions

Checked-in project-local Pi extensions live in:

```text
.pi/extensions/
```

Pi auto-discovers project-local extension modules from:

```text
.pi/extensions/*.ts
.pi/extensions/*/index.ts
```

Use project-local extensions when the behavior is specific to this repo's workflows, CLIs, slots, or contributor conventions.

Checked-in files under `.pi/extensions/` are the local discovery surface. They may contain a full repo-local implementation, or they may be thin adapters that delegate to engineered package code.

## Project-local implementation layers

This repo keeps two useful layers for Pi extension work.

### Vibecoded extension layer

Paths:

```text
.pi/extensions/*.ts
.pi/extensions/*/index.ts
```

The vibecoded extension layer is for fast repo-local workflow experiments that should stay close to Pi's auto-discovery surface while their shape is still changing. It is a good fit when behavior is specific to this checkout's CLIs, slots, or conventions and does not yet need a package-level test surface.

This layer is valuable, not deprecated. Keep user-facing behavior obvious, prefer direct code while the seam is unproven, and avoid extracting shared helpers before there is demonstrated leverage.

### Engineered extension layer

Path:

```text
ts/packages/pi-extensions/
```

The engineered layer is for durable behavior that benefits from tests, fake adapters, shared modules, or package-level validation. Project-local discovery adapters can stay in `.pi/extensions/` while the implementation lives in this package.

Use this layer for behavior that has proven stable, has meaningful safety risk, is reused by more than one extension, or needs fake-driven tests. For TypeScript package changes, validate with:

```text
bun run --cwd ts check
bun run --cwd ts test
```

### Promotion criteria

Consider promoting behavior from the vibecoded layer to the engineered layer when one or more criteria apply:

- **Stability:** the command behavior has proven durable and is no longer rapidly changing.
- **Risk:** incorrect behavior could affect branches, PRs, Graphite stacks, GitHub state, or user worktrees.
- **Reuse:** multiple extensions need the same command runtime, skill expansion, rendering, or workflow primitives.
- **Test need:** confidence requires fake-driven tests, branch/PR scenarios, or package-level validation.

Do not promote behavior merely because the extension is checked in. Do not extract shared helpers unless the deletion test shows real leverage across callers.

### Current inventory

| Area/file                                        | Current layer                                  | Notes                                                                                                |
| ------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `.pi/extensions/objective.ts`                    | Project-local adapter over engineered behavior | Loaded by Pi from `.pi/extensions/`; delegates Objective behavior to package code.                   |
| `.pi/extensions/land-stack.ts`                   | Project-local adapter over engineered behavior | Keeps `/land-stack` discovery local while durable behavior lives in the package.                     |
| `.pi/extensions/brmem-handoff.ts`                | Project-local adapter over engineered behavior | Adds `/brmem-handoff` and `/brmem-pickup-handoff` Branch Memory handoff frontends.                   |
| `.pi/extensions/land.ts`                         | Vibecoded implementation                       | Intentional fast path for non-Graphite users; kept local and direct.                                 |
| `.pi/extensions/just-fix.ts`                     | Vibecoded implementation                       | Useful repo-local workflow; kept vibecoded while reusing the package skill-expansion helper.         |
| `.pi/extensions/submit.ts`                       | Project-local adapter over engineered behavior | Keeps `/submit` discovery local while durable behavior lives in the package.                         |
| `ts/packages/pi-extensions/src/objective.ts`     | Engineered implementation                      | Package-tested Objective extension behavior.                                                         |
| `ts/packages/pi-extensions/src/land-stack.ts`    | Engineered implementation                      | Package-tested landing behavior; later refactors may split internals without changing `/land-stack`. |
| `ts/packages/pi-extensions/src/brmem-handoff.ts` | Engineered implementation                      | Package-tested Branch Memory handoff command selection and prompt handoff behavior.                  |
| `ts/packages/pi-extensions/src/submit.ts`        | Engineered implementation                      | Package-tested Graphite submit behavior with a `/submit`-specific runner seam.                       |

## Planned branch workflow

The planned-branch workflow uses `/write-plan`, `/create-planned-branch`, and `/impl-planned-branch` to save reviewed plans, create implementation branches, attach plans through Branch Memory, and load them for implementation.

See [Planned Branch Workflow](./planned-branch-workflow.md).

## Extension message linkification

For clickable PR/issue links in custom Pi extension output, keep message content plain, carry URLs in `message.details`, and linkify in the registered renderer.

See [Extension message linkification](./extension-message-linkification.md).

## Runner subagent helper

The local runner subagent helper lets project extensions await a fresh runner subagent and receive a structured terminal result without slash-command handoff text.

See [Runner Subagent Helper](./runner-subagent-helper.md).

## Checked-in extensions and worktrees

If a project-local extension participates in worktree switching, it must be present in the target worktree too.

In practice, that means the extension should be:

- checked into the repo, and
- loaded from a path that exists in every worktree for that checkout

A local untracked extension in one checkout is not sufficient for a flow that switches Pi to another worktree.

## `/reload`

After editing project-local Pi resources, use:

```text
/reload
```

This reloads:

- extensions
- skills
- prompt templates
- themes
- context files

Use `/reload` after changing files under `.pi/extensions/`.

## Project-local vs global extensions

### Prefer project-local extensions when

- the behavior is specific to this repo
- the extension shells out to repo CLIs like `slot`
- the extension depends on repo conventions or checked-in files
- you want the behavior to travel with the repository

### Prefer global extensions when

- the behavior is editor- or terminal-wide rather than repo-specific
- you want it in all repositories
- the extension must remain available across cwd/session switches into projects that may not carry the same checked-in extension

Global extensions live under:

```text
~/.pi/agent/extensions/
```

## Core subagent and Objective stack rewrite proposals

- [Pi Core Subagent MVP Objective](../../.asdl/objectives/pi-core-subagent-mvp/objective.md): canonical design record for the proposed Pi core foreground runner subagent primitive and terminal capture semantics.
- [Pi Core Subagent MVP Roadmap](../../.asdl/objectives/pi-core-subagent-mvp/roadmap.md): review-slice plan for landing the primitive.
- [Objective Stack Runner-Subagent Rewrite Brief](./objective-stack-subagent-rewrite-brief.md): goals, command parameters, failure analysis, and rewrite plan for rebuilding Objective stack implementation on the repo-local runner subagent helper.

## Session `cwd` semantics

Pi's working directory is **session-bound**, not shell-command-bound.

That means:

- `ctx.cwd` reflects the active Pi session/runtime
- shell commands like `cd ../other-worktree && git status` do **not** change Pi's session `cwd`
- Pi can move to another `cwd` when it replaces the active session/runtime

For details, see:

- [Session `cwd` semantics](./session-cwd-semantics.md)

## Recommended cross-worktree pattern

For repo workflows that intentionally move to another worktree:

1. resolve or create the target worktree using the repo CLI
2. create a **fresh** Pi session rooted at that worktree
3. switch Pi to that session

Do not try to infer a durable Pi cwd change from arbitrary shell `cd` commands.
