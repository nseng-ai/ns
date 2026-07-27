# @nseng-ai/objectives

The harness-independent deterministic and automation enhancement for Objectives.

An **Objective** is a durable, checked-in planning record for work that outlives a single
agent session — multi-session, multi-branch, or multi-PR work. Your coding agent reads and
maintains the record; you review it in ordinary diffs. Objectives live as Markdown under
`.ns/objectives/` in your repository.

The portable foundation is seven canonical incubating skills installed independently with
`npx skills`: `objective`, `objective-create`, `objective-list`, `objective-next`,
`objective-update`, `objective-refresh`, and `objective-close`. They have complete CLI-free
behavior. This package progressively enhances those same skills and records; it does not
create a second Objective system.

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
2. Adds rich `ns objective` list/show/check facts, hidden skill-facing deterministic
   helpers, orientation loading, the Git-aware Tracking Gate, and Objective Runner
   begin/finish and publication safeguards.
3. Adds an Objectives instruction block to `AGENTS.md`.
4. Provisions `objective-runner-step` and `objective-autorun` as enhanced automation
   skills. For each of the seven portable identities, it provisions canonical content only
   when that artifact is missing.

Artifact ownership is channel-specific. A portable skill already acquired by `npx skills`
and recorded in `skills-lock.json` remains owned by `npx skills`; extension install/update
does not overwrite or adopt it. A missing portable artifact provisioned by this extension
is tracked in `.ns-harness-artifacts-manifest.json`. Update and removal affect only
extension-owned, manifest-tracked artifacts and preserve `npx skills`-owned skills, local
files, and `.ns/objectives/` records. Ambiguous pre-existing targets fail closed rather than
silently transferring ownership.

`ns extension install` writes files but never commits — review and commit them yourself.
After the first install, `ns extension update` refreshes only extension-owned artifacts.

## Lifecycle

Drive an Objective through **create → next → update → close** by asking your agent in
natural language; each step maps to a skill:

| Step        | Ask your agent                                                       | Skill              |
| ----------- | -------------------------------------------------------------------- | ------------------ |
| **List**    | "List the open objectives."                                          | `objective-list`   |
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

`ns objective list` is zero-config; closed records drop out of the default listing. Its
rich Git and record facts are enhancement guarantees, not the contract of portable
`objective-list`.

## Pi integration

Pi presentation is separately installed as `@nseng-ai/pi-ns-objectives`. That required-`ns`
host package owns slash commands, picker/completion UI, skill expansion, and runner
orchestration. It consumes `@nseng-ai/objectives/api` plus neutral Pi runtime interfaces;
this package does not export Pi entrypoints. Removing Pi integration leaves this extension,
the portable skills, and all Objective records intact.

The seven portable skills and two enhanced automation skills remain incubating. Independent
installation is portability evidence, not a public support warrant; promotion requires a
separate review and canonical path move.
