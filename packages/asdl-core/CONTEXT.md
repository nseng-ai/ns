# asdl-core

asdl-core is the shared substrate for asdl plugin packages. It owns common CLI, repository, GitHub, Graphite, session, plugin, and presentation vocabulary used across the workspace.

## Language

### Clinkr

**Operation**:
The semantic command of a clinkr CLI: one typed function that owns the command's request, result, and exit contract. It is distinct from the Click command wrapper that exposes it on the shell.
_Avoid_: "command" unqualified, "subcommand," "handler," "endpoint," "action."

**ClinkrGroup**:
A Click group that wraps Operations into invocable commands and applies clinkr's shared human/machine dispatch behavior. It is the construction-time mounting point for operations and aliases.
_Avoid_: "registry" (implies dynamic add/remove), "router."

**ClinkrExit\[T\]**:
The typed outcome every Operation returns, carrying an ExitStatus plus either OK data, NEGATIVE message/data, or FAILURE error metadata. It is the domain exit envelope, not the framework's serialized machine JSON shape.
_Avoid_: "result" unqualified, "response," "envelope" unqualified.

**ExitStatus**:
The three-value outcome vocabulary for clinkr operations: OK for a positive answer, NEGATIVE for a definitive negative answer, and FAILURE when the command could not answer reliably.
_Avoid_: "error" for NEGATIVE; "warning" for either.

**Machine envelope**:
The framework-owned JSON object emitted in machine mode for any ClinkrExit. Authors change the Result type, not this envelope shape, when machine data should change.
_Avoid_: "machine output" (vague), "JSON envelope" (collides with the more general envelope concept).

**Human renderer**:
A per-Operation presenter for OK data in human or Markdown-facing output modes. NEGATIVE and FAILURE statuses bypass it and render their messages through the dispatcher.
_Avoid_: "formatter" (collides with `click.HelpFormatter`), "view," "presenter."

**ClinkrFailure**:
The exception Operation code raises for unrecoverable failure so the dispatcher can produce a FAILURE ClinkrExit. It keeps failure signaling out of ordinary OK/NEGATIVE result construction.
_Avoid_: direct `ClinkrExit.failure(...)` in operation code, raw exception as CLI contract.

**Ensure**:
Namespace of guard helpers that raise ClinkrFailure when preconditions fail. It is clinkr's type-narrowing and invariant-checking vocabulary inside Operations.
_Avoid_: assert, validation library, boolean helper.

**NonIdealState**:
A protocol for domain failure arms that carry a canonical message and can be lifted into ClinkrFailure. It lets domain helpers return explicit success-or-problem values without depending on ClinkrExit.
_Avoid_: "domain error" alone.

**ClinkrContextObject**:
The frozen invocation wrapper installed at `click.Context.obj` to hold the lazy context factory and machine-mode flag. It is clinkr's transport for per-invocation context, not the plugin's typed context itself.
_Avoid_: app context, request context, global context.

**Typed context**:
The app-specific context object that an Operation loads when it needs gateways or services for the invocation. It is produced lazily so help/schema paths do not construct runtime dependencies.
_Avoid_: app context, request context.

**Request type**:
The Pydantic model that defines an Operation's input surface and from which Click arguments/options are derived. Authors change this model when the CLI input contract changes.
_Avoid_: "params" (collides with `click.Parameter`), "input," "args."

**Result type**:
The Pydantic-compatible OK data type for an Operation. It is the body of successful machine output and the value rendered by human presenters.
_Avoid_: "response," "output," "payload" alone; "data" alone.

### Payload artifacts

**Payload artifact architecture**:
The agent-workflow pattern where large command details are held in local artifacts while the main transcript receives compact references, counts, and locators.
_Avoid_: side-channel, hidden channel, raw transcript dump, automatic output spooling.

**Payload artifact**:
A local workflow artifact that carries command details too large or too specific for the main agent transcript.
_Avoid_: Branch Memory, durable record, transcript.

**Payload mode**:
A command transport mode that writes full command detail to a **Payload artifact** and returns a compact manifest through the normal command output.
_Avoid_: automatic spooling, inline mode.

**Compact manifest**:
The command-specific small result that points to payload artifacts and includes enough identifiers, counts, and locators for the agent to decide what to inspect next.
_Avoid_: summary, raw payload, full output.

**Payload reference**:
The store-owned facts that identify one written **Payload artifact**, separate from command-domain identifiers such as PR numbers, comment IDs, or file paths.
_Avoid_: PR locator, domain metadata, artifact body.

**Payload locator**:
A pointer from a compact manifest to a specific value or item inside a payload artifact.
_Avoid_: search query, summary, body preview.

### Git

**GitGateway**:
The shared interface for git-backed repository and worktree operations.
_Avoid_: "git helper," "subprocess wrapper," "git service."

**Bound repo**:
The repository root captured by a `RealGitGateway` instance for repo-wide operations such as local branch inventory, object-database reads, worktree listing, and history queries.
_Avoid_: current worktree, current directory, active checkout.

**Repository root**:
The top-level working tree directory resolved from a caller-provided `cwd`.
_Avoid_: git directory, git common dir, workspace root.

**Git common dir**:
The main `.git` directory shared by a repository and its linked worktrees.
_Avoid_: repository root, worktree path, slots root.

**Worktree**:
A checkout path registered with git, either attached to a local branch, detached at a ref, or bare.
_Avoid_: slot (slots may manage worktrees, but not every worktree is a slot), clone.

**WorktreeInfo**:
The typed inventory record for one git worktree: path, attached branch if any, and bare-ness.
_Avoid_: slot record, checkout record, worktree status.

**Branch**:
A local `refs/heads/<name>` branch in the bound repo.
_Avoid_: ref when the value may be a tag, OID, remote-tracking ref, or revision expression; Graphite stack node.

**Current branch**:
The local branch currently checked out at a specific worktree path.
_Avoid_: bound repo branch, active branch globally.

**Previous branch**:
Git's reflog shorthand for the branch checked out before the current worktree's branch.
_Avoid_: parent branch, base branch, Graphite ancestor.

**Trunk branch**:
The local branch used as the repository's integration baseline, resolved from `origin/HEAD` and then local `main` / `master` fallbacks.
_Avoid_: remote default branch, base ref, Graphite trunk.

**Ref**:
A git object name or revision expression used to read tree contents, position detached HEAD, update a local ref, or describe a commit range endpoint.
_Avoid_: branch when branch attachment is not required.

**Start point**:
The ref used as the initial target when creating or force-moving a local branch.
_Avoid_: parent, ancestor, base branch.

**DetachedHead**:
The `NonIdealState` sentinel for a worktree whose HEAD is not attached to a branch.
_Avoid_: missing branch, git failure, empty current branch.

**GitCommandFailure**:
The `NonIdealState` failure arm for a git command that could not produce a requested fact.
_Avoid_: negative result, subprocess exception, detached head.

**FileStatus**:
The dirty-state summary of one worktree, split into staged, modified, and untracked bits from porcelain status.
_Avoid_: diff, file list, cleanliness boolean.

**LocalBranchTip**:
A local branch name paired with its HEAD committer timestamp.
_Avoid_: current branch, last-touched file timestamp, remote branch tip.

**LocalBranchTipRef**:
A local branch name paired with its HEAD object ID for commit-graph analysis.
_Avoid_: LocalBranchTip, current branch, remote branch ref.

**CommitGraphNode**:
One commit object ID and its parent object IDs from a commit graph walk.
_Avoid_: CommitSummary, patch id, branch node.

**BranchCommitGraph**:
The branch tips and commit nodes reachable from selected local branches after excluding a base branch.
_Avoid_: Graphite stack, full repository graph, branch tree.

**PathTouch**:
The latest commit object ID and committed time touching one path within a ref or revision range.
_Avoid_: file timestamp, branch HEAD time, path existence.

**PathChangeTouch**:
One commit and the changed paths under a pathspec, newest-first for path-touch attribution.
_Avoid_: changed file list, diff summary, PathTouch.

**CommitSummary**:
One commit returned from a range query, represented by SHA, author timestamp, and subject.
_Avoid_: PR commit, patch id, changelog entry.

**Patch ID**:
Git's stable content fingerprint for a commit diff, used to compare patch-equivalent commits across ranges.
_Avoid_: SHA, commit identity, diff text.

**RestructuredFile**:
A rename or copy pair surfaced by git's similarity-based name-status detection.
_Avoid_: changed file, moved path, deleted file.

### Gt

**GtGateway**:
The interface for Graphite parent/child/trunk reads, focused stack snapshots, and Graphite stack operations.
_Avoid_: git gateway, branch gateway, generic branch graph service.

**Graphite stack**:
Graphite's tracked sequence of branches or PRs rooted at trunk, where each entry builds off its Graphite parent.
_Avoid_: Git history, branch tree, arbitrary DAG.

**StackInfo**:
A successful focused snapshot of the Graphite stack around the branch checked out at a `cwd`; it always names the current Graphite branch and is not a complete branch graph.
_Avoid_: stack graph, branch tree, full stack inventory, nullable stack snapshot.

**Current stack branch**:
The Graphite branch marked current in a successful stack snapshot for a `cwd`.
_Avoid_: unknown current, implicit trunk, detached head.

**Graphite trunk**:
The branch Graphite says stacks merge into, returned by `gt trunk` for command-style reads and appearing as `trunk` in successful focused stack snapshots.
_Avoid_: Git default branch, remote HEAD, base branch.

**Graphite metadata store**:
Graphite-owned SQLite file at `<git-common-dir>/.graphite_metadata.db`, schema-versioned by Graphite's Kysely migrations. asdl reads it read-only for stack discovery.
_Avoid_: repo config, Git object database, asdl cache.

**Stack slice query**:
The canonical four-column metadata-store query (`branch_name`, `parent_branch_name`, `children`, `validation_result`) that defines asdl's required stack schema contract.
_Avoid_: full Graphite schema, `SELECT *`, migration contract.

**Graphite parent**:
The immediate downstack branch returned by `gt parent` for the current branch.
_Avoid_: previous branch, base branch, Git parent.

**Graphite children**:
The immediate upstack branches returned by `gt children` for the current branch.
_Avoid_: descendants, next branch, child worktree.

**Graphite ancestors**:
The downstack branches below the current branch in a stack, toward trunk.
_Avoid_: parents, previous branches, Git ancestors.

**Graphite descendants**:
The upstack branches above the current branch in a stack, away from trunk.
_Avoid_: children, next branches, dependents.

**Downstack**:
The direction toward trunk through Graphite ancestors.
_Avoid_: previous, before, below.

**Upstack**:
The direction away from trunk through Graphite descendants.
_Avoid_: next, after, above.

**NoParent**:
A successful Graphite answer indicating that the current branch is tracked but has no Graphite parent.
_Avoid_: untracked branch, Graphite failure, trunk branch.

**UntrackedBranch**:
A non-ideal Graphite state indicating that the current Git branch has no Graphite stack metadata.
_Avoid_: no parent, detached head, missing branch.

**GtBranchInfo**:
Raw Graphite branch diagnostics returned by `gt branch info` for the current branch.
_Avoid_: stack snapshot, parsed branch metadata, PR details.

**Restack upstack**:
Rebase a branch and its upstack descendants according to Graphite parentage.
_Avoid_: git rebase, restack stack, sync.

**Graphite sync**:
Synchronize Graphite metadata with repository or remote state, optionally restacking affected branches.
_Avoid_: pull, fetch, metadata refresh.

**Stack warning**:
A non-fatal caveat attached to a successful `StackInfo` when metadata is forked, partially inconsistent, or missing an expected trunk marker.
_Avoid_: failure, validation error, lint.

**GtCommandFailure**:
A non-ideal Graphite state indicating that Graphite's CLI or metadata store could not answer the requested stack question.
_Avoid_: negative result, no parent, untracked branch.

### Gh

**PRGateway**:
The single canonical gateway boundary for current GitHub pull-request workflows, including PR lifecycle facts, PR feedback reads, review-thread mutations, discussion-comment mutations, reactions, and guarded merge operations.
_Avoid_: IssueGateway, PRConversationGateway, GitHub gateway, gh helper, PR service.

**PRDiscussionComment**:
A top-level comment in the PR discussion timeline, not attached to a diff line or review thread.
_Avoid_: IssueComment, discussion comment unqualified, issue comment, PR comment.

**PRReview**:
A submitted PR review event, whether fetched later or returned immediately after creation, that carries author, review state, optional body, and submission time; it is not an inline thread and not a top-level discussion comment.
_Avoid_: PRReviewSubmission, review comment, review thread, discussion comment, approval alone.

**PRReviewState**:
GitHub's full review-state vocabulary for PR reviews: `PENDING`, `COMMENTED`, `APPROVED`, `CHANGES_REQUESTED`, and `DISMISSED`.
_Avoid_: PR state, actionable review state, approval status.

**Actionable PR review**:
A submitted review surfaced as feedback because its state is `COMMENTED`, `APPROVED`, or `CHANGES_REQUESTED`.
_Avoid_: review, non-empty review, active review, PRReviewState.

**PRState**:
The actual lifecycle state of a pull request: `OPEN`, `CLOSED`, or `MERGED`.
_Avoid_: PRReviewState, status, state filter, lowercase state.

**PRStateFilter**:
A query filter for PR listing/search: `open`, `closed`, `merged`, or `all`, where `all` means no lifecycle-state restriction.
_Avoid_: PRState, lifecycle state, review state, status filter.

**PRSummary**:
The single PR metadata record used by current workflows, carrying identity, title/body/url, head/base refs, lifecycle state, and head commit OID.
_Avoid_: PRDetails, PR metadata, PR snapshot, merge details.

**PR changed file**:
One file entry in a PR diff, including path, GitHub file status, and optional patch text.
_Avoid_: changed file unqualified, diff, file status, patch.

**PRLookupMiss**:
A successful negative PR lookup indicating that no PR matches the requested branch or lookup key.
_Avoid_: PRLookupError, not found error, failure, gh error.

**PRGatewayFailure**:
A failed PR gateway operation caused by GitHub, `gh`, authentication, network, rate limiting, or an unexpected API response.
_Avoid_: PRLookupError, PRCommandError, lookup miss, negative result.

**PRReviewThreadState**:
The post-mutation resolved state of a PR review thread returned after resolving or unresolving it.
_Avoid_: ResolveReviewThreadResult, UnresolveReviewThreadResult, was-already result, no-op result.

**PRMergeOutcome**:
The accepted result of a guarded PR merge request, recording the PR number and whether auto-merge was enabled instead of merging immediately.
_Avoid_: PRMergeResult, command output, merge status, stdout/stderr result.

**PRReviewThread**:
A resolvable inline conversation anchored to a PR diff location.
_Avoid_: review comment, inline comment, conversation unqualified, discussion comment.

**PRReviewComment**:
One message inside a PR review thread, including the first inline comment and any replies.
_Avoid_: review thread, discussion comment, issue comment, inline thread.

**PR diff anchor**:
The file path plus optional line range that locates inline feedback on a PR diff.
_Avoid_: line, range, position, location unqualified.

**PR inline comment draft**:
One proposed inline message to submit as part of a PR review; it has a PR diff anchor and body but no GitHub comment id, author, timestamp, or thread state yet.
_Avoid_: PRReviewComment, finding, comment input, draft review comment.

### Top-level utilities

**AsdlPluginSpec**:
The declarative plugin contract shared by a standalone CLI and its mounted `asdl` plugin: a group builder plus an optional context factory.
_Avoid_: plugin registry, entry point object, Click command.

**Context factory**:
A zero-argument callable that lazily constructs the package-specific typed context for an invocation.
_Avoid_: global singleton, Click context, request model.

**Standalone CLI builder**:
The helper that turns an `AsdlPluginSpec` into a package's standalone Click group, adding `-h/--help` and package version behavior.
_Avoid_: plugin discovery, operation registration, console entry point.

**Standalone CLI invoker**:
The helper that builds and runs a standalone CLI, installing a clinkr context object only when the spec has a context factory.
_Avoid_: plugin mount, test runner, Click callback.

**asdl console**:
A fresh Rich `Console` bound to the current `sys.stdout` for one render path.
_Avoid_: global console singleton, logger, stderr renderer.

**asdl table**:
The canonical Rich table style returned by `make_table`, including header style, box, padding, and expansion behavior.
_Avoid_: arbitrary Rich table, CLI data model, renderer.

**Relative time string**:
A compact human-facing age such as `5m ago`, `2h ago`, or `just now`, derived from an ISO timestamp.
_Avoid_: timestamp parser, duration object, freshness state.

**State badge**:
A Rich-markup label for a PR/issue-like state string, currently normalizing `open` and `closed` specially and surfacing unknown states in yellow.
_Avoid_: PRState, status enum, package availability status.

**AliasedGroup**:
A Click group variant that resolves alias names to canonical command names and shows aliases inline in help.
_Avoid_: ClinkrGroup, dynamic registry, shell alias.

### Sessions

**Sessions subdomain**:
Harness-neutral boundary for local agent session facts, source adapters, and deterministic evidence aggregation.
_Avoid_: Pi-only sessions, aretro-only sessions, transcript store.

**SessionSource**:
Readable adapter interface for one harness/session-log source, defined in `asdl_core.sessions.source`.
_Avoid_: session gateway, log helper, provider.

**Session source adapter**:
Harness-specific parser implementation, such as the Pi JSONL adapter, that normalizes one log format into shared session models.
_Avoid_: session model, evidence collector, generic parser.

**SessionSourceInfo**:
Adapter identity (`harness`, `adapter_name`, `record_format`) returned without filesystem or subprocess work.
_Avoid_: source status, source config, provider metadata.

**SessionSourceRef**:
Source reference to a path, URI, or line number without embedding raw transcript text.
_Avoid_: transcript excerpt, message body, log copy.

**SessionQuery**:
Request for sessions associated with a repo/worktree and optional session root, session count, time, or harness filters.
_Avoid_: retrospective request, branch query, adapter config.

**SessionQueryResult**:
Sessions plus non-fatal warnings from one source.
_Avoid_: evidence result, failure result, session list.

**SessionWarning**:
Non-fatal discovery or parsing issue, not a failed retrospective.
_Avoid_: exception, failed evidence item, recommendation.

**SessionAssociation**:
Conservative evidence connecting a session to repo, cwd, and branch context, including confidence and evidence strings.
_Avoid_: ownership, authoritative branch binding, checkout state.

**ParsedSession**:
Compact normalized representation of one session: identity/time, association, counts, tool/activity facts, usage, and warnings.
_Avoid_: raw session, transcript, conversation.

**Session message counts**:
Counts of normalized message/activity classes rather than transcript content.
_Avoid_: message text, token counts, transcript summary.

**Session tool/activity facts**:
Normalized tool calls, tool results, shell command executions, model events, and usage events.
_Avoid_: tool output, assistant prose, command stdout.

**SessionEvidenceItem**:
Deterministic source-backed observation aggregated from parsed sessions.
_Avoid_: finding, recommendation, diagnosis.

**Evidence kind order**:
Stable rendering/sorting order for evidence kinds, not severity or recommendation priority.
_Avoid_: severity, priority, ranking.

**Pi JSONL session source**:
First concrete adapter for Pi's local JSONL logs; an implementation detail of one harness source, not the sessions domain itself.
_Avoid_: sessions subsystem, default transcript store, Pi provider.

**Privacy boundary**:
Default rule that normalized facts include metadata, counts, bounded subjects, and source refs, but not raw prompts, assistant prose, transcript text, or tool output content.
_Avoid_: redaction pass, anonymization guarantee, full transcript export.
