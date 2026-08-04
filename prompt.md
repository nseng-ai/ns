## Completion instructions
After you finish the implementation:
1. Create or update the branch commit using the repo's normal workflow.
2. Then run `!ns flow submit`.

## Launch context
This branch was created from the existing local Graphite trunk and is intentionally unrelated to the caller's current stack.

It changes titles only by prefixing the existing title with [accountable]. It does not rewrite the substantive title.

 The skill explicitly instructs:

 │ “prefix the PR title with [accountable] (skip the title change if it already starts with [accountable])”

 So for PR #4094, it preserved the inaccurate wording and added the prefix. However, the skill’s final “Title honesty” check should have flagged that the
 existing title did not match the extraction-only diff. The title update behaved as designed; the consumability review missed the mismatch.

@.agents/skills/pr-make-accountable/ should alter title if it requires it substanstively