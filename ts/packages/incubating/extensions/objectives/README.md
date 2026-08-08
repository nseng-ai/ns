# @nseng-ai/objectives

ns Objectives, packaged as an installable ns extension.

An **Objective** is a durable, checked-in planning record for work that outlives a single
agent session — multi-session, multi-branch, or multi-PR work. Your coding agent reads and
maintains the record; you review it in ordinary diffs. Objectives live as Markdown under
`.ns/objectives/` in your repository.

This package is an ns extension: it is installed on top of the bare-core
[`@nseng-ai/ns`](../../../public/ns/README.md) CLI, not bundled with it. Installing the
extension provides Objective management and selection conveniences, but is not a runtime
prerequisite for portable Objective autorun.

## Portable autorun without the extension

You can invoke the `objective-autorun` skill directly in a capable agent harness. Once that
skill and the checkout-local `.ns/objectives/<slug>/` Markdown records are present, portable
mode requires Git and harness implementation/delegation capability, but no runtime `ns`,
Graphite, Branch Context, or Pi installation.

Ask the agent to "autorun this Objective" or invoke the skill through your harness's normal
skill surface. The skill reads the Objective records directly, manages one non-trunk feature
branch for the run, verifies each implementation slice as the parent, and creates one ordinary
local commit per accepted slice. These commits are **parent-verified ordinary commits**; they
are not **Runner Checkpoints** and carry no Objective Runner provenance. ADR 0037 publication
is unavailable in portable mode. Any later push, PR, or submit operation is a separate,
explicitly requested workflow.

The same skill can use **`ns-bookended` mode** when both
`ns objective exec runner-begin` and `ns objective exec runner-finish` are available. That
mode uses the strict **Objective Runner** protocol: `runner-finish` verifies and commits the
slice, producing a **runner-attested Runner Checkpoint**. Only a real committed Runner
Checkpoint can be eligible for the separate, parent-only ADR 0037 publication path.

Installing this package remains useful when you want the `ns objective` CLI, agent
instructions, and Pi slash-command conveniences. In particular,
`/ns:objective:autorun` is a thin picker/injector: it selects an active Objective and invokes
the same `objective-autorun` skill; it does not own a separate execution protocol.

The package is harness-independent and has no Pi host surface. The separate incubating
`@nseng-ai/pi-ns-objectives` adapter preserves the `/ns:objective:*` Pi command family by
consuming this package's curated `@nseng-ai/objectives/api` surface; it does not move or
redefine Objective domain behavior. That adapter is currently implemented on a feature
branch, not landed or published.

## Install

Requires `@nseng-ai/ns` installed and a repository already activated with `ns init`:

```bash
npm install -g @nseng-ai/ns
ns init # once per repository
ns extension install npm:@nseng-ai/objectives
```

A bare-core `ns` install does **not** include `ns objective`. Installing this extension:

1. Records `@nseng-ai/objectives` in `ns.toml` and activates its repository-neutral effects.
2. Adds the `ns objective` command surface.
3. Adds an Objectives instruction block to the generated ns instructions, teaching agents
   to check `ns objective list` before non-trivial work and to use the Objective skills.
4. Creates the declared `.ns/objectives` consumer directory.

Extension installation does not copy Objective skills into a harness. Install them through
the direct `npx skills` workflow, which owns acquisition, lifecycle, and `skills-lock.json`:

```bash
npx skills add nseng-ai/ns --skill objective --full-depth
```

Repository files own first-party sources and topology, checked-in Harness Overlays, and
invocation metadata. ns may invoke installed skills but does not manage them; there is no
`ns skills`, top-level `ns update`, or `ns skill-exposure` command. The standalone
`objective-runner-step` skill is retired; the first-party Objective skill set contains
`objective`, `objective-autorun`, `objective-close`, `objective-create`, `objective-critique`,
`objective-next`, `objective-refresh`, and `objective-update`.

`ns extension install` writes files but never commits — review and commit them yourself.
After the first install, `ns extension update` refreshes the extension's repository-neutral
effects when it changes.

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
