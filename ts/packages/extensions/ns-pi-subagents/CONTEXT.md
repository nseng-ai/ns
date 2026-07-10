# @nseng-ai/ns-pi-subagents

This package owns Pi's model-visible subagent delegation interface and session-local fleet visibility. Lower-level runner-subagent process and protocol vocabulary remains valid substrate beneath that interface.

## Language

**Subagent Tool**:
The single model-visible Pi tool named `subagent`. A caller selects an Agent Type, supplies one or more Subagent Tasks, and may request an Execution Architecture or model override. The tool applies agent policy before dispatch and returns bounded evidence while the child transcript remains authoritative.
*Avoid*: `explore tool`, `forked_pi_agent`, one-tool-per-agent, runner tool

**Agent Type**:
A named behavioral policy for delegated work. The built-in Agent Types are `explorer`, for read-only reconnaissance, and `task`, for one focused general task. Agent Type answers what behavior and permissions the child receives, not how it executes.
*Avoid*: runtime, process type, runner agent, using `subprocess` or `in-process` as an agent name

**Agent Descriptor**:
The typed executable policy for one Agent Type: task bounds, concurrency, timeout, permissions, prompt-context policy, model policy, result bounds, supported runtimes, and automatic runtime preference. A Markdown agent definition separately owns child prompt and parent-steering prose.
*Avoid*: Markdown as executable policy, tool definition, runtime adapter

**Agent Registry**:
The immutable startup catalog of Agent Descriptors used to build the Subagent Tool schema and guidance. Duplicate or invalid descriptors are rejected; an unhealthy Markdown definition does not suppress healthy catalog entries.
*Avoid*: mutable post-registration catalog, Markdown directory scanning, one registry per tool

**Execution Architecture**:
The mechanism used to run a child session: `subprocess` or `in-process`. `auto` asks descriptor and host policy to choose deterministically and is not itself an execution architecture.
*Avoid*: agent type, permission profile, treating in-process as explorer-specific

**Runtime Adapter**:
An implementation of one Execution Architecture. The Runtime Registry owns adapter availability and resolution independently from the Agent Registry. Runtime choice cannot add tools or otherwise weaken the selected Agent Descriptor.
*Avoid*: agent descriptor, behavioral policy, using runtime availability to infer permissions

**Subagent Task**:
One titled, focused assignment supplied to the Subagent Tool. Task count expresses requested breadth; the selected Agent Descriptor enforces legal count and concurrency.
*Avoid*: agent-specific option bag, breadth profile, implicit shared-worktree parallel safety

**Fleet**:
The session-local collection of logical tool runs and tasks, including progress, retry evidence, diagnostics, session evidence, and worktree observations exposed through `ns:agents:*` Pi UI. One Subagent Tool invocation creates one Fleet run with one task per requested position; runtime retry attempts remain beneath that logical task identity. Fleet names the session-tree view and is independent from Agent Type and Execution Architecture.
*Avoid*: durable job database, agent registry, subprocess-only inventory

**Runner-Subagent Substrate**:
The lower-level process, JSON-event protocol, terminal-capture, final-text, progress, and result family named `RunnerSubagent*`. Direct consumers may use this substrate without invoking the model-visible Subagent Tool.
*Avoid*: renaming substrate types merely because the former `runner` Agent Type became `task`, claiming terminal capture is supported by the in-process adapter
