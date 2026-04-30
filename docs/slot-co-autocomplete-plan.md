# Plan: Add autocomplete to `.pi/extensions/slot-co.ts`

## Goal

Add Pi slash-command argument autocomplete for `/slot-co` so inputs like:

- `/slot-co <Tab>`
- `/slot-co fo<Tab>`

suggest and complete branch names relevant to the current repository/worktree.

## Scope

This plan covers only autocomplete for the `/slot-co` command itself.
It does **not** change the checkout behavior, session switching behavior, or add global editor autocomplete for non-command text.

## Current state

From the existing implementation in `.pi/extensions/slot-co.ts`:

- The extension registers a slash command named `slot-co`.
- The command currently accepts raw text args.
- If args are empty, it shows usage.
- It then runs `slot checkout <branch> --format json --no-clipboard`.
- On success, it creates a fresh session file and switches Pi into that worktree.

What is missing:

- `getArgumentCompletions` is not implemented for the command.
- There is no branch suggestion/completion path for `/slot-co ...`.

## Desired UX

### Primary behavior

When the user types `/slot-co`, Pi should offer branch suggestions.

When the user types `/slot-co fo`, Pi should narrow suggestions to matching branches, and Tab should complete from that list.

### UX expectations

- Suggestions should be fast enough for interactive use.
- Suggestions should come from the current repo associated with `ctx.cwd`.
- If branch discovery fails, autocomplete should fail quietly and let Pi behave normally.
- Completion should be specific to `/slot-co`, not global editor autocomplete.

## Recommended implementation approach

Use Pi's slash-command argument completion API by adding `getArgumentCompletions` to the existing `pi.registerCommand(COMMAND_NAME, { ... })` call.

This is the correct fit because:

- The desired trigger is command-specific: `/slot-co ...`.
- Pi supports command argument completion directly.
- A global `ctx.ui.addAutocompleteProvider()` would be unnecessarily broad for this use case.

## Proposed implementation steps

### 1. Extend command registration with `getArgumentCompletions`

Modify the existing command registration block to include a `getArgumentCompletions` function.

Planned shape:

- Input: the current argument prefix typed after `/slot-co`
- Output: a list of completion items or `null`

This keeps the existing `handler` unchanged.

### 2. Add a helper to discover branch names

Create a helper function in `.pi/extensions/slot-co.ts` that queries git for branch candidates.

Planned helper responsibilities:

- Run git in the current working directory using `pi.exec(...)`
- Return a normalized list of branch names
- Handle command failure gracefully
- Deduplicate names

Potential function signature:

```ts
async function getBranchCompletions(pi: ExtensionAPI, cwd: string, prefix: string)
```

or split into smaller helpers such as:

- `listBranchNames(...)`
- `filterBranchNames(...)`
- `toCompletionItems(...)`

### 3. Choose a git source for branches

Use git to list available branches from the current repo.

Preferred starting point:

```bash
git for-each-ref --format=%(refname:short) refs/heads refs/remotes
```

Reasons:

- Easy to parse: one branch name per line
- Includes local and remote branches
- Avoids parsing the decorated output of `git branch -a`

### 4. Normalize raw git output

Convert git output into branch candidates suitable for user completion.

Normalization rules:

- Trim whitespace
- Drop empty lines
- Remove symbolic remote HEAD aliases such as:
  - `origin/HEAD`
  - `upstream/HEAD`
- Optionally keep both local and remote branch names if they are meaningful to `slot checkout`
- Deduplicate repeated names

Open design choice to confirm during implementation:

- If both `foo` and `origin/foo` exist, should both appear?
  - Conservative first version: keep both if both are real refs
  - Alternative: prefer local `foo` and only include remote-qualified names when no local twin exists

## Filtering strategy

### First-pass recommendation

Use simple prefix matching first.

Behavior:

- Empty prefix: show a bounded list of recent/alphabetized candidates
- Non-empty prefix: show branches whose names start with the typed prefix
- If there are no prefix matches, optionally fall back to substring matching

Why this is a good first version:

- Predictable
- Easy to understand
- Likely sufficient for branch-name completion
- Minimal complexity in the extension

### Optional enhancement

If desired later, add fuzzy matching so `featx` can still find `feature/x`.

That should be considered a follow-up, not required for the first implementation.

## Ranking strategy

Suggested ordering:

1. Exact match
2. Local branches with prefix match
3. Remote branches with prefix match
4. Other fallback matches if implemented

Within each group:

- alphabetical order is acceptable for v1

Optional future improvement:

- sort by recency using branch commit date, but this is not necessary for initial implementation

## Suggestion item format

Each completion item should return the branch name as the inserted value.

Suggested item fields:

- `value`: the branch name inserted into the command
- `label`: the branch name shown in the menu
- `description`: optional marker such as `local branch` or `remote branch`

Example suggestion items:

```ts
{ value: "feature/foo", label: "feature/foo", description: "local" }
{ value: "origin/feature/foo", label: "origin/feature/foo", description: "remote" }
```

## Failure handling

Autocomplete should be non-disruptive.

If any of the following occurs:

- `ctx.cwd` is not in a git repo
- git is unavailable
- the git command exits nonzero
- output parsing fails

then `getArgumentCompletions` should return `null` or an empty list rather than notifying loudly or throwing.

Reason:

- Completion is an enhancement, not the command's core behavior
- Unexpected error popups during Tab completion would be noisy

## Performance considerations

Autocomplete is interactive, so keep it lightweight.

### Recommended initial behavior

- One git command per completion request is acceptable if branch counts are modest
- Limit returned suggestions to a reasonable max, e.g. 20-50 items

### Optional optimization

If repeated calls feel slow, add a short-lived in-memory cache:

- key: `cwd`
- value: branch list + timestamp
- ttl: e.g. 2-5 seconds

This is optional and should only be added if needed.

## TypeScript/code structure plan

### Existing code to preserve

Keep these existing functions unchanged unless needed for small type integration:

- `checkoutSlot(...)`
- `parseSlotCheckoutEnvelope(...)`
- `createFreshSessionFile(...)`
- `getDefaultSessionDir(...)`

### New code to add

Likely additions:

- `type BranchCandidate = ...` (optional)
- `async function listBranchNames(...)`
- `function filterBranchNames(...)`
- `function makeCompletionItems(...)`
- `const MAX_COMPLETIONS = ...`

### Minimal edit target

Only touch `.pi/extensions/slot-co.ts` for the initial implementation.

No additional files should be necessary.

## Testing plan

### Manual test flow in Pi

After implementation:

1. Save the extension
2. Run `/reload`
3. In a git repo with branches, test:
   - `/slot-co <Tab>`
   - `/slot-co f<Tab>`
   - `/slot-co feature/<Tab>`
4. Confirm the command handler still works after accepting a completion
5. Test from a non-git directory if practical
   - verify autocomplete fails quietly

### Expected results

- Completion menu appears for `/slot-co`
- Selected item inserts the branch name correctly
- `/slot-co <completed-branch>` still executes the existing checkout flow

## Risks / open questions

### 1. Exact `getArgumentCompletions` return shape

Before patching, confirm the precise completion item shape expected by the installed Pi version.

The docs indicate slash-command argument completion exists; implementation should match the current extension API exactly.

### 2. Remote branch insertion semantics

Need to confirm whether `slot checkout` accepts remote-qualified names as-is, or whether completions should prefer unqualified branch names when possible.

### 3. Multi-argument future compatibility

Right now `/slot-co` appears to take one branch argument.
If flags or additional args are later added, the completion logic may need to become token-aware rather than treating the full args string as one prefix.

## Implementation summary

Planned change:

- Add `getArgumentCompletions` to `/slot-co`
- Gather branch names via git in `ctx.cwd`
- Normalize and filter branch names
- Return completion items for Pi's slash-command autocomplete
- Keep the runtime checkout flow unchanged

## Out of scope

Not included in this change:

- global editor autocomplete providers
- fuzzy search beyond a simple optional fallback
- caching unless needed for responsiveness
- changes to `slot` CLI behavior
- changes to session file generation or switching
