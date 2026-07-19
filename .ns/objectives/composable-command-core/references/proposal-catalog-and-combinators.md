# Proposal: dissolve the invocation context — catalog as the product, opt-in combinators

> **Status:** the founding analysis for the `composable-command-core` Objective, produced by a primitive-by-primitive value investigation of the invocation context. It was written as a counter-proposal to the retired `sdk-invocation-context` Objective's README-draft contract (deleted with that Objective); where this document and `objective.md` disagree, `objective.md` is current — later iteration moved `NsContext` to `{ catalog }` only, made the hostable overlay events-based with no byte sinks, dropped `env` virtualization, kept the event vocabulary in the SDK (not clinkr), and dropped `Host` inheritance in favor of composition. It contradicts that draft's premise: instead of enriching a 13-primitive invocation contract, it dissolves the contract into (a) one ns-owned dynamic primitive, (b) clinkr's existing seams, (c) ordinary libraries, and (d) two composable opt-ins. See [context-primitives.md](./context-primitives.md) for the per-primitive value analysis that started this.

## The evidence chain (why the current design fails its own value test)

Each step below was checked against the codebase, not argued from theory.

1. **Every context primitive's justification reduces to two premises.** The per-primitive analysis ([context-primitives.md](./context-primitives.md)) shows every field is justified by *in-process hosting* (process globals lie when commands run inside a host) or *in-memory testing*. No primitive justifies itself independently.
2. **The subprocess alternative was never priced.** A subprocess gets cwd, env, streams, and stdin from the OS for free; semantic events serialize as NDJSON; confirm is request/response over a pipe (the LSP/MCP pattern). The context is a process boundary emulated in TypeScript.
3. **Command traces confirm it.** `flow changes` (`ts/packages/capabilities/flow/src/ns/commands/changes.ts`): the only context uses without a cheap subprocess substitute were `textGenerator` + operation-level model policy. `flow submit` (`.../submit.ts`): same, at 10× scale — and its matrix progress consumes discriminated-union events (`{ type: "phase-started", phaseKey: … }`), i.e. it is *already* a serializable event protocol.
4. **The isolation discipline is already broken in the flagship command.** `submit.ts` imports `node:fs/promises`, `node:path`, `node:process` directly; its failure-log writer hits the real filesystem and falls back to `process.cwd()` — the exact ambient reach the contract forbids. Cause: the context doesn't model `fs`, so commands *must* go ambient. In-process isolation is unenforceable without modeling ever more of the OS.
5. **The Pi host never passes the rich contract.** The real host boundary (`ts/packages/hosts/pi/src/commands/cli-extension.ts`, `CliCommandRunDeps`) is: `{ cwd, env, stdout, stderr, onOutput, onProgress, confirm? }`. Seven fields, wire-protocol-shaped. No `textGenerator` crosses it — the ns CLI constructs `PiTextGenerator` itself from Pi's model registry.
6. **textGenerator is already a library.** One implementation exists (`hosts/ns/src/cli/pi-text-generation.ts`); no host substitutes it; it has no host-lived state (registry from config, per-request auth and session ids); it already takes constructor DI overrides for tests. The "genuinely host-lived resource" claim in the README draft is aspirational, not descriptive.
7. **clinkr already owns the presentation seam.** `infra/clinkr` ships `ClinkrIo` (byte sinks + caps; `resolveIo`'s docstring: *"the seam CLIs hand their deps to"*), `ClinkrInteraction` (confirm + `isInteractive`), `Caps`, `ClinkrFormat`, schema→surface planning, completion mechanics, failure/exit conventions, testing helpers. The invocation context re-declares clinkr's seams one layer up with parallel vocabulary (`NsCommandIo` vs `ClinkrIo`, `RenderCapabilities` vs `Caps`).

**The honest accounting of the current 13-primitive context:**

| Primitive(s)                                                                                     | Actual owner                                                                                |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `stdout`, `stderr`, `renderCapabilities`, `outputFormat`, `confirm`, progress/commandIo/onOutput | clinkr (existing seams + one new events module)                                             |
| `cwd`, `env`, `stdin`                                                                            | the OS (virtualized only to patch in-process hosting)                                       |
| `exec`, `textGenerator` (+ model policy), git access                                             | ordinary libraries with constructor DI (`foundation/exec`, `PiTextGenerator`, `GitGateway`) |
| `hasExtension`                                                                                   | **ns** — the one genuinely ns-owned dynamic primitive (a catalog view)                      |

## The proposal

**ns's product is the extension ecosystem — the catalog.** Discovery, precedence, descriptor loading, completion wiring. Its dynamic contract at invocation time is one lookup view into that noun. Everything else commands need is either a clinkr seam, an OS fact, or a library.

### Three orthogonal opt-ins (not tiers)

1. **Cataloged** (free, always): discoverable — name, summary, precedence, lazy load.
2. **Hostable** (opt-in): the command promises to route bytes through injected sinks instead of `process.*`. Buys in-process execution (Pi runs it without a spawn; tests capture output in-memory).
3. **Clinkr** (opt-in): schema→surface, typed results/`--format`, semantic events, interaction. Buys standardization and rich rendering. **Clinkr implies hostable structurally** — the handler only touches channels behind the seam, so binding them to process streams or a Pi widget is the runner's choice.

Hosting routes on declared capability, mechanically:

| Command kind | Pi runs it as                                    | Tested via                   | Author burden            |
| ------------ | ------------------------------------------------ | ---------------------------- | ------------------------ |
| cataloged    | **subprocess** — spawn `ns <cmd>`, capture bytes | subprocess (author's choice) | zero                     |
| + hostable   | in-process; bytes into transcript                | in-memory byte capture       | route bytes through `io` |
| + clinkr     | in-process; widgets + rich blocks                | in-memory scenario tests     | none extra               |

This dissolves the enforcement problem from evidence item 4: hostability is declared metadata, not doctrine. A raw command using ambient everything is a supported citizen that Pi subprocesses — the subprocess path is the built-in safety floor, not a rival architecture. (A *declared*-hostable command can still lie by importing `fs` or touching `process.cwd()`; the declaration is a reviewable one-line promise, not a proof.)

### The API: one definer, combinators for the opt-ins

Hostable and clinkr compose the same way — as values built into the `run` slot. No parallel definer surfaces.

```ts
// ── ns-only type ───────────────────────────────────────────────────
export interface NsContext {
	catalog: CatalogView;              // has(pkg), list() — the one thing only ns can answer
}

// ── The hostable opt-in's contract ─────────────────────────────────
/** Everything a real process would have gotten from the OS. cwd/env live here — not on
 *  NsContext — because virtualized OS facts are only needed when a command runs in-process;
 *  cataloged-only commands run as their own process, where process.cwd()/process.env are
 *  simply correct. */
export interface Host {
	cwd: string;
	env: Readonly<Record<string, string | undefined>>;
	stdout(text: string): void;        // "every host has somewhere for bytes" —
	stderr(text: string): void;        // the one channel claim that survived scrutiny
}

/** The mechanical bundle the clinkr dance hands your handler. Composes over Host —
 *  deliberately not inheritance: the layering stays visible (clinkr wraps a host; a host
 *  substitutes for the OS; ns is the catalog), and reaching for bundle.host.stdout instead
 *  of bundle.io is visibly a descent to the raw floor, not a coin-flip between siblings.
 *  This is NOT the first-party capability context — see "capability-kit" below. */
export interface ClinkrCommandBundle {
	host: Host;                        // the substrate: cwd, env, raw sinks
	io: ClinkrIo;                      // caps-aware presentation over host's sinks
	events: EventSink;                 // emit(event) — semantic channel (new clinkr module)
	interaction?: ClinkrInteraction;   // confirm + isInteractive; absent = non-interactive
	format?: ClinkrFormat;
}

// ── The only definer ─────────────────────────────────────────────────
export function defineCommand(spec: {
	name: string;
	summary: string;
	run: CommandRun;                   // plain or branded — composition lands here
}): NsCommand;

type RawRun = (argv: readonly string[], ns: NsContext) => Promise<number>;

// ── Combinators, not definers ────────────────────────────────────────
/** Brands the run as host-routed; the runner substitutes for the OS (facts + sinks). */
export function hostable(
	run: (argv: readonly string[], ns: NsContext, host: Host) => Promise<number>,
): CommandRun;

/** The clinkr dance as an adapter: schema parsing, help, format, events, interaction —
 *  compiled to a hostable run. Same combinator shape as `hostable`. */
export function clinkr<S extends z.ZodType>(spec: {
	schema: S;
	resultSchema: z.ZodType;
	completions?: (deps: NsCompletionDeps, partial: CompletionRequest) => Promise<Completion[]>;
	handler(ns: NsContext, bundle: ClinkrCommandBundle, request: z.output<S>): Promise<CommandExit>;
}): CommandRun;  // internally: hostable((argv, ns, host) => runClinkrDance(spec, argv, ns, host))
```

The catalog reads capability metadata off the brand. Future combinators (points-aware wrapper, traced wrapper, `spawned(...)` for wrapping foreign binaries into the catalog) are `CommandRun → CommandRun` or `spec → CommandRun` — `defineCommand` never changes again.

### Host API (two layers matching the two real consumers)

```ts
// Layer 1: catalog — read-only, cheap, no execution. Pi uses it to register slash commands;
// shell completion uses only this.
const catalog = await loadCatalog({ cwd, env });
catalog.list(); catalog.has(pkg); catalog.completions(argv, cursor);

// Layer 2: execution — owns the orchestration dance. This formalizes what Pi already
// calls today (spec.runCli(argv, runDeps)).
const exitCode = await runNsCli(argv, deps, { catalog });
// deps ≅ { cwd, env, io, events, interaction? } — isomorphic to a wire protocol,
// so out-of-process hosting stays one refactor away without any command noticing.
```

## Examples

### 1. Cataloged only — a normal program, five-line on-ramp

```ts
import { defineCommand } from "@nseng-ai/sdk";

export default defineCommand({
	name: "fixup",
	summary: "Apply the standard fixup dance to the current branch.",
	run: async (argv, ns) => {
		// A completely ordinary program: process.stdout, console.log, direct child_process.
		// Not in-process hostable; Pi runs it as a subprocess and captures bytes.
		console.log(`fixing up in ${ns.cwd}`);
		return 0;
	},
});
```

### 2. Hostable — same shape, io injected

```ts
import { defineCommand, hostable } from "@nseng-ai/sdk";

export default defineCommand({
	name: "fixup",
	summary: "Apply the standard fixup dance to the current branch.",
	run: hostable(async (argv, ns, io) => {
		io.stdout(`fixing up in ${ns.cwd}\n`);   // the one promise: bytes go through io
		return 0;
	}),
});
```

### 3. Clinkr — a realistic command (`flow changes`, reimagined)

Note what is *imported* versus what arrives on a context: model access, model policy, and git are libraries with their own DI seams. The contexts carry only location facts, the catalog, and channels.

```ts
import { defineCommand, clinkr, ok, failure, z } from "@nseng-ai/sdk";
import { createTextGenerator } from "@nseng-ai/model-kit";            // library, not ctx
import { resolveModelRef, OPERATION_IDS } from "../model-policy.ts";  // library, not ctx
import { createGitGateway } from "@nseng-ai/foundation/git";          // library, not ctx

export default defineCommand({
	name: "changes",
	summary: "Summarize outstanding worktree changes without committing.",
	run: clinkr({
		schema: z.object({}),
		resultSchema: z.string(),
		handler: async (ns, clinkr, request) => {
			clinkr.events.emit({ type: "progress/phase", label: "Inspecting worktree…" });

			const git = createGitGateway({ cwd: ns.cwd, env: ns.env });
			const snapshot = await loadPendingWorktreeSnapshot(git);
			if (snapshot.clean) return ok("Working tree is clean; no outstanding changes.");

			clinkr.events.emit({ type: "progress/phase", label: "Generating changes summary…" });
			const model = await resolveModelRef(ns, OPERATION_IDS.flowChanges);
			if (!model.ok) return failure("flow-command-failed", model.error);

			const generator = createTextGenerator({ env: ns.env });
			const summary = await generator.generateText({ modelRef: model.modelRef /* … */ });
			if (!summary.ok) return failure("flow-command-failed", summary.error);

			return ok(formatChangesReport(clinkr.io.caps, snapshot, summary.text));
		},
	}),
});
```

### 4. Optional integration via the catalog (replaces `hasExtension`)

```ts
handler: async (ns, clinkr, request) => {
	const slotsAware = ns.catalog.has("@nseng-ai/slots");
	// soft integration, no dependency edge; degrades cleanly when slots is absent
	…
};
```

### 5. Testing — no canonical-fake institution needed

`NsClinkrContext` is mostly clinkr types that already have test constructors (`resolveIo` overrides, injected-stdin interaction). The helper is ~15 lines, not an absorption layer.

```ts
import { testDeps } from "@nseng-ai/sdk/testing";

const { deps, recorded } = testDeps({ cwd: "/repo", env: { HOME: "/home/u" } });
const exit = await changesCommand.run(["--format", "json"], deps);
expect(recorded.events).toContainEqual({ type: "progress/phase", label: "Inspecting worktree…" });
expect(recorded.stdoutText()).toContain("Working tree is clean");
```

Libraries are faked at *their own* seams: `createGitGateway` scripted per the existing gateway pattern; the generator stubbed via its constructor options (which `PiTextGenerator` already has). This is where `typescript-fake-driven-testing` wanted those seams anyway — the old context let commands be lazy about their own injectability.

### 6. Wrapping an existing standalone tool (the distribution pitch, literalized)

```ts
export default defineCommand({
	name: "legacy-lint",
	summary: "Run the team's existing lint script through the ns catalog.",
	run: async (argv, ns) => {
		const result = await runProcess("scripts/lint.sh", argv, { cwd: ns.cwd });
		return result.code;
	},
});
```

## The three pillars map onto the three layers

The extension pitch from the README draft's "Why write this as an extension?" section survives intact — the architecture now literally *is* the pitch:

- **Distribution** = the catalog (free tier).
- **Standardization** = the clinkr combinator (opt-in).
- **Services** = libraries (`model-kit`, `GitGateway`, `brmem`) — imported, DI'd, never on a context.

The on-ramp story improves: "start raw in five lines; upgrade axes when you want their payoff" replaces "here is the sole dynamic contract."

## What this deletes from the current README draft

- The 13-primitive `NsInvocationContext` and the "sole dynamic contract" doctrine.
- The "What will never be on the context" never-list (nothing to police — the boundary is declared capability + a 3-field `NsContext`).
- The canonical fake as an institution (replaced by a small `testDeps` helper over clinkr's existing test constructors).
- `textGenerator`, `exec`, `homeDir`, `renderCapabilities`, `outputFormat`, `stdin`, `hasExtension` as context fields (evicted to libraries, clinkr, or the catalog per the accounting table above).
- The in-process isolation pretense (replaced by declared hostability + the subprocess floor).

## Open questions

1. **`clinkr` combinator naming.** Maximally honest (names the composition) but names the implementation, not the benefit. Alternative: `standard(...)`. Lean: keep `clinkr` — it is first-party infra, and naming it publicly is a deliberate commitment that clinkr's types become SDK-grade public API with matching compatibility obligations. That commitment should be stated, not implied.
2. **The clinkr events module.** The `EventSink` core vocabulary (`progress/*`, `notification`, `message`), extension-event namespacing, and the mandatory text fallback move from the README draft's open question #7 into clinkr's design space — clinkr defines the union and the terminal renderer; UI hosts supply their own sinks.
3. **Combinator discoverability.** One definer + combinators trades a little IDE discoverability for uniformity; docs carry more on-ramp weight than types. Mitigation: the README's first example is the clinkr form.
4. **`CommandExit` vs raw exit codes.** Tier 0 speaks `number` (process-honest); the clinkr combinator speaks typed `ok/failure/usageError` and compiles down. Exit-code conventions get enforced once at that seam.
5. **Migration.** Current first-party commands consume `NsExtensionApi`. Sketch: introduce `NsContext`/`NsClinkrContext` + combinators alongside; port commands package-by-package (flow first — its matrix progress is already event-shaped); retire `NsExtensionApi` when the last consumer moves. Not scoped here.
6. **Completion deps.** Keep the reduced-by-type completion context (`cwd`, `env`, `catalog` only — cannot prompt or emit); it was one of the current design's genuinely good ideas and survives unchanged.
