# @nseng-ai/objectives

ns Objectives, packaged as an installable ns extension.

An **Objective** is a durable, checked-in planning record for work that outlives a single
agent session — multi-session, multi-branch, or multi-PR work. Your coding agent reads and
maintains the record; you review it in ordinary diffs. Objectives live as Markdown under
`.ns/objectives/` in your repository.

This package is an ns extension: it is installed on top of the bare-core
[`@nseng-ai/ns`](../../../public/ns/README.md) CLI, not bundled with it.

## Install

Requires `@nseng-ai/ns` installed and a repository already activated with `ns init`:

```bash
npm install -g @nseng-ai/ns
ns init --harness claude-code                  # once per repository
ns extension install npm:@nseng-ai/objectives
```

A bare-core `ns` install does **not** include `ns objective`. Installing this extension:

1. Records `@nseng-ai/objectives` in `ns.toml` and activates it for your configured
   harness.
2. Adds the `ns objective` command surface.
3. Adds an Objectives instruction block to `AGENTS.md`, teaching agents to check
   `ns objective list` before non-trivial work and to use the Objective skills.
4. Provisions the **nine Objective skills** into your harness's skill root —
   `.claude/skills/` for Claude Code: `objective`, `objective-autorun`, `objective-close`,
   `objective-create`, `objective-critique`, `objective-next`, `objective-refresh`,
   `objective-runner-step`, `objective-update`.

`ns extension install` writes files but never commits — review and commit them yourself.
After the first install, `ns extension update` refreshes the provisioned artifacts when the
extension changes.

## Lifecycle

Drive an Objective through **create → next → update → close** by asking your agent in
natural language; each step maps to a skill:

| Step        | Ask your agent                                                       | Skill              |
| ----------- | -------------------------------------------------------------------- | ------------------ |
| **Create**  | "Create an objective for migrating our API layer to typed handlers." | `objective-create` |
| **Advance** | "What's next on the api-typed-handlers objective?"                   | `objective-next`   |
| **Update**  | "Update the objective with what we landed."                          | `objective-update` |
| **Close**   | "Close the objective."                                               | `objective-close`  |

Because the record is checked in, a fresh agent session starts with the full history of
intent instead of an empty context window. Progress is evidence-linked prose, not a
checkbox dashboard. Closing records the rationale, marks the record closed without
deleting anything, and reviews every edge-connected Objective so affected records are
unblocked or otherwise updated to their post-closure state.

## CLI

The extension adds a deterministic, read-only `ns objective` surface for listing and
inspecting records:

```bash
ns objective list           # open Objectives (auto-detects trunk; reads .ns/objectives/)
ns objective show <slug>    # inspect one record
```

`ns objective list` is zero-config; closed records drop out of the default listing.
