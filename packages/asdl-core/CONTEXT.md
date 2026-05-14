# asdl-core

asdl-core is the shared substrate that every asdl plugin builds on. It is a single PyPI distribution that contains several logical subdomains (`clinkr`, `gh`, `git`, `gt`, plus top-level plugin/console/format utilities); each is documented here as its own H2 section with its own glossary and relationships.

## Clinkr

Clinkr makes asdl CLIs equally usable by humans and agents. Every CLI subcommand built on clinkr exposes the same programmatic contract:

- A stable JSON **machine envelope** per operation (`--format json`).
- A three-value **OK | NEGATIVE | FAILURE** exit contract.
- A Pydantic-typed **request** shape (Click params are auto-derived from it).
- A separate **human rendering** path for interactive use.

Why this shape: skills and agents invoke asdl CLIs programmatically and need predictable, parseable contracts that humans can also read.

### Language

**Operation** — The semantic command of a clinkr CLI: the single typed function that runs regardless of whether its result is dispatched through the machine envelope or the human renderer. Declared with `@clinkr_operation`; signature is `(ctx, request: <PydanticModel>) -> ClinkrExit[T]`. Registered with a `ClinkrGroup`, which wraps it as a `click.Command` at mount time.
_Avoid:_ "command" unqualified (ambiguous with `click.Command`), "subcommand," "handler," "endpoint," "action."

**ClinkrGroup** — A `click.Group` subclass that takes a sequence of Operations at construction and wraps each as a `click.Command` — injecting `--format` and `--json-schema` and wiring human/machine dispatch. Owns the alias table. Immutable after `__init__`: operations, aliases, and hidden-ness are fixed at construction.
_Avoid:_ "registry" (implies dynamic add/remove), "router."

**ClinkrExit\[T\]** — The exit envelope every Operation produces. Generic over the data payload `T`; carries a `status` (`ExitStatus`), and either `data` (OK / NEGATIVE) or `error_type` + `message` (NEGATIVE / FAILURE). Constructed via the `ok` / `negative` / `failure` classmethods; constructor enforces the per-status field invariants. Also subclasses `Exception` so the dispatcher can both `return` and `raise`/catch it across the operation/dispatch boundary — but operation bodies do not construct `ClinkrExit.failure(...)` directly (see `ClinkrFailure`).
_Avoid:_ "result" unqualified (collides with the `result_type` Pydantic payload), "response," "envelope" unqualified (collides with the machine envelope).

**ExitStatus** — The three-value enum that tags a `ClinkrExit` and determines its exit code:

- **OK** (exit 0) — ran successfully; result is a positive present value.
- **NEGATIVE** (exit 1) — ran successfully; reached a definitive negative answer (not found, empty, false predicate, no current X).
- **FAILURE** (exit 2) — could not produce an answer (invalid input, gateway/infra failure, precondition violated).

_Litmus test for NEGATIVE vs FAILURE:_ if a positive result would be `ClinkrExit.ok(...)`, a negative result is `ClinkrExit.negative(...)`. If the command could not even ask the question, it is `ClinkrFailure` (which the dispatcher converts to `ClinkrExit.failure(...)`).
_Avoid:_ "error" for NEGATIVE; "warning" for either.

**Machine envelope** — The framework-owned JSON shape emitted on `--format=json`: `{"exit_code": int, ["error_type": str], ["message": str], ["data": <result_type JSON>]}`. Same shape across every Operation and every status. Authors do not customize it; to change machine output, change the Operation's `result_type` Pydantic shape.
_Avoid:_ "machine output" (vague), "JSON envelope" (collides with the more general envelope concept).

**Human renderer** — A per-Operation callable that receives the OK-path `data` payload and writes to stdout. Runs on `--format=human` (default) and `--format=markdown`/`md` — the renderer branches on format if it cares. Default is JSON-dump. Override via `@clinkr_operation(human_renderer=...)`. NEGATIVE / FAILURE bypass the renderer: `message` goes to stderr (NEGATIVE) or stderr with an `error:` prefix (FAILURE).
_Avoid:_ "formatter" (collides with `click.HelpFormatter`), "view," "presenter."

**ClinkrFailure** — The exception raised inside an Operation body to signal an unrecoverable failure. Carries `error_type` and `message`; the dispatcher catches it at the CLI boundary and emits `ClinkrExit.failure(...)` (exit code 2). Operation bodies and CLI-layer helpers do not construct `ClinkrExit.failure(...)` directly. _See also:_ `Ensure` (sugar for guards), `NonIdealState` (sugar for sum-type narrowing).

**Ensure** — Namespace of precondition helpers (`Ensure.true`, `Ensure.truthy`, `Ensure.not_none`, `Ensure.inst`, `Ensure.fail`, `Ensure.ideal_state`). Each raises `ClinkrFailure` on violation. Type-narrowing variants (`not_none`, `inst`, `ideal_state`) return the narrowed value so the caller can rebind without a follow-up `assert`. `Ensure.ideal_state` recognizes the `NonIdealState` shape and lifts the failure arm's own `message` and derived `error_type` into the raised `ClinkrFailure`.

**NonIdealState** — Structural Protocol (`@runtime_checkable`) marking the failure arm of a domain sum type as translatable to `ClinkrFailure`. Conformance: a `message: str` field or property. Optional `error_type: str` attribute as an override; otherwise the CLI tag is derived from the class name (`DetachedHead` → `"detached_head"`). Recognized by `Ensure.ideal_state`. Lets domain helpers return `Result | DomainError` sum types whose error arms own canonical wording, without dragging `ClinkrExit` into domain code.
_Avoid:_ "domain error" alone (the Protocol is specifically about translation, not just domain failure).

**ClinkrContextObject** — Frozen wrapper installed at `click.Context.obj` for one invocation. Carries a `context_factory` (lazily produces the app-specific typed context) and a `machine_mode` bit set on `--format=json`. Read by `load_typed_context` and `is_machine_mode`. CLI entry points and tests install it via `build_clinkr_context_object(...)`; the dispatcher mutates it via `set_machine_mode` by replacing `root.obj` wholesale (frozen-then-replace, never field-mutated).
_Note on machine mode:_ Operations call `is_machine_mode(ctx)` to refuse human-only behaviors (interactive prompts, stdin reads from a terminal) without inspecting the Click group hierarchy.

**Typed context** — The app-specific object a plugin defines and Operations consume — typically holds gateways, gates, and other per-invocation services. Retrieved with `load_typed_context(ctx, MyContextType)`, which calls the installed `context_factory` lazily so `--help` paths skip construction entirely. Each plugin defines its own type; clinkr does not prescribe a shape.
_Avoid:_ "app context" (used inconsistently elsewhere), "request context" (collides with the Pydantic request type).

**Request type** — A Pydantic `BaseModel` declared as the `request` parameter on an Operation; _this model is the CLI surface_. `ClinkrGroup` derives Click Arguments and Options from its fields at mount time:

- field without a default → `click.Argument` (positional, required)
- field with a default → `click.Option` (`--name`, default = field default)
- `bool` field with default `False` → `is_flag=True`
- primitive type map: `str`, `int`, `float`, `bool`, `pathlib.Path`
- escape hatch: `Annotated[T, click.Argument(...) | click.Option(...)]` on a field fully overrides the inferred decorator

Authors edit the request model, not stacks of `@click.option` decorators. To add a parameter, add a field; to change a flag, change its default; to rename, rename the field.
_Avoid:_ "params" (collides with `click.Parameter`), "input," "args" (ambiguous between `sys.argv` and Click `Argument`).

**Result type** — The Pydantic-compatible type parameterizing `ClinkrExit[T]` on the OK path; declared via the return annotation `ClinkrExit[MyResult]`. The same payload appears as the machine envelope's `data` field and is what the Human renderer receives. To change machine output, change the result type — never customize the envelope.
_Avoid:_ "response," "output," "payload" alone (used informally for the envelope-vs-body distinction); "data" alone (collides with the machine envelope field name).

### Relationships

#### Failure triad: which guard do I use?

Operations signal failure via the **failure triad** (`ClinkrFailure`, `Ensure`, `NonIdealState`). Pick the most specific tool:

- A domain helper returned a sum type whose failure arm carries a `message` (i.e. conforms to `NonIdealState`) → `Ensure.ideal_state(result)`; the failure arm's own wording and derived `error_type` flow through.
- A boolean predicate, `None`-vs-`T` check, or `isinstance` narrowing → `Ensure.true` / `Ensure.truthy` / `Ensure.not_none` / `Ensure.inst`.
- Inside a custom `match` or `except` block where wording is caller-specific → `raise ClinkrFailure(error_type=..., message=...)` (use `from exc` to preserve the cause).

Operation bodies and CLI-layer helpers **never** construct `ClinkrExit.failure(...)` directly — the dispatcher does that, by catching `ClinkrFailure` at the CLI boundary.

#### Schema flow

The Request type is the input contract; the Result type is the output contract.

- Click Arguments and Options are _derived from_ the Request type's fields — authors do not write `@click.option` stacks.
- The OK-path `data` carried by `ClinkrExit[T]` and the value passed to the Human renderer are _the same Result type instance_, not parallel shapes.

To change the CLI surface, edit the Request type. To change machine output, edit the Result type. The machine envelope shape itself is framework-owned and not author-customizable.

#### Dispatch & context

ClinkrGroup wraps each Operation as a `click.Command` at construction time, then at invocation:

1. Parses argv into the Request type.
2. Installs a `ClinkrContextObject` carrying the plugin's `context_factory`; sets `machine_mode` when `--format=json` is passed.
3. Calls the Operation as `op(ctx, request)`.
4. Routes the returned `ClinkrExit[T]` to either the Human renderer (default, `--format=human`/`markdown`) or the machine envelope (`--format=json`).

ExitStatus drives the process exit code (`OK=0`, `NEGATIVE=1`, `FAILURE=2`) and the stderr behavior (`NEGATIVE` writes `message` to stderr; `FAILURE` writes `error: <message>` to stderr; both bypass the Human renderer). The Typed context is constructed lazily — `context_factory()` runs only when an Operation calls `load_typed_context`, so `--help` and `--json-schema` paths skip it entirely.
