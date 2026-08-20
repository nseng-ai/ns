# Autobranch Family Boundaries

Shared boundary contract for the provider-explicit Flow autobranch skills: `ns-flow-{gt,gs}-autobranch` and `ns-flow-{gt,gs}-branch-latest-commit`.

- Provider machine identities are `graphite` and `gh-stack`; command abbreviations are `gt` and `gs`. `gs` means the official `github/gh-stack` extension.
- Use only the selected provider command. GT skills call `ns flow gt ...`; GS skills call `ns flow gs ...`. Pi mirrors use the matching `/ns:flow:{gt,gs}:*` surface.
- Flow owns stashing, checkpoint commits, latest-commit eligibility, Git verification, and recovery reporting. These workflows do not submit, land, restack, or call whole-stack unstack.
- GS automatically runs `gh stack init <current-branch>` for an untracked non-trunk source, using gh-stack's default trunk. It refuses an untracked Git trunk before stash, branch creation, or provider mutation.
- Initialization is durable and is reported as retained when later work fails. Never parse or edit `.git/gh-stack`.
- After GS child adoption may exist, preserve source, child, and recovery branches on ambiguity. Deleting only the Git child is not a provider rollback.
- The former flat commands and skill identities are removed without compatibility aliases.
