# @sdl/objective

This context captures domain language for the `objective` capability package: the CLI surfaces over checked-in Objective records and the in-process Capability API boundary that lets sibling extensions reuse Objective behavior without depending on the Pi host. It names only CLI- and capability-specific terms; the Objective *system* vocabulary (Objective, Active/Archive Objective Root, Objective Update/Close/Archive, Semantic Update, Closure Marker, …) stays canonical in the root [SDL Tools](../../../CONTEXT.md) context and is cited here, not redefined.

## Language

**`ji objective` command surface**:
The public SDL-grouped Objective CLI surface — `ji objective ...` — whose commands `archive`, `check`, and `list` view and mutate checked-in Objective records. The former top-level `bin.objective` executable is retired; `@sdl/objective/command-face` remains a package command-face export for adapters/tests, not the canonical installed command.
*Avoid*: Objective Capability API, hidden `exec` group, top-level `objective` binary, Objective record database, Pi command adapter

**Checkout-local `ji objective list`**:
The `ji objective list` behavior that inventories Objective records under the root-defined **Active Objective Root** in the current checkout, attributing each record from Git path-touch facts rather than a Graphite stack projection.
*Avoid*: Graphite stack projection, archived-record discovery, Objective selection authority, cross-worktree inventory

**Hidden `ji objective exec`**:
The hidden `ji objective exec ...` command group of deterministic skill- and agent-facing fact helpers (`list-candidates`, `read-objective`, `runner-subagent-usage`), kept out of the public human command surface and out of the Capability API.
*Avoid*: public human command, Objective Capability API, Markdown-meaning interpreter, stable scripting contract

**Checked-in Objective record storage**:
The rule that the `ji objective` CLI reads and writes Objective records only as checked-in Markdown under the root-defined **Active Objective Root** / **Objective Archive Root**, including `ji objective archive` / `--unarchive` directory moves; it is a view-and-mutation surface over those root system terms, not a separate store.
*Avoid*: hidden database, Branch Memory storage, redefining Objective or Objective Archive, Graphite-derived record set

**Objective Capability API**:
The curated `@sdl/objective/api` surface for in-process sibling consumers (`ccc`, `sdlcc`, and Pi's objective adapters): the `createObjectiveClient(...)` facade returning ok/failure results, plus the relocated Objective-selection, picker, and CLI-args/candidates helpers, used to reuse Objective behavior without invoking the CLI or importing private modules.
*Avoid*: CLI JSON parsing, `@sdl/objective/src/...` deep import, package-root convenience import, `ctx`-passing API

**Objective Client**:
The `ObjectiveClient` facade returned by `createObjectiveClient`, exposing `listObjectives` / `readObjective` / `listActiveCandidates` as clean ok/failure results.
*Avoid*: command-face `ClinkrExit` types, raw storage gateway, parsed CLI JSON, host `ctx` object

**Objective Domain Core**:
The gateway-injected logic that runs over the `ObjectiveCliContext` seam (its Git and Objective-storage **Gateways**) with no dependency on a raw host `ctx` or the Pi runtime; the **Objective Capability API** and the `ji objective` command surface are thin edges over it.
*Avoid*: presentation-host logic, command-face-coupled logic, raw `ctx`/`SdlExtensionApi` dependency, `…Loader` collaborator

**Objective Runner**:
A portable Objective-owned workflow core for executing one committed Objective implementation step through narrow injected runner **Gateways**, then returning checkpoint facts for a parent LM decision before any next step.
*Avoid*: Pi-only autopilot, hidden runner state, deterministic batch loop, Objective-as-task-database

**Runner Checkpoint**:
The parent-facing Markdown contract an **Objective Runner** step returns for every terminal state, composed of runner-attested verified facts and clearly labeled unverified child-reported narrative.
*Avoid*: public JSON workflow state, child self-report treated as fact, hidden runner state

**Objective Capability Dependency Boundary**:
The directed-edge rule that Objective runtime/core code never imports the Pi host, while the container package's `pi` subpackage may use `@sdl/pi` as an optional peer for Pi presentation; in-process consumers reach Objective behavior through `@sdl/objective/api`. The general acyclic invariant it serves lives in the root **Extension Layering** cluster and ADR 0009 and is not restated here.
*Avoid*: restating the guard mechanics, non-`pi` Objective → `@sdl/pi` imports, deep-import consumption, package-root consumer import
