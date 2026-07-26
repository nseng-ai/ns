# @nseng-ai/objectives

This context captures domain language for the Objectives ns extension package: the CLI surfaces over checked-in Objective records and the in-process extension-package-API boundary that lets sibling extensions reuse Objective behavior without depending on the Pi host. It names only CLI- and extension-specific terms; the Objective *system* vocabulary (Objective, Active Objective Root, Objective Update/Close, Semantic Update, Closure Marker, …) stays canonical in the root [ns](../../../CONTEXT.md) context and is cited here, not redefined.

## Language

**`ns objective` command surface**:
The public ns-grouped Objective CLI surface — `ns objective ...` — whose commands `check`, `list`, and `show` view checked-in Objective records. The former top-level `bin.objective` executable is retired; the package's mountable command surface is the `./ns-extension` descriptor export plus the per-command `./ns/commands/*` exports, not a `command-face` export (none exists).
*Avoid*: Objective extension package API, hidden `exec` group, top-level `objective` binary, Objective record database, Pi command adapter

**Checkout-local `ns objective list`**:
The `ns objective list` behavior that inventories Objective records under the root-defined **Active Objective Root** in the current checkout, reporting per-record status, latest update, related local-branch count, and Objective Edge count. Local branch names and edge-attribution detail are no longer a `list` concern; they move to `ns objective show`.
*Avoid*: Graphite stack projection, deleted-record discovery, Objective selection authority, cross-worktree inventory, per-record branch-name attribution

**`ns objective show`**:
The `ns objective show <slug>` visible read-only command (Tier 0) that renders one Objective Edge in detail: status and Blocked Sentence, latest update and outstanding-changes state, the local branches whose changes touch the record (the branch attribution formerly on `list`, via Git path-touch facts), and non-closed Objective Edges by default with both perspectives — this record's Edge Annotation and the counterpart's back-edge annotation plus whether the counterpart record exists and whether the resolved counterpart has a closure marker. Closed counterpart edges are intentionally hidden from the default human focus and can be included explicitly.
*Avoid*: Graphite stack projection, Objective selection authority, edge mutation surface, prose interpretation, hidden `exec` placement

**EDGES list column**:
The `ns objective list` column to the right of BRANCHES showing a record's **Objective Edge** count (blank when zero) on the pretty, table, and markdown surfaces, paired with blocked STATUS rendering that uses the blocked glyph `⊘` (ascii fallback `!`, warn intent) and the text `blocked` while the machine lifecycle status remains `open`, per the root **Blocked Sentence** term.
*Avoid*: edge detail rendering (that is `ns objective show`), annotation display (that is `ns objective show`), blocked lifecycle status in machine output, deriving blocked state from body prose

**Edge linting in `ns objective check`**:
The structural **Record Frontmatter** lint in `ns objective check`: the per-slug check validates that record's edges including mirror lookups, and the `ns objective check --all` (short `-a`) sweep covers every active-root record with frontmatter-only parsing, scoped to edge/blocked structural lint rather than the full heading checks. Violations — dangling slug, missing mirror side, empty annotation, duplicate pair, malformed frontmatter, empty blocked sentence — are errors; one warning-severity advisory (a Blocked Sentence alongside a closed edge counterpart, from marker state only) is reported without failing the check or sweep; the linter never interprets **Edge Annotation** prose or derives blocked state.
*Avoid*: full-check sweep, prose-quality lint, blocked-state derivation, full-body record reads, edge mutation surface

**Hidden `ns objective exec`**:
The hidden `ns objective exec ...` command group of deterministic skill- and agent-facing fact helpers (`list-candidates`, `load-orientations`, `read-objective`, `runner-begin`, `runner-finish`, `runner-subagent-usage`, `tracking-gate`), kept out of the public human command surface and out of the extension package API. The visible `ns objective show` is the human-facing single-record detail sibling of the hidden `exec read-objective` filesystem reader, not a member of this group.
*Avoid*: public human command, Objective extension package API, Markdown-meaning interpreter, stable scripting contract

**Checked-in Objective record storage**:
The rule that the `ns objective` CLI reads Objective records only as checked-in Markdown under the root-defined **Active Objective Root**. Records leave active checkout state by ordinary source-controlled deletion and can be recovered from git history when needed; there is no Objective-specific parking store.
*Avoid*: hidden database, Branch Memory storage, deleted-record store, Graphite-derived record set, tombstone registry

**Objective extension package API**:
The curated `@nseng-ai/objectives/api` surface for in-process sibling consumers (the Herdr extension and Pi's objective adapters): the `createObjectiveClient(...)` facade returning ok/failure results, plus the relocated Objective-selection, picker, and CLI-args/candidates helpers, used to reuse Objective behavior without invoking the CLI or importing private modules.
*Avoid*: CLI JSON parsing, `@nseng-ai/objectives/src/...` deep import, package-root convenience import, `ctx`-passing API

**Objective Client**:
The `ObjectiveClient` facade returned by `createObjectiveClient`, exposing `listObjectives` / `readObjective` / `listActiveCandidates` as clean ok/failure results.
*Avoid*: command-face `ClinkrExit` types, raw storage gateway, parsed CLI JSON, host `ctx` object

**Objective Domain Core**:
The gateway-injected logic that runs over the `ObjectiveCliContext` seam (its Git and Objective-storage **Gateways**) with no dependency on a raw host `ctx` or the Pi runtime; the **Objective extension package API** and the `ns objective` command surface are thin edges over it.
*Avoid*: presentation-host logic, command-face-coupled logic, raw `ctx`/`NsExtensionApi` dependency, `…Loader` collaborator

**Objective Runner**:
A portable Objective-owned workflow core for executing one committed Objective implementation step through narrow injected runner **Gateways**, then returning checkpoint facts for a parent LM decision before any next step.
*Avoid*: Pi-only autopilot, hidden runner state, deterministic batch loop, Objective-as-task-database

**Runner Checkpoint**:
The parent-facing Markdown contract an **Objective Runner** step returns for every terminal state, composed of runner-attested verified facts and clearly labeled unverified child-reported narrative.
*Avoid*: public JSON workflow state, child self-report treated as fact, hidden runner state

**Objective Extension Dependency Boundary**:
The directed-edge rule that Objective runtime/core code never imports the Pi host, while the container package's `pi` subpackage may use `@nseng-ai/pi-runtime` as an optional peer for Pi presentation; in-process consumers reach Objective behavior through `@nseng-ai/objectives/api`. The general acyclic invariant it serves lives in the root **Extension Layering** cluster and ADR 0009 and is not restated here.
*Avoid*: restating the guard mechanics, non-`pi` Objective → `@nseng-ai/pi-runtime` imports, deep-import consumption, package-root consumer import
