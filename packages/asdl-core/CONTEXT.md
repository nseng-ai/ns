# asdl-core

asdl-core is the shared substrate that every asdl plugin builds on. It is a single PyPI distribution that contains several logical subdomains (`clinkr`, `gh`, `git`, `gt`, plus top-level plugin/console/format utilities); each is documented here as its own H2 section with its own glossary and relationships.

## Clinkr

Clinkr makes asdl CLIs equally usable by humans and agents. Ordinary CLI subcommands built on clinkr expose the same programmatic contract:

- A stable JSON **machine envelope** per ordinary operation (`--format json`; operations that deliberately own a custom `--format` keep that flag instead).
- A three-value **OK | NEGATIVE | FAILURE** exit contract.
- A Pydantic-typed **request** shape (Click params are auto-derived from it).
- Separate **human renderer** and optional Markdown renderer paths for non-JSON use.

Why this shape: skills and agents invoke asdl CLIs programmatically and need predictable, parseable contracts that humans can also read.

### Language

**Operation** — The semantic command of a clinkr CLI: the single typed function that runs regardless of whether its result is dispatched through the machine envelope or the human renderer. Declared with `@clinkr_operation`; signature is `(ctx, request: <PydanticModel>) -> ClinkrExit[T]`. Registered with a `ClinkrGroup`, which wraps it as a `click.Command` at mount time.
_Avoid:_ "command" unqualified (ambiguous with `click.Command`), "subcommand," "handler," "endpoint," "action."

**ClinkrGroup** — A `click.Group` subclass that takes a sequence of Operations at construction and wraps each as a `click.Command` — injecting `--format` and `--json-schema` when those flags are not already owned by the request shape, and wiring human/machine dispatch. Owns the alias table. Operations and hidden-ness are construction-time choices; operation aliases normally come from decorator metadata at registration, with `add_alias` as the low-level manual alias escape hatch.
_Avoid:_ "registry" (implies dynamic add/remove), "router."

**ClinkrExit\[T\]** — The exit envelope every Operation produces. Generic over the data payload `T`; carries a `status` (`ExitStatus`). OK carries `data`; NEGATIVE carries a `message` and may carry `data` for machine callers; FAILURE carries `error_type` + `message` and never carries `data`. Constructed via the `ok` / `negative` / `failure` classmethods; constructor enforces the per-status field invariants. Also subclasses `Exception` so the dispatcher can both `return` and `raise`/catch it across the operation/dispatch boundary — but operation bodies do not construct `ClinkrExit.failure(...)` directly (see `ClinkrFailure`).
_Avoid:_ "result" unqualified (collides with the `result_type` Pydantic payload), "response," "envelope" unqualified (collides with the machine envelope).

**ExitStatus** — The three-value enum that tags a `ClinkrExit` and determines its exit code:

- **OK** (exit 0) — ran successfully; result is a positive present value.
- **NEGATIVE** (exit 1) — ran successfully; reached a definitive negative answer (not found, empty, false predicate, no current X).
- **FAILURE** (exit 2) — could not produce an answer (invalid input, gateway/infra failure, precondition violated).

_Litmus test for NEGATIVE vs FAILURE:_ if a positive result would be `ClinkrExit.ok(...)`, a negative result is `ClinkrExit.negative(...)`. If the command could not even ask the question, it is `ClinkrFailure` (which the dispatcher converts to `ClinkrExit.failure(...)`).
_Avoid:_ "error" for NEGATIVE; "warning" for either.

**Machine envelope** — The framework-owned JSON shape emitted on `--format=json`: `{"exit_code": int, ["error_type": str], ["message": str], ["data": <result_type JSON>]}`. Same shape across every Operation and every status; NEGATIVE results can include both `message` and `data`. Authors do not customize it; to change machine output, change the Operation's `result_type` Pydantic shape.
_Avoid:_ "machine output" (vague), "JSON envelope" (collides with the more general envelope concept).

**Human renderer** — A per-Operation callable that receives the OK-path `data` payload and writes to stdout for `--format=human` (default). Default is JSON-dump. Override via `@clinkr_operation(human_renderer=...)`; register `markdown_renderer=...` when `--format=markdown` / `md` should render differently, otherwise Markdown formats fall back to the human renderer. NEGATIVE / FAILURE bypass renderers: `message` goes to stderr (NEGATIVE) or stderr with an `error:` prefix (FAILURE).
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
4. Routes the returned `ClinkrExit[T]` to the Human renderer (default), the Markdown renderer when one is registered for `--format=markdown`/`md`, or the machine envelope (`--format=json`).

ExitStatus drives the process exit code (`OK=0`, `NEGATIVE=1`, `FAILURE=2`) and the stderr behavior (`NEGATIVE` writes `message` to stderr; `FAILURE` writes `error: <message>` to stderr; both bypass renderers). NEGATIVE `data`, when present, is visible only in the machine envelope. The Typed context is constructed lazily — `context_factory()` runs only when an Operation calls `load_typed_context`, so `--help` and `--json-schema` paths skip it entirely.

## Git

The Git subdomain is the shared boundary for repository and worktree facts. It keeps subprocess-backed git operations behind a gateway so asdl packages can reason about branches, refs, worktrees, dirty state, history, and snapshot contents through typed results and fakes.

### Language

**GitGateway** — The shared interface for git-backed repository and worktree operations.
_Avoid:_ "git helper," "subprocess wrapper," "git service."

**Bound repo** — The repository root captured by a `RealGitGateway` instance for repo-wide operations such as local branch inventory, object-database reads, worktree listing, and history queries.
_Avoid:_ current worktree, current directory, active checkout.

**Repository root** — The top-level working tree directory resolved from a caller-provided `cwd`.
_Avoid:_ git directory, git common dir, workspace root.

**Git common dir** — The main `.git` directory shared by a repository and its linked worktrees.
_Avoid:_ repository root, worktree path, slots root.

**Worktree** — A checkout path registered with git, either attached to a local branch, detached at a ref, or bare.
_Avoid:_ slot (slots may manage worktrees, but not every worktree is a slot), clone.

**WorktreeInfo** — The typed inventory record for one git worktree: path, attached branch if any, and bare-ness.
_Avoid:_ slot record, checkout record, worktree status.

**Branch** — A local `refs/heads/<name>` branch in the bound repo.
_Avoid:_ ref when the value may be a tag, OID, remote-tracking ref, or revision expression; Graphite stack node.

**Current branch** — The local branch currently checked out at a specific worktree path.
_Avoid:_ bound repo branch, active branch globally.

**Previous branch** — Git's reflog shorthand for the branch checked out before the current worktree's branch.
_Avoid:_ parent branch, base branch, Graphite ancestor.

**Trunk branch** — The local branch used as the repository's integration baseline, resolved from `origin/HEAD` and then local `main` / `master` fallbacks.
_Avoid:_ remote default branch, base ref, Graphite trunk.

**Ref** — A git object name or revision expression used to read tree contents, position detached HEAD, update a local ref, or describe a commit range endpoint.
_Avoid:_ branch when branch attachment is not required.

**Start point** — The ref used as the initial target when creating or force-moving a local branch.
_Avoid:_ parent, ancestor, base branch.

**DetachedHead** — The `NonIdealState` sentinel for a worktree whose HEAD is not attached to a branch.
_Avoid:_ missing branch, git failure, empty current branch.

**GitCommandFailure** — The `NonIdealState` failure arm for a git command that could not produce a requested fact.
_Avoid:_ negative result, subprocess exception, detached head.

**FileStatus** — The dirty-state summary of one worktree, split into staged, modified, and untracked bits from porcelain status.
_Avoid:_ diff, file list, cleanliness boolean.

**LocalBranchTip** — A local branch name paired with its HEAD committer timestamp.
_Avoid:_ current branch, last-touched file timestamp, remote branch tip.

**CommitSummary** — One commit returned from a range query, represented by SHA, author timestamp, and subject.
_Avoid:_ PR commit, patch id, changelog entry.

**Patch ID** — Git's stable content fingerprint for a commit diff, used to compare patch-equivalent commits across ranges.
_Avoid:_ SHA, commit identity, diff text.

**RestructuredFile** — A rename or copy pair surfaced by git's similarity-based name-status detection.
_Avoid:_ changed file, moved path, deleted file.

### Relationships

#### Bound repo vs. worktree path

Repo-wide facts use the **Bound repo**: branch existence, local branch lists, branch tip timestamps, worktree inventory, ref/tree reads, branch HEAD facts, history ranges, patch IDs, and ancestor checks.

Worktree-local facts take an explicit `cwd`: repository-root resolution, git-common-dir resolution, current/previous branch, dirty state, checkout, detach, fetch, pull, and ref update. This is the key split: `branch_exists("feat/x")` asks whether the bound repo has `refs/heads/feat/x`; `get_current_branch(cwd)` asks what the worktree at `cwd` currently has checked out.

#### Branch, ref, and start point

Use **Branch** only for local `refs/heads/*` names and branch-attached worktrees. Use **Ref** for object-database reads, detached worktrees, branch-head lookup inputs, local-ref updates, and range endpoints. Use **Start point** only for the ref that seeds `create_branch`; it does not imply Graphite parentage, merge-base ancestry, or PR base semantics.

#### Non-ideal states

**DetachedHead** and **GitCommandFailure** are Git's `NonIdealState` arms. CLI operations can pass them through `Ensure.ideal_state` when they need a hard failure, but planning code may also pattern-match them when detached HEAD is a valid domain branch of the decision tree.

#### Snapshot and history reads

Ref/tree readers return empty tuples or `False` for absent paths at known refs, and **GitCommandFailure** for unknown refs or unexpected command failures. History readers (`log_range`, `patch_ids_for_range`, `count_commits_in_range`) return typed summaries or a failure arm rather than raising at the gateway boundary.

#### Worktrees and slots

The Git subdomain knows only **WorktreeInfo**. The slots package may interpret worktree paths as managed slots and turn them into slot records, but that is slots vocabulary layered above Git, not a Git concern.

### Example dialogue

> **Dev:** "Can I use `branch_exists` to find the branch I'm currently on?"
> **Domain expert:** "No. `branch_exists` checks the **Bound repo** for a local **Branch**. To ask what this checkout has attached, call `get_current_branch(cwd)` and handle **DetachedHead**."

### Flagged ambiguities

- **Branch / ref / start_point** — resolved locally: a **Branch** is a local `refs/heads/*` name, a **Ref** is any git object name or revision expression used for object/history operations, and a **Start point** is the ref used only to seed branch creation; Graphite parent/ancestor language belongs in the future `## Gt` section.

## Gt

The Gt subdomain is the shared boundary for Graphite stack metadata and stack operations. It keeps `gt` CLI calls behind a gateway so asdl packages can reason about Graphite parentage, stack navigation, restacking, and sync behavior without shelling out directly.

### Language

**StackInfo** — A focused snapshot of the Graphite stack around the branch checked out at a `cwd`; it is not a complete Graphite branch graph.
_Avoid:_ stack graph, branch tree, full stack inventory.

**Downstack branch** — The immediate Graphite parent of the current branch, toward trunk.
_Avoid:_ previous branch, base branch, Git parent.

**Upstack branch** — An immediate Graphite child of the current branch, away from trunk.
_Avoid:_ next branch, descendant, child worktree.

**Upstack descendants** — The recursive Graphite children below a branch, ordered along the visible stack walk.
_Avoid:_ children, dependents, branch tree.
