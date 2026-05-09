# PR Address

asdl-pr-address is the **Tool** that addresses pull-request review **Feedback Items** end-to-end on the current branch's PR — one ephemeral **Invocation** per pass.

## Language

**Feedback Item**:
A single piece of GitHub-side feedback the Tool can address: an unresolved inline review thread, a discussion comment on the PR, or a review summary. Each Feedback Item carries enough identity for the Tool to mutate the GitHub side (resolve, reply, react) and enough content for the **Harness** to classify and execute against.
_Avoid_: Comment (too generic — comments include resolved threads, bot output, and items the Tool ignores), Issue (collides with GitHub Issues), Note, Remark

**Invocation**:
One end-to-end execution of the `pr-address` **Skill** against one PR — from `prepare-run` through classification, execution, local commits, and GitHub thread mutations (or earlier abort, for a read-only pass). An Invocation is ephemeral: it has no identifier, no stored history, and no replay. Each Invocation sees a closed set of **Feedback Items** determined at `prepare-run` time; new feedback that arrives mid-Invocation is ignored until the next Invocation.
_Avoid_: Run (implies persisted history; pr-address has no run list), Session (overloaded with HTTP / Unix / REPL sessions), Pass, Round

**Review Thread**:
A **Feedback Item** anchored to a file and line range, created when a reviewer leaves an inline comment as part of a Review submission. Carries a `resolved` boolean that the Tool can flip via `resolve-thread` and `unresolve-thread`. Supports thread replies and reactions. The most common Feedback Item kind and the only one with first-class resolution semantics.
_Avoid_: Inline Thread, Inline Comment, Code Comment

**Discussion Comment**:
A **Feedback Item** posted as a top-level PR conversation comment, not anchored to any file or line and not resolvable as a thread. Called an "issue comment" in GitHub's REST API and a "conversation" in the GitHub UI; this Tool standardises on "Discussion Comment" to avoid colliding with GitHub Issues. Supports replies (by posting another Discussion Comment) and reactions.
_Avoid_: Issue Comment (collides with GitHub Issues), PR Comment (ambiguous — could mean any of the three Feedback Item kinds), Conversation Comment

**Review Summary**:
The top-level body of a GitHub Review submission — the Approve / Request changes / Comment text a reviewer writes alongside any inline threads they leave in the same submission. A Review Summary is a **Feedback Item**: it can carry actionable feedback even though it is not anchored to code and not resolvable as a thread. Supports replies (via a review reply) and reactions.
_Avoid_: Review Body (matches the API field name but loses the "this is the summary the reviewer left" connotation), Review Comment (collides with the term GitHub uses for inline review-thread comments)

**Classification**:
The binary judgment, made once per **Feedback Item**, of whether the Item needs code work (`actionable`) or only acknowledgement (`informational`). Classification is a contract: every unresolved **Review Thread** is classified explicitly, and `actionable` Items must never be silently collapsed into informational counts. Classifying as `informational` is a positive decision that the Item carries no code-change obligation, not a way to skip it.
_Avoid_: Category (too generic), Triage (collides with issue triage), Verdict, Disposition

**Complexity**:
The second-axis judgment, applied only to `actionable` **Feedback Items**, that names how big the change is. Five values: `pre_existing` (no code change in this PR — bot comment on moved code, etc.), `local` (one-line or trivial change), `single_file` (one file, multiple lines), `cross_cutting` (multiple files affected), `complex` (multiple Items inform a single architectural change). Complexity is what gates auto-execution: items in the lower three buckets execute without per-item prompts; the upper two require explicit user approval. The numbered Batches the Skill mentions are mechanically derived from Complexity (Batch 0 = `pre_existing`, Batch 1 = `local`, …), so Batches do not carry domain meaning beyond what Complexity already says.
_Avoid_: Size, Risk, Tier, Severity (none capture both "scope of change" and "auto-execute eligibility")

**Address**:
The per-Item action verb at the heart of asdl-pr-address: take a single **Feedback Item** through whatever response it warrants, then close the loop on GitHub. Addressing an `actionable` Item with non-`pre_existing` Complexity typically means writing code, committing locally, posting a reply, and resolving the thread (when the Item is a **Review Thread**). Addressing an `actionable + pre_existing` Item means posting a reply and resolving without a commit. Addressing an `informational` Item means deciding (with the user) whether to reply or dismiss; the Item may be left unresolved on purpose. Address is per-Item; the per-PR workflow is the **Invocation**.
_Avoid_: Handle, Process, Reply (too narrow — not all Address paths reply), Resolve (collides with the GitHub state transition)

**Resolve**:
The GitHub state transition that flips a **Review Thread** from unresolved to resolved. Only **Review Threads** can be Resolved — **Discussion Comments** and **Review Summaries** have no resolve concept. Resolution is an **Address** outcome, not a synonym for it: the Tool may Address a thread with a code change and a reply but leave it unresolved when the user wants to keep the conversation open. When the Tool Resolves a thread it leaves a **resolution marker** in the reply body so a later Invocation can detect contested resolutions (a reviewer comment posted after the marker auto-unresolves the thread at the next `prepare-run`, returning it to the classification pool). The verb `unresolve-thread` exists primarily for that auto-reopen path; explicit user-driven unresolve is rare.
_Avoid_: Close (collides with closing PRs and Issues), Mark Done, Dismiss

## Relationships

- The asdl-pr-address **Tool** ships one Public **Skill** named `pr-address` and the standalone CLI `pr-address`.
- The Skill orchestrates one **Invocation** per execution; the CLI is stateless underneath.
- An **Invocation** is scoped to exactly one pull request — the current branch's PR.
- An **Invocation** addresses zero or more **Feedback Items**, where the Item set is closed at `prepare-run` time.
- A **Feedback Item** is exactly one of: **Review Thread**, **Discussion Comment**, or **Review Summary**.
- Every **Feedback Item** in an Invocation receives a **Classification** (`actionable` or `informational`); `actionable` Items additionally receive a **Complexity**.
- **Address** is the per-Item action verb; **Resolve** is one possible outcome of Addressing a **Review Thread**.
- An Invocation produces zero or more local commits and zero or more GitHub mutations (resolves, replies, reactions); it never pushes.
- All GitHub mutations performed during an Invocation go through `pr-address exec` operations, not raw `gh api` calls.

## Example dialogue

> **Dev:** "The Skill called this comment `informational`. Why didn't it just skip it?"
> **Domain expert:** "Because skipping is not an outcome — `informational` is a positive **Classification** that says 'no code change owed.' Every unresolved **Review Thread** in an **Invocation** must be classified explicitly; that is a contract, not a default."
>
> **Dev:** "I see two `actionable` Items both marked `complex`. They're really one refactor. Why didn't the Tool batch them together?"
> **Domain expert:** "**Complexity** is per-Item; the auto-execute Batches are derived from Complexity values, not from cross-Item meaning. The Skill's classifier reference describes a 'meta-item' grouping for exactly this case — group them in the complex batch yourself rather than treating each as standalone."
>
> **Dev:** "Last week's Invocation Resolved a thread, and now it's back in the unresolved list. Did GitHub revert it?"
> **Domain expert:** "No — the reviewer left a new comment after the **Resolve** marker the Tool wrote. `prepare-run` detected that on this Invocation and unresolved the thread automatically so the new comment doesn't get lost. That is the contested-thread reopen behavior of **Resolve**."
>
> **Dev:** "Why does the Tool refuse to push my commits?"
> **Domain expert:** "An **Invocation** never pushes — that is an invariant, not a configuration. Local commits exist so you can review them before they hit the remote. You push manually after the Invocation finishes."
>
> **Dev:** "Can I run two Invocations in parallel against the same PR?"
> **Domain expert:** "You can, but each sees a different closed Item set — the second Invocation's `prepare-run` snapshot does not see commits or resolutions from the first until the first has actually mutated GitHub. Treat Invocations as serialized per PR even though nothing structurally enforces that."

## Flagged ambiguities

- "Comment" is ambiguous — GitHub uses it for inline review-thread comments, top-level PR discussion comments, and review summary bodies. Resolved: use **Review Thread**, **Discussion Comment**, and **Review Summary** as named subtypes of **Feedback Item**; reserve "comment" for incidental English usage.
- "Issue Comment" is GitHub's REST term for what the UI calls a PR conversation comment. Resolved: this context calls them **Discussion Comments**; the CLI verb `add-issue-comment` is preserved for API fidelity, but skills and prose use the domain term.
- "Run" was the obvious name for the per-Invocation unit-of-work and is partially baked into the CLI verb `prepare-run`. Resolved: the domain term is **Invocation** because there is no run history, no run id, and no replay; the `prepare-run` token stays for ergonomics, glossed as "the command that begins an Invocation."
- "Snapshot" was considered for the prepare-run output. Resolved: rejected — it collides with **Objective Snapshot** in the Objectives context and implies a captured-for-reference artifact the Tool does not honor (the bundle is consumed once and discarded). The freeze property lives inside **Invocation**'s definition.
- "Batch" appears in the Skill prose and the classifier reference. Resolved: not a domain noun — Batches are mechanically derived from **Complexity** and carry no meaning beyond it.
- "Address" overlaps with the everyday English verb. Resolved: in this context it is per-Item with a precise contract (commit-and/or-reply-and/or-resolve depending on Classification + Complexity); the per-PR workflow is **Invocation**, not Address.
