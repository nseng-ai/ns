## Completion instructions
After you finish the implementation:
1. Create or update the branch commit using the repo's normal workflow.
2. Then run `!ns flow submit`.

## Launch context
This branch was created from the existing local Graphite trunk and is intentionally unrelated to the caller's current stack.

I want to add a -f/--force flag to "ns flow cp" that will override the check to NOT check to main/master/trunk. Check it if -f