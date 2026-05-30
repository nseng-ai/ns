# asdl-core

asdl-core is the shared substrate that every asdl plugin builds on. It is a single PyPI distribution that contains several logical subdomains (`clinkr`, `gh`, `git`, `gt`, `sessions`, plus top-level plugin/console/format utilities); each is documented here as its own H2 section with its own glossary and relationships.

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

**LocalBranchTipRef** — A local branch name paired with its HEAD object ID for commit-graph analysis.
_Avoid:_ LocalBranchTip, current branch, remote branch ref.

**CommitGraphNode** — One commit object ID and its parent object IDs from a commit graph walk.
_Avoid:_ CommitSummary, patch id, branch node.

**BranchCommitGraph** — The branch tips and commit nodes reachable from selected local branches after excluding a base branch.
_Avoid:_ Graphite stack, full repository graph, branch tree.

**PathTouch** — The latest commit object ID and committed time touching one path within a ref or revision range.
_Avoid:_ file timestamp, branch HEAD time, path existence.

**PathChangeTouch** — One commit and the changed paths under a pathspec, newest-first for path-touch attribution.
_Avoid:_ changed file list, diff summary, PathTouch.

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

Ref/tree readers return empty tuples or `False` for absent paths at known refs, and **GitCommandFailure** for unknown refs or unexpected command failures. History readers (`log_range`, `patch_ids_for_range`, `count_commits_in_range`) return typed summaries or a failure arm rather than raising at the gateway boundary. Path-touch history readers return the latest touching commit/time for a ref+path, or `None` when no such touch is available.

**BranchCommitGraph** is a local-branch history projection, not Graphite metadata: it starts from selected local **LocalBranchTipRef** values, excludes commits reachable from a base branch, and returns **CommitGraphNode** records. **PathTouch** and **PathChangeTouch** are path-attribution facts over refs or revision ranges; callers use them to decide which Objective, snapshot, or path record a branch slice touched without parsing prose.

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

**GtGateway** — The interface for Graphite stack metadata, trunk-scoped branch graph reads, and Graphite stack operations.
_Avoid:_ git gateway, branch gateway, generic branch graph service.

**Graphite stack** — Graphite's tracked sequence of branches or PRs rooted at trunk, where each entry builds off its Graphite parent.
_Avoid:_ Git history, branch tree, arbitrary DAG.

**StackInfo** — A successful focused snapshot of the Graphite stack around the branch checked out at a `cwd`; it always names the current Graphite branch and is not a complete branch graph.
_Avoid:_ stack graph, branch tree, full stack inventory, nullable stack snapshot.

**GtBranchGraph** — A successful repo-level Graphite graph rooted at the configured Graphite trunk. It contains the trunk row and Graphite metadata rows reachable through stored child edges, not every row in the metadata database and not every possible configured trunk.
_Avoid:_ `StackInfo`, all branches, all metadata rows, Git commit graph.

**GtTrackedBranch** — One branch row in a `GtBranchGraph`, carrying the branch name, stored Graphite parent, stored children, raw Graphite validation marker, and derived needs-restack flag.
_Avoid:_ Git branch tip, PR summary, commit node.

**Current stack branch** — The Graphite branch marked current in a successful stack snapshot for a `cwd`.
_Avoid:_ unknown current, implicit trunk, detached head.

**Graphite trunk** — The branch Graphite says stacks merge into, returned by `gt trunk` for command-style reads and stored as `trunk` in Graphite repo config for repo-level graph reads.
_Avoid:_ Git default branch, remote HEAD, base branch.

**Graphite metadata store** — Graphite-owned SQLite file at `<git-common-dir>/.graphite_metadata.db`, schema-versioned by Graphite's Kysely migrations. asdl reads it read-only for stack discovery.
_Avoid:_ repo config, Git object database, asdl cache.

**Stack slice query** — The canonical four-column metadata-store query (`branch_name`, `parent_branch_name`, `children`, `validation_result`) that defines asdl's required stack schema contract.
_Avoid:_ full Graphite schema, `SELECT *`, migration contract.

**Restack revision pair** — Optional metadata-store columns (`parent_branch_revision`, `parent_head_revision`) that let `GtBranchGraph` mark a branch as needing restack when both non-empty values differ.
_Avoid:_ validation result, human `gt ls` parsing, required schema slice.

**Graphite repo config** — Graphite-owned JSON file at `<git-common-dir>/.graphite_repo_config` that stores repository-level Graphite settings such as trunk name. It is distinct from the Graphite metadata store.
_Avoid:_ metadata store, stack slice, Git config.

**Graphite parent** — The immediate downstack branch returned by `gt parent` for the current branch.
_Avoid:_ previous branch, base branch, Git parent.

**Graphite children** — The immediate upstack branches returned by `gt children` for the current branch.
_Avoid:_ descendants, next branch, child worktree.

**Graphite ancestors** — The downstack branches below the current branch in a stack, toward trunk.
_Avoid:_ parents, previous branches, Git ancestors.

**Graphite descendants** — The upstack branches above the current branch in a stack, away from trunk.
_Avoid:_ children, next branches, dependents.

**Downstack** — The direction toward trunk through Graphite ancestors.
_Avoid:_ previous, before, below.

**Upstack** — The direction away from trunk through Graphite descendants.
_Avoid:_ next, after, above.

**NoParent** — A successful Graphite answer indicating that the current branch is tracked but has no Graphite parent.
_Avoid:_ untracked branch, Graphite failure, trunk branch.

**UntrackedBranch** — A non-ideal Graphite state indicating that the current Git branch has no Graphite stack metadata.
_Avoid:_ no parent, detached head, missing branch.

**GtBranchInfo** — Raw Graphite branch diagnostics returned by `gt branch info` for the current branch.
_Avoid:_ stack snapshot, parsed branch metadata, PR details.

**Restack upstack** — Rebase a branch and its upstack descendants according to Graphite parentage.
_Avoid:_ git rebase, restack stack, sync.

**Graphite sync** — Synchronize Graphite metadata with repository or remote state, optionally restacking affected branches.
_Avoid:_ pull, fetch, metadata refresh.

**Stack warning** — A non-fatal caveat attached to a successful `StackInfo` when metadata is forked, partially inconsistent, or missing an expected trunk marker.
_Avoid:_ failure, validation error, lint.

**GtCommandFailure** — A non-ideal Graphite state indicating that Graphite's CLI or metadata store could not answer the requested stack question.
_Avoid:_ negative result, no parent, untracked branch.

### Relationships

#### Graphite's documented stack directions

Graphite defines a **Graphite stack** as a sequence of PRs, each building off its parent, rooted at **Graphite trunk**. **Downstack** means ancestors below the current branch toward trunk; **upstack** means descendants above the current branch away from trunk. The gateway uses branch names because local `gt` commands operate on branches, but the direction vocabulary follows Graphite's PR-stack docs.

#### Parent, children, ancestors, descendants

**Graphite parent** and **Graphite children** are immediate relationships; `parent_of` and `children_of` return them through `gt parent` and `gt children`, while `StackInfo` and `GtBranchGraph` read them from the **Graphite metadata store**. **Graphite ancestors** and **Graphite descendants** are recursive stack directions derived from the **Stack slice query**. A **Restack revision pair** mismatch is a row-level health annotation, not a replacement for Graphite parentage or Graphite validation. `StackInfo.ancestors` is trunk-first, includes **Graphite trunk** when trunk appears in the current stack walk, and excludes the current branch. `StackInfo.descendants` excludes the current branch and follows the first-child stack walk away from trunk. `StackInfo.children` is immediate-only even though children are also upstack; do not say children when the recursive relationship is descendants.

#### Trunk-scoped branch graph

`GtBranchGraph` starts from the **Graphite trunk** named in **Graphite repo config** and follows stored **Graphite children** recursively. The graph is complete only for that reachable metadata component: stale rows for old trunks, orphan rows with bad parents, and other disconnected metadata rows are excluded. This is Graphite branch metadata, not Git commit history; use Git graph types for commit reachability questions.

#### Graphite trunk vs Git trunk branch

**Graphite trunk** should usually match Git's **Trunk branch**, but the source of truth differs: Graphite trunk comes from Graphite (`gt trunk` or Graphite repo config), while Git's Trunk branch is resolved from `origin/HEAD` and local `main` / `master` fallbacks. If they differ, treat it as Graphite configuration drift or an intentional non-default Graphite setup, not as two synonyms for one fact.

#### GtGateway vs GitGateway

Use **GitGateway** for ordinary repository and worktree facts: current branch, refs, worktrees, dirty state, history, and branch existence. Use **GtGateway** only for explicitly Graphite behavior: parent/children relationships, stack snapshots, trunk-scoped Graphite branch graphs, Graphite trunk, restacking, syncing Graphite metadata, and raw Graphite branch diagnostics. `stack()` and `branch_graph()` get their structure from the **Graphite metadata store** via the **Stack slice query**; `branch_graph()` also reads **Graphite repo config** for the configured trunk and may use the optional **Restack revision pair** for row annotations. The command-oriented Graphite operations continue to use `gt` CLI commands.

#### Metadata-store contract and fallback policy

`stack()` is current-branch-centered: it reads Graphite metadata for the branch checked out at `cwd`, returns a successful **StackInfo** when that branch is tracked, and can return **UntrackedBranch** when the current branch is absent from metadata. `branch_graph()` is repo/trunk-centered: it reads **Graphite repo config** for the configured **Graphite trunk**, walks that reachable metadata component, and does not require the current checkout's branch to be Graphite-tracked.

The required Graphite schema surface is the named-column **Stack slice query**, not `SELECT *` and not the whole Graphite migration contract. The optional **Restack revision pair** is display/health metadata only. If the metadata store, repo config, or supported schema is unavailable, the gateway returns a structured **GtCommandFailure** such as a metadata schema mismatch. There is intentionally no `gt ls` human-output parser fallback.

## Gh

The Gh subdomain is the shared boundary for GitHub pull-request workflows. It keeps GitHub CLI/API calls behind a PR-centered gateway so asdl packages can reason about PR lifecycle, PR feedback, review threads, inline comments, discussion comments, reactions, and guarded merge behavior without adopting GitHub's lower-level API naming leaks.

### Language

**PRGateway** — The single canonical gateway boundary for current GitHub pull-request workflows, including PR lifecycle facts, PR feedback reads, review-thread mutations, discussion-comment mutations, reactions, and guarded merge operations.
_Avoid:_ IssueGateway, PRConversationGateway, GitHub gateway, gh helper, PR service.

**PRDiscussionComment** — A top-level comment in the PR discussion timeline, not attached to a diff line or review thread.
_Avoid:_ IssueComment, discussion comment unqualified, issue comment, PR comment.

**PRReview** — A submitted PR review event, whether fetched later or returned immediately after creation, that carries author, review state, optional body, and submission time; it is not an inline thread and not a top-level discussion comment.
_Avoid:_ PRReviewSubmission, review comment, review thread, discussion comment, approval alone.

**PRReviewState** — GitHub's full review-state vocabulary for PR reviews: `PENDING`, `COMMENTED`, `APPROVED`, `CHANGES_REQUESTED`, and `DISMISSED`.
_Avoid:_ PR state, actionable review state, approval status.

**Actionable PR review** — A submitted review surfaced as feedback because its state is `COMMENTED`, `APPROVED`, or `CHANGES_REQUESTED`.
_Avoid:_ review, non-empty review, active review, PRReviewState.

**PRState** — The actual lifecycle state of a pull request: `OPEN`, `CLOSED`, or `MERGED`.
_Avoid:_ PRReviewState, status, state filter, lowercase state.

**PRStateFilter** — A query filter for PR listing/search: `open`, `closed`, `merged`, or `all`, where `all` means no lifecycle-state restriction.
_Avoid:_ PRState, lifecycle state, review state, status filter.

**PRSummary** — The single PR metadata record used by current workflows, carrying identity, title/body/url, head/base refs, lifecycle state, and head commit OID.
_Avoid:_ PRDetails, PR metadata, PR snapshot, merge details.

**PR changed file** — One file entry in a PR diff, including path, GitHub file status, and optional patch text.
_Avoid:_ changed file unqualified, diff, file status, patch.

**PRLookupMiss** — A successful negative PR lookup indicating that no PR matches the requested branch or lookup key.
_Avoid:_ PRLookupError, not found error, failure, gh error.

**PRGatewayFailure** — A failed PR gateway operation caused by GitHub, `gh`, authentication, network, rate limiting, or an unexpected API response.
_Avoid:_ PRLookupError, PRCommandError, lookup miss, negative result.

**PRReviewThreadState** — The post-mutation resolved state of a PR review thread returned after resolving or unresolving it.
_Avoid:_ ResolveReviewThreadResult, UnresolveReviewThreadResult, was-already result, no-op result.

**PRMergeOutcome** — The accepted result of a guarded PR merge request, recording the PR number and whether auto-merge was enabled instead of merging immediately.
_Avoid:_ PRMergeResult, command output, merge status, stdout/stderr result.

**PRReviewThread** — A resolvable inline conversation anchored to a PR diff location.
_Avoid:_ review comment, inline comment, conversation unqualified, discussion comment.

**PRReviewComment** — One message inside a PR review thread, including the first inline comment and any replies.
_Avoid:_ review thread, discussion comment, issue comment, inline thread.

**PR diff anchor** — The file path plus optional line range that locates inline feedback on a PR diff.
_Avoid:_ line, range, position, location unqualified.

**PR inline comment draft** — One proposed inline message to submit as part of a PR review; it has a PR diff anchor and body but no GitHub comment id, author, timestamp, or thread state yet.
_Avoid:_ PRReviewComment, finding, comment input, draft review comment.

### Relationships

#### PR-centered boundary

Gh vocabulary is PR-centered and uses one **PRGateway** for both lifecycle and conversation operations. Even when GitHub implements part of the surface through issue APIs, asdl names the domain concept after the pull-request workflow it serves, not the backing endpoint.

#### PR message surfaces

A **PRDiscussionComment** is top-level PR discussion. Inline code feedback belongs to **PRReviewComment** inside a **PRReviewThread**. A submitted review body belongs to **PRReview**, which is a review event with a **PRReviewState** and may have an empty body. An **Actionable PR review** is the subset normally surfaced as feedback (`COMMENTED`, `APPROVED`, or `CHANGES_REQUESTED`); `PENDING` and `DISMISSED` remain valid **PRReviewState** values but are not feedback by default. Do not use "comment" unqualified when the surface matters.

**PRState** and **PRStateFilter** are different surfaces, not casing variants of one concept: **PRState** is GitHub output about one PR's lifecycle, while **PRStateFilter** is an input accepted by PR list/search operations. `all` is a filter value, never a lifecycle state.

A **PRLookupMiss** means the PR lookup ran and found no matching PR. A **PRGatewayFailure** means the gateway could not answer or mutate reliably. CLI callers should translate **PRLookupMiss** to a negative/empty domain result when that is expected, and **PRGatewayFailure** to a failure path.

Resolving or unresolving a **PRReviewThread** returns **PRReviewThreadState**, which reports the trusted postcondition from GitHub (`is_resolved=True` after resolve, `False` after unresolve). It does not claim whether the mutation was a no-op; callers that need pre-state must read the thread before mutating.

A successful guarded merge returns **PRMergeOutcome**. Raw stdout/stderr from `gh pr merge` are diagnostics, not success-domain fields; preserve them only on **PRGatewayFailure** or debug paths.

A **PRReviewThread** owns the **PR diff anchor** and thread state: path, line range, resolved/unresolved, and outdated/fresh. A **PRReviewComment** owns message facts: body, author, timestamp, and comment id. Comment records may repeat path/line for API convenience, but semantically the anchor belongs to the thread. In the current data shape, `line` is the end line (or the only line for a single-line anchor), `start_line` is present only for multi-line anchors, and a missing line means file-level or outdated feedback.

A **PR inline comment draft** is pre-submission data. After submission through a **PRReview**, GitHub may surface it as a **PRReviewComment** inside a **PRReviewThread**; do not use the persisted comment term for the draft.

**PR changed files** are the source for deciding whether a **PR diff anchor** is commentable. Missing patch text means inline-commentability may be limited for that file; it is not a gateway failure by itself.

## Top-level utilities

The top-level `asdl_core` modules are shared presentation and plugin glue for asdl packages. They are not a separate domain like Git, Gt, or Gh, but their vocabulary matters because every standalone/plugin CLI uses the same construction and rendering seams.

### Language

**AsdlPluginSpec** — The declarative plugin contract shared by a standalone CLI and its mounted `asdl` plugin: a group builder plus an optional context factory.
_Avoid:_ plugin registry, entry point object, Click command.

**Context factory** — A zero-argument callable that lazily constructs the package-specific typed context for an invocation.
_Avoid:_ global singleton, Click context, request model.

**Standalone CLI builder** — The helper that turns an `AsdlPluginSpec` into a package's standalone Click group, adding `-h/--help` and package version behavior.
_Avoid:_ plugin discovery, operation registration, console entry point.

**Standalone CLI invoker** — The helper that builds and runs a standalone CLI, installing a clinkr context object only when the spec has a context factory.
_Avoid:_ plugin mount, test runner, Click callback.

**asdl console** — A fresh Rich `Console` bound to the current `sys.stdout` for one render path.
_Avoid:_ global console singleton, logger, stderr renderer.

**asdl table** — The canonical Rich table style returned by `make_table`, including header style, box, padding, and expansion behavior.
_Avoid:_ arbitrary Rich table, CLI data model, renderer.

**Relative time string** — A compact human-facing age such as `5m ago`, `2h ago`, or `just now`, derived from an ISO timestamp.
_Avoid:_ timestamp parser, duration object, freshness state.

**State badge** — A Rich-markup label for a PR/issue-like state string, currently normalizing `open` and `closed` specially and surfacing unknown states in yellow.
_Avoid:_ PRState, status enum, package availability status.

**AliasedGroup** — A Click group variant that resolves alias names to canonical command names and shows aliases inline in help.
_Avoid:_ ClinkrGroup, dynamic registry, shell alias.

### Relationships

#### Plugin spec flow

Packages define one **AsdlPluginSpec** so their standalone entry point and their `asdl.plugins` entry point share the same group construction. The spec's **Context factory** is passed into clinkr's context object lazily; help/version/schema paths do not need to construct package gateways.

#### Presentation helpers

Use **asdl console** and **asdl table** for user-facing Rich output so plugin packages share the same capture-safe stdout behavior and table look. These helpers are presentation surfaces, not result models; machine JSON still comes from clinkr result types.

#### State rendering boundary

**State badge** renders state-like strings for humans. It is not the source of truth for **PRState**, **PRStateFilter**, Objective status, slot inventory status, or package availability status; those domains own their typed state/status vocabularies and may feed labels into the badge renderer only at presentation time.

#### Aliases

**AliasedGroup** is a legacy Click-level alias helper. New clinkr operations normally use `ClinkrGroup` alias support through operation metadata; use `AliasedGroup` only where plain Click grouping still owns the surface.

## Sessions

The Sessions subdomain is the harness-neutral boundary for local agent session facts. It defines source interfaces, compact parsed-session models, source references, and deterministic evidence aggregation without retaining raw transcript content. Harness-specific parsing stays under adapters; branch-facing retrospective envelopes live in `aretro`.

### Language

**Sessions subdomain** — Harness-neutral boundary for local agent session facts, source adapters, and deterministic evidence aggregation.
_Avoid:_ Pi-only sessions, aretro-only sessions, transcript store.

**SessionSource** — Readable adapter interface for one harness/session-log source, defined in `asdl_core.sessions.source`.
_Avoid:_ session gateway, log helper, provider.

**Session source adapter** — Harness-specific parser implementation, such as the Pi JSONL adapter, that normalizes one log format into shared session models.
_Avoid:_ session model, evidence collector, generic parser.

**SessionSourceInfo** — Adapter identity (`harness`, `adapter_name`, `record_format`) returned without filesystem or subprocess work.
_Avoid:_ source status, source config, provider metadata.

**SessionSourceRef** — Source reference to a path, URI, or line number without embedding raw transcript text.
_Avoid:_ transcript excerpt, message body, log copy.

**SessionQuery** — Request for sessions associated with a repo/worktree and optional session root, session count, time, or harness filters.
_Avoid:_ retrospective request, branch query, adapter config.

**SessionQueryResult** — Sessions plus non-fatal warnings from one source.
_Avoid:_ evidence result, failure result, session list.

**SessionWarning** — Non-fatal discovery or parsing issue, not a failed retrospective.
_Avoid:_ exception, failed evidence item, recommendation.

**SessionAssociation** — Conservative evidence connecting a session to repo, cwd, and branch context, including confidence and evidence strings.
_Avoid:_ ownership, authoritative branch binding, checkout state.

**ParsedSession** — Compact normalized representation of one session: identity/time, association, counts, tool/activity facts, usage, and warnings.
_Avoid:_ raw session, transcript, conversation.

**Session message counts** — Counts of normalized message/activity classes rather than transcript content.
_Avoid:_ message text, token counts, transcript summary.

**Session tool/activity facts** — Normalized tool calls, tool results, shell command executions, model events, and usage events.
_Avoid:_ tool output, assistant prose, command stdout.

**SessionEvidenceItem** — Deterministic source-backed observation aggregated from parsed sessions.
_Avoid:_ finding, recommendation, diagnosis.

**Evidence kind order** — Stable rendering/sorting order for evidence kinds, not severity or recommendation priority.
_Avoid:_ severity, priority, ranking.

**Pi JSONL session source** — First concrete adapter for Pi's local JSONL logs; an implementation detail of one harness source, not the sessions domain itself.
_Avoid:_ sessions subsystem, default transcript store, Pi provider.

**Privacy boundary** — Default rule that normalized facts include metadata, counts, bounded subjects, and source refs, but not raw prompts, assistant prose, transcript text, or tool output content.
_Avoid:_ redaction pass, anonymization guarantee, full transcript export.

### Relationships

#### Adapters normalize into shared models

Adapter-specific parsing stays under `asdl_core.sessions.adapters`. Shared harness-neutral models live in `asdl_core.sessions.types`, and adapters emit those models rather than exposing Pi-only, Claude-only, or Codex-only fields.

#### Source references, not transcript retention

**SessionSourceRef** points back to source material when a human needs to inspect the original log. Normalized session facts retain references, counts, bounded subjects, and metadata instead of copying raw transcript text or tool output content.

#### Associations are conservative evidence

**SessionAssociation** records repo/cwd/branch clues that make a session relevant to a retrospective. It is useful evidence for branch analysis, not an authoritative branch-ownership or checkout-state system.

#### Evidence aggregation is deterministic

`collect_session_evidence` emits factual **SessionEvidenceItem** observations such as tool usage counts, failed tool results, repeated file reads, repeated shell commands, token usage, and large or truncated output. The **Evidence kind order** makes rendering stable; it does not rank severity.

#### Sessions vs aretro vs branch-retro

`asdl-core.sessions` owns models, adapters, and deterministic aggregation. `aretro` owns the branch-facing CLI, branch resolution, and JSON DTO envelope. `branch-retro` owns semantic recommendation judgment over the emitted evidence.

#### Evidence items vs findings

Session evidence items are factual retrospective observations. Roaster findings are review feedback intended for humans and PR comments. Objective completion evidence is narrative proof that work progressed or criteria were satisfied.
