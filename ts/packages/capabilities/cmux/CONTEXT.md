# @nseng-ai/cmux

`@nseng-ai/cmux` is the private cmux capability: it drives cmux workspaces for repo-local dispatch, sidebar, workspace-summary, and planning flows.

## Language

**cmux capability**:
The first-party **Capability** that drives cmux workspaces and surfaces by composing branch, plan, slot, and Pi-session inputs into workspace operations.
*Avoid*: CCC, Cmux Command and Control, orchestration layer, generic cmux wrapper

**Prompt dispatch**:
A dispatch flow that derives a new Graphite-tracked branch from a task prompt, stores the launch prompt for that branch, and opens its slot checkout in a cmux workspace.
*Avoid*: generic task runner, direct prompt execution, Plan dispatch

**Trunk dispatch**:
A **Prompt dispatch** variant whose new branch starts from the refreshed Graphite trunk rather than the current branch.
*Avoid*: current-branch dispatch, trunk checkout, rebase

**Plan dispatch**:
A dispatch flow that turns the latest session **Saved Plan** into an **Attached Plan** on a new Graphite-tracked branch, checks out its slot, and launches implementation at a selected **Dispatch destination**.
*Avoid*: Prompt dispatch, plan storage, plan execution

**Dispatch destination**:
The cmux presentation target for **Plan dispatch**: either a new workspace or a focused terminal surface in the caller workspace.
*Avoid*: branch destination, checkout target, dispatch source

**Sidebar summary**:
A compact cmux workspace title and description derived from the current Pi session, branch state, or selected Objective.
*Avoid*: Pi footer, Worktree status observability, transcript summary

**Workspace summary**:
A requested cmux workspace title and description applied to a caller workspace, followed by clearing its pending summary status.
*Avoid*: Sidebar summary, repository summary, terminal title

**Claude plan tab**:
A focused cmux terminal tab that opens Claude in plan mode using an explicit prompt or the latest assistant response from the current Pi session.
*Avoid*: Plan dispatch, Attached Plan, ordinary shell tab

**Timestamped prompt file**:
A Markdown prompt handoff named with its creation timestamp and purpose stem so a launched process can consume the exact prompt without colliding with another launch.
*Avoid*: Saved Plan, Attached Plan, Branch Memory Entry

**Branch-slug generation**:
Derivation of a sanitized, length-bounded Git branch slug from task or plan content, with content-based fallback when model generation is unavailable.
*Avoid*: Objective Slug, plan key, arbitrary branch name

**cmux capability boundary**:
The `pi` subpackage is the only cmux capability subpackage that imports neutral `@nseng-ai/pi/...` host helpers; the remaining subpackages stay Pi-host independent.
*Avoid*: host-owned cmux domain, Pi imports from cmux, package cycle
