# asdl Platform

**asdl** (**Agentic Software Development Lifecycle**) is a set of composable **Tools** for agent-driven engineering workflows. Each Tool is usable on its own; teams adopt them piecemeal rather than buying into the whole system.

## Language

**Tool**:
A self-contained, independently adoptable unit of asdl functionality. A Tool ships at minimum a standalone CLI binary, and optionally a Plugin, one or more Skills, and harness integrations.
_Avoid_: Feature, capability, plugin (a delivery surface, not the unit), agent tool (LLM function call), package (implementation packaging)

**asdl CLI**:
The namespacing CLI binary (`asdl ...`) that hosts Plugin-shipping Tools as subgroups. Adopting it gives a single PATH entry instead of one per Tool, avoids cross-Tool name collisions, and is the natural home for shared cross-Tool configuration. Optional: a team may use individual Tools without installing the asdl CLI at all.
_Avoid_: meta-CLI, root CLI, asdl-tools binary

**Plugin**:
A Tool's registration into the **asdl CLI** namespace, mounted as a subgroup of `asdl`. A Tool may ship a Plugin (so it is reachable as `asdl <tool> ...` alongside the standalone `<tool> ...`) or stay standalone-only.
_Avoid_: extension, addon, entry point (the mechanism, not the unit)

**Skill**:
Markdown instructions in a `SKILL.md` file (plus optional supporting files in the same directory) that a **Harness** loads to drive a workflow. A Skill may invoke a Tool's CLI commands, provide read-only conceptual grounding for a Tool, or both.
_Avoid_: Agent script, prompt template, command, recipe

**Public Skill**:
A Skill that ships as part of a Tool's distribution to downstream users. Public Skills are discoverable via `npx skills add` and depend on the Tool's CLI being installed.
_Avoid_: External skill, exported skill, shipped skill

**Dev Skill**:
A Skill local to the asdl-tools repo that is not shipped to downstream users. Marked by a `dev-` name prefix and `metadata.internal: true` in frontmatter. Dev Skills are either pure contributor helpers (e.g. `dev-fix-just`, `dev-gh`) or prototypes being dogfooded before graduating into a Public Skill.
_Avoid_: Internal skill (also valid, but "Dev Skill" matches the naming convention); private skill; contributor-only skill

**Harness**:
An AI coding agent (Claude Code, Codex, Cursor, etc.) that loads **Skills** and invokes **Tool** CLIs to drive workflows. External to asdl; a Tool may target one or more Harnesses, and some Tools carry Harness-specific adapter code (e.g. `asdl-reviewer`'s Claude Code adapter).
_Avoid_: Agent (fatally overloaded — can mean LLM, autonomous worker, harness, or LLM tool-call); client; host; IDE

## Relationships

- The asdl Platform is a set of zero or more **Tools**.
- A **Tool** is independently adoptable: a team may use one Tool without adopting any other.
- Tools may depend on other Tools (e.g. an objectives Tool may consume a branch-memory Tool).
- A Tool MAY ship a **Plugin** that registers it into the **asdl CLI** namespace.
- The **asdl CLI** hosts zero or more Plugins as subgroups; adopting it is optional.
- A Tool MAY ship one or more **Public Skills** as part of its distribution.
- A **Public Skill** is owned by exactly one Tool and depends on that Tool's CLI.
- A **Dev Skill** is owned by no Tool; it lives only in the asdl-tools repo as contributor scaffolding.
- A Dev Skill MAY graduate into a Public Skill by dropping the `dev-` prefix and the `metadata.internal: true` flag.
- A **Harness** loads zero or more Skills and invokes Tool CLIs (typically as shell commands written in a Skill).
- A Skill is physically installed for a specific Harness — `npx skills add --agent claude-code` lays it under `.claude/skills/`; other Harnesses use other paths.
- Today's Tools: brmem, asdl-objectives, asdl-pr-address, asdl-reviewer, asdl-slots, asdl-dispatcher.

## Example dialogue

> **Dev:** "Should `objective-create` also be its own **Tool**, or does it belong inside `asdl-objectives`?"
> **Domain expert:** "It's a **Public Skill** owned by the `asdl-objectives` **Tool**, not a Tool of its own. A Tool is the unit that ships the CLI; the Skill is part of the Tool's distribution."
>
> **Dev:** "Why does `dev-fix-just` not show up under `asdl --help`?"
> **Domain expert:** "Because it is a **Dev Skill** — it never had to register with the **asdl CLI**. Dev Skills are repo-local contributor scaffolding; they do not ship and do not need a **Plugin**."
>
> **Dev:** "If `brmem` does not ship a Plugin, how does a user run it through `asdl`?"
> **Domain expert:** "They cannot — they invoke the standalone `brmem` binary. Adopting the **asdl CLI** is optional, and shipping a **Plugin** is an opt-in delivery surface, not a **Tool** requirement."
>
> **Dev:** "When we say a **Harness** invokes a Tool, do we mean Claude is calling our Python directly?"
> **Domain expert:** "No — the **Harness** is the program hosting the LLM (Claude Code, Codex). It loads the **Skill**, which tells the LLM to issue shell commands. The Tool's CLI is the binary that runs at the other end of those commands."

## Flagged ambiguities

- "tool" is also used in the agentic-coding world for LLM function calls. Resolved in this context: **Tool** means an asdl-shipped unit (CLI + optional Plugin + optional Skills + harness integration). When discussing LLM function calls, say "agent tool" or "tool call" explicitly.
- "agent" is used in the install flag (`npx skills add --agent claude-code`) and is widely used in the broader ecosystem to mean both the LLM and the program hosting it. Resolved: use **Harness** for the program (Claude Code, Codex). Treat `--agent` as historical sugar.
- "feature" was used in `CLAUDE.md` for the unit of composability. Resolved: use **Tool**. "Feature" is reserved for general English usage and avoided as a noun in design discussions.
