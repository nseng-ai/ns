---
name: refactor-swarm
description: "Parallel file-local refactors across many files using a swarm of agents on the harness's cheapest fast model tier. Use when the same shape of refactor applies to 5+ files, each file is transformable from its own contents plus a shared brief (no cross-file coordination), and light per-file judgment is acceptable. Not for refactors where judgment must be unified across files."
---

# refactor-swarm

Parallelize a refactor across many files by spawning one agent per file on the harness's cheapest fast model tier. The orchestrator identifies the files, writes a shared brief, and launches the swarm in two waves (source files first, tests second). Each agent applies the refactor to its assigned file independently. The swarm pays off when the refactor is file-local, wall time matters, and per-file judgment is cheap enough that a fast-tier model can handle it.

## When to use

- **5+ files** receiving the same shape of refactor
- **File-local decidability**: each file's refactor is decidable from that file's contents plus the orchestrator's shared brief -- no cross-file lookups required
- **Light judgment OK**: per-file calls like "use the closest stdlib equivalent", "inline the helper only if it's used once in this file", "keep the old wrapper iff other tests still call it"

Examples:

- Renaming an identifier, parameter, or dictionary key across source and tests
- Inlining a trivial helper at each call site
- Migrating a deprecated API call pattern to its replacement
- Normalizing a logging convention across modules
- Converting a decorator usage pattern

## When NOT to use

- **Cross-file cascading refactors** -- edits in file A determine what needs to change in file B
- **Judgment must be consistent across files** -- e.g., picking one new name for a concept where every caller has to agree. This skill's verification model trusts each agent to decide independently and cannot recover from per-agent divergence. If unified judgment is required, pre-decide in the orchestrator brief or don't use the swarm.
- **Fewer than 5 files** -- sequential edits are simpler and have less overhead
- **Deep type/behavior reasoning** -- refactors that need whole-program understanding

## Why over pure AST/codemod tooling

If your project already has a battle-tested AST/codemod toolchain wired in (libcst, jscodeshift, ts-morph, etc.), prefer it for purely syntactic refactors -- it is faster, deterministic, and replayable. The swarm is not trying to displace mature codemod pipelines. That said, this approach is surprisingly scalable on its own: one fast-tier agent per file, parallel waves, file-local prompts -- so the absence of a codemod toolchain is not a reason to give up on a large mechanical refactor. Reach for the swarm (even alongside an AST toolchain) when either of the following is true:

- **Natural-language references must move with the code.** Docstrings, inline comments, README sections, error messages, and log lines frequently refer -- directly or indirectly -- to the symbol or concept being refactored. A codemod can only touch syntactic occurrences; an LLM agent can read the surrounding prose and update mentions like `"returns the issue_number of the PR"` or a comment that says `"# legacy retry path"` without having to enumerate every phrasing in advance.
- **Light per-file judgment is required.** Picking the closest stdlib equivalent, deciding whether a wrapper still earns its keep, or choosing a sensible event name from local context does not fit cleanly into a pattern-match-and-replace shape.

## The pattern

### Step 1: Identify the files

Use `Grep` to find every file that needs the refactor:

```
Grep(pattern="<anchor pattern>", output_mode="files_with_matches")
```

Partition the results into two groups:

- **Source files** (`src/` or library code)
- **Test files** (`tests/`)

### Step 2: Launch the source wave

Launch one `Task` agent per file (or per small group of 2-3 closely related files), requesting the harness's cheapest fast model tier. On the Claude harness, for example:

```python
Task(
    subagent_type='general-purpose',
    model='haiku',  # Claude-harness example of the cheapest fast tier
    description='Apply refactor to path/to/file.py',
    prompt="""..."""  # See the agent prompt template below
)
```

On harnesses without a haiku-tier model or per-dispatch model selection, omit the model parameter and use the default model.

**Launch ALL source-wave agents in a single message** so they run concurrently.

### Step 3: Collect source-wave results

Review each agent's report before moving on. For each agent, confirm:

- The agent reports success
- Any "cases I skipped" notes are expected (agents are instructed to report, not guess, when they hit something the brief doesn't cover)

If the source wave produced unexpected skips or errors, decide whether to patch the brief and retry, or handle those files manually. **Abort before launching the test wave** if source-wave results look off -- that is the whole point of the two-wave split.

### Step 4: Launch the test wave

Same pattern as Step 2, but for test files. All tests run in parallel within the wave.

### Step 5: Verify

After both waves complete:

1. **Literal renames**: `Grep` for the old identifier -- confirm only intentional exceptions remain
2. **Judgment-involved refactors**: grep alone is not sufficient. Run the test suite, type checker, and linter
3. **High-stakes changes**: read a sample of diffs before moving on

## Agent prompt template

Each agent receives a focused, self-contained prompt:

```
In the file `{file_path}`:

Apply this refactor: {refactor_description}

Specifically:
- {concrete transformations the orchestrator has decided on}

Judgment you are authorized to make on your own (use your best read
of the surrounding code):
- {explicit list of per-file calls the agent can decide}

DO NOT change:
- {boundary constraints -- what to leave alone}

If you encounter a case these instructions don't cover, leave it
alone and report it in your response. Do not guess.

Read the file first, then apply edits using the Edit tool. After
editing, report what you changed and flag any cases you skipped.
```

Two subsections of the prompt matter most:

### Boundary constraints

What the agent must leave alone. This is where partial refactors succeed or fail. Example:

> Do not rename occurrences inside string literals that are user-facing messages.

If there are no exceptions, say so explicitly: `"No exceptions -- apply the refactor to all matching occurrences."`

### Authorized judgment

What the agent is allowed to decide on its own. Example:

> If the file already imports from `pathlib`, use `Path` for the new code; otherwise use `os.path`.

Keeping these two lists separate makes the boundary between "orchestrator decides" and "agent decides" explicit, and makes the prompt easier to debug when an agent goes off the rails -- you can see which bucket the misstep fell into.

## Batching strategy

| Wave | Files                 | Rationale                                             |
| ---- | --------------------- | ----------------------------------------------------- |
| 1    | Source files (`src/`) | Refactor lands first so you have a failure checkpoint |
| 2    | Test files (`tests/`) | Launch only after source-wave results look clean      |

Within each wave, all agents run in parallel. Between waves, wait for completion and review results.

For very large refactors (30+ files), sub-batch into groups of ~10-15 agents per message to avoid overwhelming the system.

## Key design decisions

- **Cheapest fast tier always.** Mechanical-to-lightly-judgment refactors do not need deeper reasoning. A fast-tier model is cheap enough that one agent per file is sensible.
- **One agent per file.** Focused prompts, isolated failures, easy retries. Tiny files can be grouped 2-3 at a time when per-agent overhead dominates the actual edit work.
- **Two waves for checkpointing.** Source and test waves are causally independent -- both apply the same refactor to their own files. The split exists to give the orchestrator a place to stop and inspect before touching the second half.
- **Boundary constraints are mandatory.** Every prompt must list what not to touch, or explicitly state there are no exceptions.
- **Consistency across parallel judgment calls is not enforced.** If every agent has to land on the same answer for a judgment call, either pre-decide in the brief or do not use the swarm.

## Examples

### Mechanical rename: `issue_number` → `pr_number`

1. `Grep(pattern="issue_number", output_mode="files_with_matches")` finds 16 source files and 12 test files
2. **Wave 1**: 16 fast-tier agents for source files, launched in a single message -- completes in ~25 s
3. **Wave 2**: 12 fast-tier agents for test files -- completes in ~20 s
4. Verify: `Grep(pattern="issue_number")` confirms only intentional external-API field references remain
5. Run CI: tests pass, type checker clean

Total wall time: ~60 s for 28 files, versus ~10+ minutes for sequential edits.

### Judgment-light migration: f-string logging → structured logger

Brief the agents to replace each `logging.info(f"...")` call with a `logger.info("event_name", **fields)` call. Boundary constraint: do not touch `logging.debug` or `logging.warning`. Authorized judgment: pick the `event_name` from nearby context (function name, nearest comment, or the dominant noun in the original f-string). Agents report any call they could not confidently rewrite.

This case sits exactly on the boundary of what the swarm handles well: the event-name choice is per-file-local (each call site gets its own answer), so trust-independence is fine. If you wanted all "user signed up" events across the codebase to land on the same canonical event name, that would require unified judgment and the swarm would not be the right tool.
