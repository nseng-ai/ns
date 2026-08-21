# @nseng-ai/pi-ns-handoffs

`@nseng-ai/pi-ns-handoffs` is the Pi host adapter for the Handoffs ns extension. It owns Pi command and tool registration, prompt/status presentation, content-derived slugging, create-then-launch session orchestration, and Handoff Pi parity identity.

## Language

**Handoff Pi Adapter**:
The incubating host package at `ts/packages/incubating/hosts/pi/extensions/pi-ns-handoffs/`. It consumes Handoff lifecycle and identity behavior only through `@nseng-ai/handoffs/api`. Its
skill-backed create flows capture the exact effective `handoff-create` source from the Pi command
context before focus, Git, destination, or launch work, then defer content loading until prompt
construction.
*Avoid*: Handoff Domain Core, an `@nseng-ai/handoffs/pi` host surface, Herdr extraction.

**Handoff Launch Adapter Surface**:
The declared `@nseng-ai/pi-ns-handoffs/handoff-launch` composition contract through which another Pi adapter can supply destination-specific preflight and launch instructions.
*Avoid*: Handoff extension package API, harness-independent launch gateway, private deep import.
