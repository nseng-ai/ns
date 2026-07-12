---
name: refactor-swarm
disable-model-invocation: true
description: "Parallel file-local refactors across many files using a swarm of agents on the harness's cheapest fast model tier. Use when the same shape of refactor applies to 5+ files, each file is transformable from its own contents plus a shared brief (no cross-file coordination), and light per-file judgment is acceptable. Not for refactors where judgment must be unified across files."
---

# refactor-swarm

Parallelize a refactor across many files: the orchestrator identifies the files, writes a shared brief, and launches one agent per file on the harness's cheapest fast model tier, in two waves (source first, tests second). A 28-file rename lands in about a minute of wall time versus 10+ minutes of sequential edits.

## When to use

- **5+ files** receiving the same shape of refactor. Below 5, sequential edits are simpler and have less overhead.
- **File-local decidability**: each file's refactor is decidable from that file's contents plus the shared brief -- no cross-file lookups.
- **Light judgment OK**: per-file calls like "use the closest stdlib equivalent", "inline the helper only if it's used once in this file", "keep the old wrapper iff other tests still call it".

Typical fits: renaming an identifier, parameter, or dictionary key across source and tests; inlining a trivial helper at each call site; migrating a deprecated API call pattern; normalizing a logging convention.

## When NOT to use

- **Cross-file cascading refactors** -- edits in file A determine what needs to change in file B.
- **Judgment that must be consistent across files** -- e.g., picking one new name for a concept where every caller has to agree. Each agent decides independently, and verification cannot recover from per-agent divergence. Pre-decide the call in the orchestrator brief, or don't use the swarm.
- **Deep type/behavior reasoning** -- refactors that need whole-program understanding.

## Why over pure AST/codemod tooling

If the project has a battle-tested AST/codemod toolchain wired in (libcst, jscodeshift, etc.), prefer it for purely syntactic refactors -- faster, deterministic, replayable. But the absence of one is not a reason to give up on a large mechanical refactor, and even alongside one, reach for the swarm when:

- **Natural-language references must move with the code.** Docstrings, inline comments, README sections, error messages, and log lines refer -- directly or indirectly -- to the symbol or concept being refactored. A codemod only touches syntactic occurrences; an agent reads the surrounding prose and updates mentions like `"returns the issue_number of the PR"` without enumerating every phrasing in advance.
- **Light per-file judgment is required** -- calls that don't fit a pattern-match-and-replace shape.

## The pattern

### Step 1: Identify the files

Use `Grep` to find every file that needs the refactor:

```
Grep(pattern="<anchor pattern>", output_mode="files_with_matches")
```

Partition the results into **source files** (`src/` or library code) and **test files** (`tests/`).

### Step 2: Launch the source wave

Launch one `Task` agent per file, requesting the harness's cheapest fast model tier: mechanical-to-lightly-judgment refactors don't need deeper reasoning, and the tier is cheap enough that one agent per file is sensible -- focused prompts, isolated failures, easy retries. Group tiny files 2-3 per agent only when per-agent overhead dominates the actual edit work.

On the Claude harness, for example:

```python
Task(
    subagent_type='general-purpose',
    model='haiku',  # Claude-harness example of the cheapest fast tier
    description='Apply refactor to path/to/file.py',
    prompt="""..."""  # See the agent prompt template below
)
```

On an OpenAI Codex-backed harness (such as Pi), request the cheap fast tier per dispatch instead -- for example, dispatch the runner subagent with `model: 'openai-codex/gpt-5.6-luna:minimal'`. On harnesses without a haiku-tier model or per-dispatch model selection, omit the model parameter and use the default model.

**Launch ALL source-wave agents in a single message** so they run concurrently.

### Step 3: Collect source-wave results

Review each agent's report before moving on: the agent reports success, and any "cases I skipped" notes are expected. If the source wave produced unexpected skips or errors, patch the brief and retry, or handle those files manually -- and **abort before launching the test wave**.

### Step 4: Launch the test wave

Same pattern as Step 2, for the test files.

### Step 5: Verify

After both waves complete:

1. **Literal renames**: `Grep` for the old identifier -- confirm only intentional exceptions remain (e.g., references to an external API's field names).
2. **Judgment-involved refactors**: grep alone is not sufficient. Run the test suite, type checker, and linter.
3. **High-stakes changes**: read a sample of diffs before moving on.

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

What the agent must leave alone -- mandatory in every prompt; this is where partial refactors succeed or fail. Example:

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

Within each wave, all agents run in parallel; between waves, wait for completion and review results. The waves are causally independent -- both apply the same refactor to their own files -- so the split exists purely to give the orchestrator a checkpoint before touching the second half.

For very large refactors (30+ files), sub-batch into groups of ~10-15 agents per message to avoid overwhelming the system.

## Example: judgment-light migration, f-string logging → structured logger

Brief the agents to replace each `logging.info(f"...")` call with a `logger.info("event_name", **fields)` call. Boundary constraint: do not touch `logging.debug` or `logging.warning`. Authorized judgment: pick the `event_name` from nearby context (function name, nearest comment, or the dominant noun in the original f-string). Agents report any call they could not confidently rewrite.

This case sits exactly on the boundary of what the swarm handles well: the event-name choice is per-file-local (each call site gets its own answer), so trust-independence is fine. If you wanted all "user signed up" events across the codebase to land on the same canonical event name, that would require unified judgment and the swarm would not be the right tool.
