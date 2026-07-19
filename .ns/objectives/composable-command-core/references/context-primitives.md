# Invocation-context primitives: value propositions

> Evidence record for the `composable-command-core` Objective: the per-primitive value analysis of the retired invocation-context design (`NsInvocationContext`, from the deleted `sdk-invocation-context` Objective). For every primitive on that contract, this records *why it must live on the context* (rather than ambient process state or per-extension DIY) plus a grounded example. Weak justifications are flagged honestly — they mark where the contract is closest to convenience rather than necessity.

Every justification reduces to one of three roots:

1. **Per-invocation identity** — the value differs per invocation and process globals cannot represent that (cwd, env, streams, stdin, emit).
2. **Host-owned policy** — the host owns configuration the command must not reimplement (exec environment, textGenerator, confirm, renderCapabilities).
3. **Testability without process globals** — the fake can inject/record it in-memory (all of them).

## Invocation facts

### `cwd`

**Value:** The directory an invocation runs against is not the process's cwd. `process.cwd()` is process-global and mutable; a Pi host runs commands in-process against a slot worktree while the process sits elsewhere, and two concurrent invocations can target different worktrees. Without this fact, hosted commands silently operate on the wrong repo.

**Example:** `ns flow submit` invoked from two Pi sessions in different worktrees — each resolves its repo from `ctx.cwd`; neither touches `process.cwd()`.

### `env`

**Value:** What configuration a command sees is per-invocation and host-curated. Reading `process.env` means tests must mutate globals, and hosts cannot withhold host-private variables (the host's own credentials, model selection).

**Example:** a test passes `env: { HOME: "/home/u" }` to the fake — no `process.env` save/restore dance, no pollution between test cases.

### `homeDir`

**Value:** One host-resolved answer to "where is home," redirectable. Commands calling `os.homedir()` cannot be sandboxed; a host or test redirects home in one place.

**Example:** the plan store resolves `~/.local/state/ns/...` from `ctx.homeDir`; a scenario test points it at a temp dir without touching the real filesystem.

> ⚠️ Weakest fact — it saves one function call. Its real justification is sandboxing/testing, not convenience.

### `outputFormat`

**Value:** Commands streaming durable output before returning must know if a machine is reading. Decorative streaming in JSON mode corrupts the payload a script is parsing.

**Example:** `ns init` suppresses its narrative streaming when `outputFormat` is JSON so `ns init --format json | jq` works.

### `renderCapabilities`

**Value:** Terminal richness is a host fact, not something commands probe. TTY-sniffing (`process.stdout.isTTY`, width probing) is exactly the ambient reach the design forbids, and is wrong in hosted invocations anyway.

**Example:** a table renderer narrows columns from `renderCapabilities` width and drops to ASCII when unicode is unsupported — same code in a dumb pipe, a terminal, and Pi.

### `hasExtension`

**Value:** Soft integration between extensions without a hard dependency edge. The alternative is `import`-and-catch or filesystem sniffing — both wrong per-invocation, since the effective catalog is invocation-scoped.

**Example:** a flow command enables slots-aware branch placement only when `ctx.hasExtension("@nseng-ai/slots")` — no dependency edge, degrades cleanly when slots is not installed.

## Capabilities

### `exec`

**Value:** Child processes with correct defaults and a curated environment, scriptable in tests. DIY `child_process` gets the cwd wrong in hosted invocations and leaks context-only env (host credentials, model vars) into children; and testing it means spawning real processes.

**Example:** a command runs `ctx.exec("git", ["status", "--porcelain"])` — defaults to the invocation's worktree; the test scripts the result via `execScript` and runs in-memory.

### `textGenerator`

**Value:** Model access where the host owns provider, credentials, and profile; the command owns only prompts, validation, and repair policy. A standalone tool writes API-key plumbing, provider selection, and retry policy per tool; here that is host configuration, and the fake returns canned text.

**Example:** branch-context derives a plan slug by prompting `ctx.textGenerator` — no key handling, and the host's model policy (cheap routing, profiles) applies uniformly.

## Channels

### `emit`

**Value:** Semantic output survives; text does not. Structured events let a rich host render widgets and a plain host degrade to the text fallback — and make transcripts machine-readable. The DIY alternative is stderr prints no host can upgrade.

**Example:** `ns flow land` emits `progress/*` phases — Pi renders the live matrix widget; the CLI prints one line per phase; a transcript host records structured phases.

### `stdout` / `stderr`

**Value:** A byte sink whose identity is per-invocation. Writing `process.stdout` from a hosted command corrupts the harness TUI or interleaves concurrent output; the context sink is what lets the CLI give you real pipes and Pi give you a transcript, from identical command code. Deliberately not stream objects — the type is the minimum seam for "where this invocation's bytes go."

**Example:** `ns pr list --format json | jq` works in the CLI; the same command's bytes land in the Pi session transcript.

### `stdin()`

**Value:** Pipe composability with a defined non-interactive answer. Reading `process.stdin` hangs when nothing is piped and is meaningless in hosted invocations; the context read is one-shot and resolves `""` where no payload exists.

**Example:** `git diff | ns review explain` — the command reads the diff payload; in Pi the host supplies the payload (or empty) explicitly.

### `onOutput`

**Value:** Transient live output for UI hosts without polluting durable output. Exec passthrough (a `gt submit` tail) wants to be *seen live* but not *kept*.

**Example:** Pi streams Graphite's output into the live widget during `submit`; the durable transcript keeps only the semantic events and final result.

> ⚠️ Weakest channel — plausibly just an event type on `emit` (README open question #7).

### `confirm`

**Value:** Interaction is host-owned, and its absence is a fact commands must handle. DIY terminal prompting breaks every non-terminal host and hangs CI; typing absence forces the non-interactive path at compile time.

**Example:** `ns flow land` asks "delete merged branch?" — terminal prompt in the CLI, dialog in Pi; in a non-interactive host `confirm` is absent and the command requires `--yes` or skips.
